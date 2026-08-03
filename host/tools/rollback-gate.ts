/**
 * 롤백 공통 게이트 (설계 §3) — 모든 시나리오가 마지막에 통과해야 완주.
 *
 * 게이트 4단계를 호스트 HTTP 표면에 대해 실행하고 판정 기록을 돌려준다:
 *   1. 롤백 실행 → state === "RolledBack"
 *   2. 라이브 아티팩트가 직전 체크포인트(pre-apply 상태)와 **바이트 일치**
 *   3. ledger 계보 정합 — 이번 롤백이 남긴 rollback-started/-completed
 *      항목의 changesetFingerprint가 대상 세션의 fingerprint와 일치
 *   4. 재적용(동일 승인 changeset re-propose → apply)으로 계속 사용
 *      가능함을 확인 — 라이브가 롤백 직전 상태로 복귀
 *   (5.) 다중 facet 전시물이면 — 입력에 checkpointFacetFingerprints 가 있을 때만
 *      — schema·data·ui 가 **함께** 체크포인트로 돌아왔는지. UI 바이트 일치는
 *      "UI 만 돌아온" 부분 복귀를 구분하지 못한다.
 *
 * 실행 주체(run-cycle 세션 또는 smoke)가 상태 타임라인을 알고 있으므로
 * 체크포인트·changeset은 호출자가 공급한다. 기록은 rollback.json 형식
 * (아카이브 규격, 설계 §3)이다. 판정 실패는 예외가 아니라 record.passed
 * === false 로 표현한다 — 실패 자체가 dogfooding의 관찰 대상이므로.
 *
 * Library + CLI 겸용. CLI: node rollback-gate.ts <spec.json> [--out <path>]
 * (spec = RollbackGateInput JSON — base 필드 생략 시 http://localhost:8890)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface RollbackGateInput {
  /** 호스트 서버 base URL (stage 프록시 경유). */
  base: string;
  target: string;
  /** 롤백 대상 — 마지막으로 apply 된 stage 세션. */
  sessionId: string;
  /** 그 세션의 changeset fingerprint (계보 정합 판정 기준). */
  fingerprint: string;
  /** 승인 결합된 changeset 원본 (4단계 재적용에 사용). */
  approvedChangeset: unknown;
  /** 직전 체크포인트 — 롤백 후 라이브가 바이트 일치해야 하는 상태. */
  checkpointArtifacts: Record<string, string>;
  /**
   * 다중 facet 전시물 전용(선택) — 체크포인트 시점의 facet 별 fingerprint
   * (`GET /stage/targets/<t>/artifacts` 의 `fingerprints`). 공급하면 롤백 후
   * **세 facet 이 함께 되돌아왔는지**를 별도 판정한다. UI 바이트 일치만으로는
   * "UI 는 돌아왔는데 스키마는 안 돌아왔다"를 잡지 못한다.
   */
  checkpointFacetFingerprints?: Record<string, string>;
}

export interface RollbackGateRecord {
  gate: "rollback-v1";
  target: string;
  sessionId: string;
  fingerprint: string;
  checks: {
    rolledBack: boolean;
    byteIdentical: boolean;
    lineageConsistent: boolean;
    reapplied: boolean;
    /** 다중 facet 판정 — 입력에 체크포인트 fingerprint 가 있을 때만 존재. */
    facetsRestored?: boolean;
  };
  /** 각 체크의 실패 상세 (성공 시 생략). */
  detail: Record<string, string>;
  /** 4단계 재적용이 만든 stage 세션 — 호출자의 후속 롤백/정리용. */
  reappliedSessionId: string | null;
  passed: boolean;
  verifiedAt: string;
}

async function http(base: string, method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${method} ${path} — non-JSON response (status ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`${method} ${path} — HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

/** 아티팩트 레코드 바이트 일치 — 키 집합과 각 내용의 완전 일치. */
function byteIdentical(a: Record<string, string>, b: Record<string, string>): string | null {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (JSON.stringify(keysA) !== JSON.stringify(keysB)) {
    return `artifact key sets differ: ${JSON.stringify(keysA)} vs ${JSON.stringify(keysB)}`;
  }
  for (const key of keysA) {
    if (a[key] !== b[key]) {
      return `artifact ${key} differs (${Buffer.byteLength(a[key], "utf8")}B vs ${Buffer.byteLength(b[key], "utf8")}B)`;
    }
  }
  return null;
}

export async function runRollbackGate(input: RollbackGateInput): Promise<RollbackGateRecord> {
  const { base, target, sessionId, fingerprint } = input;
  const checks = { rolledBack: false, byteIdentical: false, lineageConsistent: false, reapplied: false };
  const detail: Record<string, string> = {};

  // 롤백 직전 상태 스냅샷 (4단계 재적용 판정 기준) + ledger 기준선.
  const beforeRollback: Record<string, string> = (await http(base, "GET", `/stage/targets/${target}/artifacts`)).artifacts;
  const ledgerBefore = await http(base, "GET", "/stage/ledger");
  const baselineSeq = Array.isArray(ledgerBefore) && ledgerBefore.length > 0
    ? Math.max(...ledgerBefore.map((e: any) => e.seq))
    : 0;

  // 1. 롤백 실행
  try {
    const rollback = await http(base, "POST", `/stage/sessions/${sessionId}/rollback`, { actor: "rollback-gate" });
    if (rollback.state === "RolledBack") checks.rolledBack = true;
    else detail.rolledBack = `expected state RolledBack, got ${JSON.stringify(rollback)}`;
  } catch (err) {
    detail.rolledBack = String(err instanceof Error ? err.message : err);
  }

  // 2. 체크포인트 바이트 일치 (+ 다중 facet 이면 facet 동반 복귀 판정)
  if (checks.rolledBack) {
    const world = await http(base, "GET", `/stage/targets/${target}/artifacts`);
    const mismatch = byteIdentical(world.artifacts, input.checkpointArtifacts);
    if (mismatch === null) checks.byteIdentical = true;
    else detail.byteIdentical = mismatch;

    if (input.checkpointFacetFingerprints) {
      const live: Record<string, string> = world.fingerprints ?? {};
      const drifted = Object.entries(input.checkpointFacetFingerprints)
        .filter(([facet, fp]) => live[facet] !== fp)
        .map(([facet, fp]) => `${facet}: ${live[facet] ?? "(absent)"} ≠ ${fp}`);
      checks.facetsRestored = drifted.length === 0;
      if (drifted.length > 0) detail.facetsRestored = `facets not restored — ${drifted.join("; ")}`;
    }
  }

  // 3. ledger 계보 정합 — 이번 게이트가 남긴 항목만 (seq > baseline)
  if (checks.rolledBack) {
    const ledger = await http(base, "GET", "/stage/ledger");
    const entries = (Array.isArray(ledger) ? ledger : []).filter(
      (e: any) => e.target === target && e.seq > baselineSeq,
    );
    const kinds = entries.map((e: any) => e.kind);
    const kindsOk = JSON.stringify(kinds) === JSON.stringify(["rollback-started", "rollback-completed"]);
    const fpOk = entries.every((e: any) => e.changesetFingerprint === fingerprint);
    if (kindsOk && fpOk) checks.lineageConsistent = true;
    else detail.lineageConsistent = `kinds=${JSON.stringify(kinds)}, fingerprintsOk=${fpOk} (want fp ${fingerprint})`;
  }

  // 4. 재적용 — 동일 승인 changeset이 다시 apply 되고 라이브가 복귀
  let reappliedSessionId: string | null = null;
  if (checks.rolledBack) {
    try {
      const propose = await http(base, "POST", `/stage/targets/${target}/changesets`, input.approvedChangeset);
      reappliedSessionId = propose.sessionId ?? null;
      const apply = await http(base, "POST", `/stage/sessions/${propose.sessionId}/apply`, {
        actor: "rollback-gate",
        evidence: { observed: "re-apply after rollback gate" },
      });
      if (apply.state !== "Applied") {
        detail.reapplied = `expected state Applied, got ${JSON.stringify(apply)}`;
      } else {
        const live: Record<string, string> = (await http(base, "GET", `/stage/targets/${target}/artifacts`)).artifacts;
        const mismatch = byteIdentical(live, beforeRollback);
        if (mismatch === null) checks.reapplied = true;
        else detail.reapplied = `re-applied live differs from pre-rollback state: ${mismatch}`;
      }
    } catch (err) {
      detail.reapplied = String(err instanceof Error ? err.message : err);
    }
  }

  return {
    gate: "rollback-v1",
    target,
    sessionId,
    fingerprint,
    checks,
    detail,
    reappliedSessionId,
    passed:
      checks.rolledBack &&
      checks.byteIdentical &&
      checks.lineageConsistent &&
      checks.reapplied &&
      checks.facetsRestored !== false,
    verifiedAt: new Date().toISOString(),
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!)) {
  const specPath = process.argv[2];
  if (!specPath || specPath.startsWith("--")) {
    console.error("Usage: node rollback-gate.ts <spec.json> [--out <rollback.json>]");
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  spec.base ??= "http://localhost:8890";
  const outFlag = process.argv.indexOf("--out");
  const record = await runRollbackGate(spec);
  const serialized = JSON.stringify(record, null, 2);
  if (outFlag >= 0 && process.argv[outFlag + 1]) {
    mkdirSync(dirname(process.argv[outFlag + 1]), { recursive: true });
    writeFileSync(process.argv[outFlag + 1], serialized);
  }
  console.log(serialized);
  process.exit(record.passed ? 0 : 1);
}
