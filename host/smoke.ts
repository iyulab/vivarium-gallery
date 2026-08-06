/**
 * gallery host scripted round-trip smoke — dashboard-builder smoke.ts 의
 * 동등성 이식본 (G1 게이트). 단언 의미는 원본 11건과 1:1 동일해야 하며,
 * 이 스모크가 전부 통과하는 것이 dashboard-builder 은퇴 게이트의 전제다.
 *
 * dashboard 전시물을 구동 대상으로 고정한다 — scripted provider 의 결정적
 * 응답("카드 추가"→New Metric, refine→Active Users)이 단언에 박혀 있기
 * 때문. 전시물-무관 스모크 훅은 두 번째 전시물이 생길 때 수요-주도로
 * 일반화한다 (선제 일반화 금지 — 업스트림 확장 정책과 동일 원칙).
 *
 * Prerequisite: stage-host (8891) + host/server.ts (8890, exhibit=dashboard,
 * MODEL_PROVIDER 미설정 — 결정성은 scripted provider 에 의존).
 *
 * 단언 12는 갤러리 고유 확장 — 롤백 공통 게이트(tools/rollback-gate.ts,
 * 설계 §3)의 4단계 판정을 scripted provider로 결정적으로 검증한다.
 *
 * 단언 13은 갤러리 정적 인덱스(index/build-index.ts) 생성을, 단언 14는
 * 렌더 검증(tools/render-check.ts — cycle-85 갭 후속)을 검증한다. 단언 15는
 * 그 생성이 워킹트리를 더럽히지 않는다는 README 의 약속을 판정한다 — 13이
 * 보는 것은 생성기의 결정성이고, 커밋본과의 일치는 그 밖에 있다. 단언 16은
 * 렌더 판정이 **마운트 이후**까지 가는지를 본다. 단언 17은 총량 하한이 값 실종을
 * 잡는 범위가 **화면 크기**에 달렸음을 수치로 고정하고, 단언 18은 **전 전시물의
 * 자리 선언이 실제로 돌아가는지**를 본다 — 게이트마다 전시물이 하나로 고정돼 있어
 * 아무도 안 돌리는 선언이 생길 수 있고, 그런 선언은 셀렉터가 낡는 순간 조용히 0을
 * 판정하면서 초록으로 남는다.
 *
 * Usage: node host/smoke.ts
 * Exit 0 + "smoke: 18/18 PASS" on success; exit 1 otherwise.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactFingerprint } from "@vivariumjs/changeset";
import exhibit from "../exhibits/dashboard/exhibit.ts";
import { runRollbackGate } from "./tools/rollback-gate.ts";
import { renderFor, undeclaredArtifacts } from "./tools/render-check.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const TARGET = exhibit.target;
const ARTIFACT_ID = exhibit.primaryArtifactId;
const SEED_CONTENT = exhibit.artifacts[ARTIFACT_ID];
const TOTAL = 19;

// Phase 6.e turn-cost instrumentation gate: every agent turn this smoke
// drives must land in GET /agent/metrics (assertion 11).
let agentTurnsDriven = 0;

// Assertions 8-10 regression-seal the draft-refine → apply path fixed in
// @vivariumjs/agent 0.0.2 (refine changesets declare the LIVE base — a
// defect this sample found and the upstream fixed). On an agent
// < 0.0.2 install they would fail by design → explicitly SKIPPED, never
// silent.
const agentVersion: string = JSON.parse(
  readFileSync(new URL("../node_modules/@vivariumjs/agent/package.json", import.meta.url), "utf8"),
).version;
const agentHasLiveBase = ((): boolean => {
  const [maj, min, pat] = agentVersion.split(".").map(Number);
  return maj > 0 || min > 0 || pat >= 2;
})();

let passCount = 0;
let skipCount = 0;

function ok(n: number, desc: string): void {
  passCount++;
  console.log(`ok ${n} - ${desc}`);
}

function skip(n: number, desc: string): void {
  skipCount++;
  console.log(`SKIP ${n} - ${desc} (agent ${agentVersion} < 0.0.2 — v0.0.2 게시·설치 후 활성화)`);
}

function fail(n: number, desc: string, detail: unknown): never {
  console.error(`FAIL ${n} - ${desc}`);
  console.error(`  detail: ${detail instanceof Error ? detail.stack ?? detail.message : JSON.stringify(detail)}`);
  process.exitCode = 1;
  process.exit(1);
}

/** POST that expects a 2xx response; throws with response body context otherwise. */
async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`POST ${path} — non-JSON response (status ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`POST ${path} — HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** POST that does NOT throw on non-2xx — used where a refusal is the expected outcome. */
async function postRaw(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`POST ${path} — non-JSON response (status ${res.status}): ${text.slice(0, 300)}`);
  }
  return { status: res.status, json };
}

async function get(path: string): Promise<any> {
  const res = await fetch(BASE + path);
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`GET ${path} — non-JSON response (status ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`GET ${path} — HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main(): Promise<void> {
  // ── 1. baseline the ledger, then seed the target, confirm the live artifacts
  //    are exactly the seed ──
  // Baseline (BEFORE seeding) matters because a long-lived stage-host
  // accumulates ledger entries across repeated smoke runs — assertion 7 must
  // only judge entries this run appends (seq > baselineSeq). Same reasoning
  // for turn metrics (assertion 11, turn index > baselineTurns).
  let n = 1;
  let baselineSeq = 0;
  let baselineTurns = 0;
  try {
    const metricsBaseline = await get("/agent/metrics");
    baselineTurns = Array.isArray(metricsBaseline.turns) ? metricsBaseline.turns.length : 0;
    const baselineLedger = await get("/stage/ledger");
    baselineSeq = Array.isArray(baselineLedger) && baselineLedger.length > 0
      ? Math.max(...baselineLedger.map((e: any) => e.seq))
      : 0;
    await post("/stage/targets", { target: TARGET, artifacts: { [ARTIFACT_ID]: SEED_CONTENT } });
    const seeded = await get(`/stage/targets/${TARGET}/artifacts`);
    if (seeded.artifacts?.[ARTIFACT_ID] !== SEED_CONTENT) {
      throw new Error(`seeded artifact content mismatch — got ${JSON.stringify(seeded.artifacts)}`);
    }
    ok(n, "POST /stage/targets 시드 → GET .../artifacts가 전시물 시드 반환");
  } catch (err) {
    fail(n, "POST /stage/targets 시드 → GET .../artifacts가 전시물 시드 반환", err);
  }

  // ── 2. agent turn 1 — a validated, fingerprinted proposal ────────────────
  n = 2;
  let proposal: any;
  try {
    const turn1 = await post("/agent/session", {
      intent: "카드를 하나 추가해줘",
      editContext: null,
      artifacts: [{ artifactId: ARTIFACT_ID, content: SEED_CONTENT }],
    });
    agentTurnsDriven++;
    if (!turn1.proposal) {
      throw new Error(`no proposal — outcome.status=${turn1.outcome?.status}, retries=${JSON.stringify(turn1.outcome?.retries)}`);
    }
    if (!String(turn1.proposal.fingerprint).startsWith("sha256:")) {
      throw new Error(`fingerprint does not start with sha256: — got ${turn1.proposal.fingerprint}`);
    }
    proposal = turn1.proposal;
    ok(n, "POST /agent/session(scripted) → proposal 존재, fingerprint가 sha256: 접두");
  } catch (err) {
    fail(n, "POST /agent/session(scripted) → proposal 존재, fingerprint가 sha256: 접두", err);
  }

  // ── 3. propose the (still unapproved) changeset to stage ─────────────────
  n = 3;
  let unapprovedSessionId: string;
  try {
    const propose = await post(`/stage/targets/${TARGET}/changesets`, proposal.changeset);
    if (!propose.sessionId || !propose.preview) {
      throw new Error(`missing sessionId/preview — got ${JSON.stringify(propose)}`);
    }
    const previewContent = propose.preview[ARTIFACT_ID];
    if (typeof previewContent !== "string" || !previewContent.includes("New Metric")) {
      throw new Error(`preview does not contain the new card content — got ${JSON.stringify(previewContent)}`);
    }
    unapprovedSessionId = propose.sessionId;
    ok(n, `POST /stage/targets/${TARGET}/changesets → sessionId·preview 반환 (프리뷰에 새 카드 내용 포함)`);
  } catch (err) {
    fail(n, `POST /stage/targets/${TARGET}/changesets → sessionId·preview 반환 (프리뷰에 새 카드 내용 포함)`, err);
  }

  // ── 4. apply the UNAPPROVED session → the fingerprint-approval gate refuses (409) ──
  n = 4;
  try {
    const { status, json } = await postRaw(`/stage/sessions/${unapprovedSessionId!}/apply`, {
      actor: "smoke",
      evidence: { observed: "preview rendered" },
    });
    if (status !== 409 || json.reason !== "FingerprintGate") {
      throw new Error(
        `expected 409 FingerprintGate (unapproved apply must be refused), got ${status}: ${JSON.stringify(json)}`,
      );
    }
    ok(n, "apply 전 미승인 상태로 POST /sessions/{id}/apply → 409 FingerprintGate (게이트 실증)");
  } catch (err) {
    fail(n, "apply 전 미승인 상태로 POST /sessions/{id}/apply → 409 FingerprintGate (게이트 실증)", err);
  }

  // ── 5. bind an approval to the exact fingerprint, re-propose, apply → 200 ──
  n = 5;
  let approvedSessionId: string;
  try {
    const approved = structuredClone(proposal.changeset);
    approved.approvals = [
      { fingerprint: proposal.fingerprint, approvedBy: "smoke-reviewer", approvedAt: new Date().toISOString() },
    ];
    const propose = await post(`/stage/targets/${TARGET}/changesets`, approved);
    const apply = await post(`/stage/sessions/${propose.sessionId}/apply`, {
      actor: "smoke",
      evidence: { observed: "preview rendered" },
    });
    if (apply.state !== "Applied") {
      throw new Error(`expected state Applied, got ${JSON.stringify(apply)}`);
    }
    const expectedContent = proposal.changeset.patches.ui[0].newContent;
    const live = await get(`/stage/targets/${TARGET}/artifacts`);
    if (live.artifacts?.[ARTIFACT_ID] !== expectedContent) {
      throw new Error(`live artifact not updated to proposal's newContent — got ${JSON.stringify(live.artifacts)}`);
    }
    approvedSessionId = propose.sessionId;
    ok(n, "승인 결합 후 apply → 200, GET .../artifacts가 newContent로 갱신");
  } catch (err) {
    fail(n, "승인 결합 후 apply → 200, GET .../artifacts가 newContent로 갱신", err);
  }

  // ── 6. rollback returns the target to its pre-apply (seed) state ─────────
  n = 6;
  try {
    const rollback = await post(`/stage/sessions/${approvedSessionId!}/rollback`, { actor: "smoke" });
    if (rollback.state !== "RolledBack") {
      throw new Error(`expected state RolledBack, got ${JSON.stringify(rollback)}`);
    }
    const live = await get(`/stage/targets/${TARGET}/artifacts`);
    if (live.artifacts?.[ARTIFACT_ID] !== SEED_CONTENT) {
      throw new Error(`live artifact not restored to seed after rollback — got ${JSON.stringify(live.artifacts)}`);
    }
    ok(n, "POST /sessions/{id}/rollback → 200, artifacts가 시드로 복귀");
  } catch (err) {
    fail(n, "POST /sessions/{id}/rollback → 200, artifacts가 시드로 복귀", err);
  }

  // ── 7. the ledger carries the append-only trail of THIS RUN's apply/rollback ──
  n = 7;
  try {
    const ledger = await get("/stage/ledger");
    if (!Array.isArray(ledger)) {
      throw new Error(`expected ledger to be an array, got ${JSON.stringify(ledger)}`);
    }
    const entries = ledger.filter((e: any) => e.target === TARGET && e.seq > baselineSeq);
    const kinds = entries.map((e: any) => e.kind);
    const expectedKinds = ["apply-started", "apply-completed", "rollback-started", "rollback-completed"];
    const kindsOk = JSON.stringify(kinds) === JSON.stringify(expectedKinds);
    const fingerprintsOk = entries.every((e: any) => e.changesetFingerprint === proposal.fingerprint);
    const seqAscending = entries.every((e: any, i: number) => i === 0 || e.seq > entries[i - 1].seq);
    if (!kindsOk || !fingerprintsOk || !seqAscending) {
      throw new Error(
        `ledger trail (seq > baseline ${baselineSeq}) incomplete/out of order — kinds=${JSON.stringify(kinds)}, ` +
          `fingerprintsOk=${fingerprintsOk}, seqAscending=${seqAscending}`,
      );
    }
    ok(n, "GET /ledger → 이번 실행분(seq>baseline)에 apply·rollback 흔적 존재 (순서·fingerprint 일치)");
  } catch (err) {
    fail(n, "GET /ledger → 이번 실행분(seq>baseline)에 apply·rollback 흔적 존재 (순서·fingerprint 일치)", err);
  }

  // ── 8. draft-refine: the refined changeset declares the LIVE base (seed),
  //    not the unapplied turn-1 projection ──
  n = 8;
  let refined: any;
  if (!agentHasLiveBase) {
    skip(n, "refine 제안의 ui-artifact base가 라이브(시드)에 앵커");
  } else {
    try {
      const turn2 = await post("/agent/refine", { instruction: "새 카드 이름을 바꿔줘" });
      agentTurnsDriven++;
      if (!turn2.proposal) {
        throw new Error(`no refined proposal — outcome=${JSON.stringify(turn2.outcome)}`);
      }
      refined = turn2.proposal;
      const baseState = refined.changeset.provenance.baseState as Array<Record<string, string>>;
      const uiBase = baseState.find((e) => e.kind === "ui-artifact" && e.ref === ARTIFACT_ID);
      const seedFp = artifactFingerprint(SEED_CONTENT);
      if (uiBase?.fingerprint !== seedFp) {
        throw new Error(`refined changeset must declare the live seed as base — got ${uiBase?.fingerprint}, want ${seedFp}`);
      }
      const lineage = baseState.find((e) => e.kind === "changeset");
      if (!lineage || lineage.fingerprint !== proposal.fingerprint) {
        throw new Error(`lineage entry must anchor to turn 1 — got ${JSON.stringify(lineage)}`);
      }
      ok(n, "refine 제안의 ui-artifact base가 라이브(시드)에 앵커, 계보는 changeset 항목으로");
    } catch (err) {
      fail(n, "refine 제안의 ui-artifact base가 라이브(시드)에 앵커, 계보는 changeset 항목으로", err);
    }
  }

  // ── 9. the refined (turn-2) changeset applies WITHOUT turn 1 ever staying
  //    applied — the exact flow that 409'd (DriftGate) before agent 0.0.2 ──
  n = 9;
  let refinedSessionId: string | null = null;
  if (!agentHasLiveBase) {
    skip(n, "미적용 draft 체인의 최종 refine이 apply 성공");
  } else {
    try {
      const approved = structuredClone(refined.changeset);
      approved.approvals = [
        { fingerprint: refined.fingerprint, approvedBy: "smoke-reviewer", approvedAt: new Date().toISOString() },
      ];
      const propose = await post(`/stage/targets/${TARGET}/changesets`, approved);
      const apply = await post(`/stage/sessions/${propose.sessionId}/apply`, {
        actor: "smoke",
        evidence: { observed: "refined preview rendered" },
      });
      if (apply.state !== "Applied") {
        throw new Error(`expected state Applied, got ${JSON.stringify(apply)}`);
      }
      const live = await get(`/stage/targets/${TARGET}/artifacts`);
      const expected = refined.changeset.patches.ui[0].newContent;
      if (live.artifacts?.[ARTIFACT_ID] !== expected) {
        throw new Error(`live artifact not updated to the refined content`);
      }
      refinedSessionId = propose.sessionId;
      ok(n, "미적용 draft 체인의 최종 refine이 apply 성공 (0.0.1에서 409였던 경로)");
    } catch (err) {
      fail(n, "미적용 draft 체인의 최종 refine이 apply 성공 (0.0.1에서 409였던 경로)", err);
    }
  }

  // ── 10. re-base: after an apply the host passes baseArtifacts, and the next
  //    refine declares THAT state — then restore the seed for idempotency ──
  n = 10;
  if (!agentHasLiveBase) {
    skip(n, "apply 후 baseArtifacts 재기저 refine이 새 라이브를 base로 선언");
  } else {
    try {
      const live = await get(`/stage/targets/${TARGET}/artifacts`);
      // agent 0.0.3 no-op 게이트: 동일-콘텐츠 refine 은 게이트가 거부하므로
      // (0.0.2 시절의 "이름 유지" 지시는 이제 exhausted 가 정답), 턴 3 도
      // 실변경 지시다 — scripted provider 는 base-aware 로 세 번째 변형을 낸다.
      const turn3 = await post("/agent/refine", {
        instruction: "카드 이름을 더 구체적으로 바꿔줘",
        baseArtifacts: live.artifacts,
      });
      agentTurnsDriven++;
      if (!turn3.proposal) {
        throw new Error(`no turn-3 proposal — outcome=${JSON.stringify(turn3.outcome)}`);
      }
      const baseState = turn3.proposal.changeset.provenance.baseState as Array<Record<string, string>>;
      const uiBase = baseState.find((e) => e.kind === "ui-artifact" && e.ref === ARTIFACT_ID);
      const liveFp = artifactFingerprint(live.artifacts[ARTIFACT_ID]);
      const seedFp = artifactFingerprint(SEED_CONTENT);
      if (uiBase?.fingerprint !== liveFp || uiBase.fingerprint === seedFp) {
        throw new Error(`re-based changeset must declare the post-apply live state — got ${uiBase?.fingerprint}, want ${liveFp}`);
      }
      // Restore the seed so repeated runs against a long-lived stage-host
      // start from the same live state (mirrors the assertion-6 rollback).
      const rollback = await post(`/stage/sessions/${refinedSessionId!}/rollback`, { actor: "smoke" });
      if (rollback.state !== "RolledBack") {
        throw new Error(`cleanup rollback failed — ${JSON.stringify(rollback)}`);
      }
      ok(n, "apply 후 baseArtifacts 재기저 refine이 새 라이브를 base로 선언 (+시드 복원)");
    } catch (err) {
      fail(n, "apply 후 baseArtifacts 재기저 refine이 새 라이브를 base로 선언 (+시드 복원)", err);
    }
  }

  // ── 11. turn-cost instrumentation (Phase 6.e) — every agent turn this
  //    run drove has a metrics record with latency + artifact size ─────────
  n = 11;
  try {
    const all = (await get("/agent/metrics")).turns;
    const turns = Array.isArray(all) ? all.slice(baselineTurns) : null;
    if (!turns || turns.length !== agentTurnsDriven) {
      throw new Error(`expected ${agentTurnsDriven} new turn metric(s) beyond baseline ${baselineTurns}, got ${turns ? turns.length : typeof all}`);
    }
    for (const t of turns) {
      if (typeof t.latencyMs !== "number" || t.latencyMs < 0) {
        throw new Error(`turn ${t.turn}: bad latencyMs ${t.latencyMs}`);
      }
      if (!Array.isArray(t.providerCalls) || t.providerCalls.length < 1) {
        throw new Error(`turn ${t.turn}: no provider calls recorded`);
      }
      if (t.status === "validated" && !(t.artifactBytes > 0 && t.artifactLines > 0)) {
        throw new Error(`turn ${t.turn}: validated but artifact size missing (${t.artifactBytes}B/${t.artifactLines}L)`);
      }
      const tokens = t.outputTokens === null ? "tokens=n/a(scripted)" : `tokens=${t.inputTokens}in/${t.outputTokens}out`;
      console.log(
        `  metrics: turn ${t.turn} ${t.endpoint} ${t.status} ${t.latencyMs}ms calls=${t.providerCalls.length} artifact=${t.artifactBytes}B/${t.artifactLines}L ${tokens}`,
      );
    }
    ok(n, `GET /agent/metrics — 구동한 ${agentTurnsDriven}턴 전부 비용 기록(지연·provider 호출·아티팩트 크기)`);
  } catch (err) {
    fail(n, "GET /agent/metrics — 턴 비용 계측 기록", err);
  }

  // ── 12. 롤백 공통 게이트 (설계 §3) — 게이트 도구의 4단계 판정을
  //    scripted 턴-1 changeset으로 결정적으로 검증 ──────────────────────────
  n = 12;
  try {
    // 시드 상태(단언 10 정리 후)에서 턴-1 changeset을 승인·적용해 게이트의
    // 전제(마지막 apply 존재)를 만든다.
    const approved = structuredClone(proposal.changeset);
    approved.approvals = [
      { fingerprint: proposal.fingerprint, approvedBy: "smoke-reviewer", approvedAt: new Date().toISOString() },
    ];
    const propose = await post(`/stage/targets/${TARGET}/changesets`, approved);
    const apply = await post(`/stage/sessions/${propose.sessionId}/apply`, {
      actor: "smoke",
      evidence: { observed: "gate precondition apply" },
    });
    if (apply.state !== "Applied") throw new Error(`gate precondition apply failed — ${JSON.stringify(apply)}`);

    const record = await runRollbackGate({
      base: BASE,
      target: TARGET,
      sessionId: propose.sessionId,
      fingerprint: proposal.fingerprint,
      approvedChangeset: approved,
      checkpointArtifacts: { [ARTIFACT_ID]: SEED_CONTENT },
    });
    if (!record.passed) {
      throw new Error(`rollback gate failed — checks=${JSON.stringify(record.checks)} detail=${JSON.stringify(record.detail)}`);
    }
    // 게이트 4단계가 재적용 상태로 끝나므로, 반복 실행 멱등성을 위해 시드 복원.
    if (!record.reappliedSessionId) throw new Error("gate passed but reappliedSessionId missing");
    const cleanup = await post(`/stage/sessions/${record.reappliedSessionId}/rollback`, { actor: "smoke" });
    if (cleanup.state !== "RolledBack") throw new Error(`cleanup rollback failed — ${JSON.stringify(cleanup)}`);
    ok(n, "롤백 공통 게이트 — 롤백·바이트 일치·계보 정합·재적용 4단계 전부 PASS (+시드 복원)");
  } catch (err) {
    fail(n, "롤백 공통 게이트 — 롤백·바이트 일치·계보 정합·재적용 4단계 전부 PASS (+시드 복원)", err);
  }

  // ── 13. 갤러리 정적 인덱스 — 전 전시물이 gallery.html 에 등재 ────────────
  n = 13;
  try {
    const { buildIndex } = await import("../index/build-index.ts");
    const outPath = await buildIndex();
    const html = readFileSync(outPath, "utf8");
    // 기대 목록은 exhibits/ 에서 파생한다 — 하드코딩하면 새 전시물이 인덱스에서
    // 누락돼도 게이트가 통과한다(실제로 4번째 전시물에서 그럴 뻔했다).
    const exhibitsDir = new URL("../exhibits/", import.meta.url);
    const names = readdirSync(exhibitsDir).filter((name) =>
      existsSync(new URL(`${name}/exhibit.ts`, exhibitsDir)),
    );
    const missing = names.filter((name) => !html.includes(`<code>${name}</code>`));
    if (names.length === 0) throw new Error("no exhibits found — the expectation list would be vacuous");
    if (missing.length > 0) {
      throw new Error(`gallery.html missing exhibit section(s): ${missing.join(", ")}`);
    }
    // 결정성: 이 게이트는 커밋되는 파일을 재생성한다. 입력이 그대로인데 바이트가
    // 달라지면 게이트를 돌 때마다 워킹트리가 더러워지고, 커밋 직전에 게이트를
    // 돌리는 관례상 그 diff 를 사람이 매번 커밋하거나 되돌려야 한다. 시각 같은
    // 입력 무관 값이 다시 새어 들어오면 여기서 잡힌다.
    await buildIndex();
    const again = readFileSync(outPath, "utf8");
    if (again !== html) {
      throw new Error("build-index is not deterministic — re-running it changed the committed artifact");
    }
    // 스크린샷 없는 run 은 **적혀야 한다**. 이전에는 이미지 카드만 조용히
    // 빠져서, 불완전한 아카이브가 완전한 것과 구별되지 않았다. 지금 이 조건은
    // 실제로 비어 있지 않다(스크린샷 없는 run 이 존재한다). 언젠가 전부
    // 채워지면 이 갈래는 공허해지지만, 그때는 아카이버가 입구에서 막고 있다.
    const { runsWithoutScreenshot } = await import("../index/build-index.ts");
    const missingShots = runsWithoutScreenshot();
    const unmarked = missingShots.filter((dir) => {
      const runLabel = dir.split("/").pop()!;
      const card = html.split("<article class=\"run\">").find((c) => c.includes(`<b>${runLabel}</b>`));
      return !card || !card.includes('data-screenshot="missing"');
    });
    if (unmarked.length > 0) {
      throw new Error(`runs without a screenshot are silently downgraded, not marked: ${unmarked.join(", ")}`);
    }
    ok(
      n,
      `build-index → gallery.html 생성(결정적), 전시물 ${names.length}종 섹션 전부 등재` +
        ` (스크린샷 없는 run ${missingShots.length}건은 표기됨)`,
    );
  } catch (err) {
    fail(n, "build-index → gallery.html 생성(결정적), 전 전시물 섹션 등재 + 스크린샷 부재 표기", err);
  }

  // ── 14. 렌더 검증 — 정상 시드 통과 / 기대-invoke 불일치·실행 예외 감지 ──
  n = 14;
  try {
    const { checkRender } = await import("./tools/render-check.ts");
    // 기대는 **전시물이 선언한다**. 여기 리터럴을 두면 자리를 가진 전시물을 더할 때마다
    // 게이트를 고쳐야 하고, 그것은 계약이 선언한 불변식(디렉터리 추가만으로 전시물이
    // 는다)을 깨뜨린다.
    const declared = renderFor(exhibit, ARTIFACT_ID);
    if (!declared?.expectInvokes?.length) {
      throw new Error("전시물이 기대 invoke 를 선언하지 않았다 — 이 단언은 선언이 있어야 성립한다");
    }
    const good = await checkRender(SEED_CONTENT, exhibit.capabilities, declared);
    if (!good.ok) throw new Error(`seed must pass render check — ${good.errors.join(" | ")}`);
    // cycle-85 감지 사례: 기대 capability(dataset)가 invoke 되지 않으면 FAIL.
    // 대조군은 **일부러 틀린 이름**을 준다 — 이것까지 선언에서 읽으면 이 단언이
    // 아무것도 구별하지 않는다.
    const wrongInvoke = await checkRender(SEED_CONTENT, exhibit.capabilities, { expectInvokes: ["dashboard.dataset"] });
    if (wrongInvoke.ok || !wrongInvoke.errors.some((e) => e.includes("not invoked"))) {
      throw new Error(`expectInvokes mismatch must fail — got ${JSON.stringify(wrongInvoke)}`);
    }
    const broken = await checkRender(`export default async function mount(){ throw new Error("boom"); }`, []);
    if (broken.ok || !broken.errors.some((e) => e.includes("mount threw"))) {
      throw new Error(`throwing artifact must fail — got ${JSON.stringify(broken)}`);
    }
    ok(n, "render-check — 정상 시드 통과, 기대-invoke 불일치·mount 예외는 FAIL (cycle-85 갭 감지)");
  } catch (err) {
    fail(n, "render-check — 정상 시드 통과, 기대-invoke 불일치·mount 예외는 FAIL (cycle-85 갭 감지)", err);
  }

  // ── 15. 게이트가 워킹트리를 더럽히지 않는다 (커밋본 == 생성물) ──────────
  // 단언 13 이 보는 것은 생성기의 **결정성**뿐이다 — buildIndex 를 두 번 돌려
  // 서로 비교하므로, 두 산출물이 서로 같기만 하면 그것이 **체크아웃된 파일**과
  // 달라도 통과한다. README 가 약속하는 것은 그쪽이고, 그 약속이 판정이 아니라
  // 주장으로만 있었기 때문에 서로 다른 원인으로 두 번 깨졌다. 여기서 약속을
  // 판정으로 만든다: 게이트가 재생성한 뒤 그 산출물이 워킹트리에서 깨끗한가.
  n = 15;
  try {
    const { buildIndex } = await import("../index/build-index.ts");
    const outPath = await buildIndex();
    const repoRoot = fileURLToPath(new URL("../", import.meta.url));
    const tracked = relative(repoRoot, outPath).split(sep).join("/");

    let porcelain: string;
    try {
      porcelain = execFileSync("git", ["status", "--porcelain", "--", tracked], {
        cwd: repoRoot,
        encoding: "utf8",
      });
    } catch (err) {
      // 판정 대상이 "생성 후 워킹트리 상태"이므로 git 없이는 판정할 수 없다.
      // 조용히 통과시키지 않는다 — 판정하는 코드는 자기가 판정하지 못하는
      // 경우를 말해야 한다.
      throw new Error(
        `cannot judge the clean-tree promise — git is unavailable here ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      );
    }

    // porcelain 은 `XY <path>` — X 는 인덱스 대 HEAD, **Y 는 워킹트리 대
    // 인덱스**다. 판정 대상은 Y 뿐이다: 이미 stage 된 재생성분은 사람이
    // 커밋하려고 올린 것이지 게이트가 만든 오염이 아니다. 반면 아무도
    // 건드리지 않았는데 재생성이 파일을 바꿨다면 그것이 이 단언이 잡을 것이다.
    const worktreeState = porcelain.length > 1 ? porcelain[1] : " ";
    if (worktreeState !== " ") {
      throw new Error(
        `regenerating ${tracked} left the working tree dirty: ${porcelain.trim()} — ` +
          `the generated bytes differ from the checked-out file (line endings are the ` +
          `usual cause; declare them in .gitattributes), or the committed artifact is stale`,
      );
    }
    ok(n, `${tracked} 재생성 후 워킹트리 청결 — 생성물이 체크아웃본과 바이트 동일`);
  } catch (err) {
    fail(n, "build-index 재생성 후 워킹트리 청결 (커밋본 == 생성물)", err);
  }

  // ── 16. 렌더 판정이 마운트에서 멈추지 않는다 ───────────
  // 단언 14 까지가 보는 것은 전부 **마운트 시점**의 성질이다. 그래서 화면은
  // 그려지지만 누르면 아무 일도 일어나지 않는 UI 가 전부 통과한다. 이 단언은
  // 그 사각을 고정한다: 정상 아티팩트와 파손된 두 변형이 마운트 시점에는
  // **완전히 동일하게 보이고**, 이벤트를 하나 보내면 갈린다.
  //
  // 변형은 실제 전시물 시드에서 파생한다 — 손으로 쓴 픽스처는 시드가 바뀌어도
  // 그대로라 게이트가 실물에서 멀어진다. 치환이 실제로 일어났는지 먼저
  // 확인한다(치환 실패 = 아무것도 시험하지 않는 초록).
  n = 16;
  try {
    const { checkRender } = await import("./tools/render-check.ts");
    const formExhibit = (await import("../exhibits/form-survey/exhibit.ts")).default;
    const { SEED_CONTENT: FORM_SEED } = await import("../exhibits/form-survey/seed.ts");

    const listenerTypo = FORM_SEED.replace('form.addEventListener("submit"', 'form.addEventListener("submitt"');
    const capabilityTypo = FORM_SEED.replace('api.invoke("survey.submit"', 'api.invoke("survey.submitt"');
    if (listenerTypo === FORM_SEED || capabilityTypo === FORM_SEED) {
      throw new Error("fixture derivation failed — the seed no longer contains the substituted text");
    }

    // ① 마운트 시점에는 셋이 구별되지 않는다 — 이것이 갭 그 자체다.
    const mountOnly = await Promise.all(
      [FORM_SEED, listenerTypo, capabilityTypo].map((src) => checkRender(src, formExhibit.capabilities)),
    );
    const signature = (r: (typeof mountOnly)[number]): string =>
      `${r.ok}|${r.childCount}|${r.textLength}|${r.invoked.join(",")}|${r.errors.join(",")}`;
    if (new Set(mountOnly.map(signature)).size !== 1) {
      throw new Error(
        `precondition changed — mount-time judgment now distinguishes the variants: ${mountOnly.map(signature).join(" / ")}`,
      );
    }

    // ② 상호작용을 하나 보내면 갈린다. 무엇을 눌러야 하는지는 **전시물이 선언한다**.
    const interactions = renderFor(formExhibit, formExhibit.primaryArtifactId).interactions ?? [];
    if (interactions.length === 0) {
      throw new Error("form-survey 가 상호작용을 선언하지 않았다 — 이 단언은 선언이 있어야 성립한다");
    }
    const live = await checkRender(FORM_SEED, formExhibit.capabilities, { interactions });
    if (!live.ok) throw new Error(`working artifact must pass interaction check — ${live.errors.join(" | ")}`);
    if (live.interactions[0]?.invoked.join(",") !== "survey.submit") {
      throw new Error(`interaction must record the invoke — got ${JSON.stringify(live.interactions)}`);
    }

    const deadListener = await checkRender(listenerTypo, formExhibit.capabilities, { interactions });
    if (deadListener.ok || !deadListener.errors.some((e) => e.includes("not invoked by submit"))) {
      throw new Error(`dead listener must fail — got ${JSON.stringify(deadListener)}`);
    }

    const wrongCapability = await checkRender(capabilityTypo, formExhibit.capabilities, { interactions });
    if (wrongCapability.ok || !wrongCapability.errors.some((e) => e.includes("unhandled rejection"))) {
      // 이 갈래가 조용한 이유는 dispatchEvent 가 promise 를 돌려주지 않기
      // 때문이다 — 잡아 기록하지 않으면 프로세스 경고로만 흘러간다.
      throw new Error(`wrong capability must surface its rejection — got ${JSON.stringify(wrongCapability)}`);
    }

    ok(n, "render-check 상호작용 단계 — 마운트에서 동일하던 셋이 이벤트 하나로 갈린다 (죽은 리스너·잘못된 capability)");
  } catch (err) {
    fail(n, "render-check 상호작용 단계 — 마운트 이후 판정", err);
  }

  const skipNote = skipCount > 0 ? ` + ${skipCount} SKIP (agent ${agentVersion} < 0.0.2)` : "";
  // ── 17. 자리 선언 — 총량이 잡는지 여부는 **화면 크기**가 정한다 ──────────
  //
  // 단언 14 는 기대 capability 가 불렸는가를 본다. 그런데 capability 를 제대로
  // 부르고 **응답의 필드 이름만 틀리면** 값이 전부 대체 표기가 되고, 라벨과 껍데기가
  // 텍스트 총량을 채운다. 이 전시물에서 그 변형은 **19자**로 하한(20)에 **한 글자**
  // 모자라 총량 판정이 잡는다 — 옳아서가 아니라 **화면이 작아서**다.
  //
  // 그래서 카드를 하나 더 가진 변형을 함께 파생한다. 값이 전부 빠진 것은 같은데
  // 총량은 하한을 넘고, 그때 남는 판정은 **자리 선언**뿐이다. 두 변형 다 시드에서
  // 파생하며 치환 여부를 먼저 확인한다(단언 16 과 같은 규율).
  n = 17;
  try {
    const { checkRender } = await import("./tools/render-check.ts");
    const ORDERS_LINE = '    { label: "Orders", value: byId.orders?.value ?? "n/a" },';
    const emptied = SEED_CONTENT.replaceAll("?.value ??", "?.amount ??");
    const grown = emptied.replace(
      ORDERS_LINE.replace("?.value ??", "?.amount ??"),
      ORDERS_LINE.replace("?.value ??", "?.amount ??") +
        "\n" +
        '    { label: "Refunds", value: byId.refunds?.amount ?? "n/a" },',
    );
    if (emptied === SEED_CONTENT || grown === emptied) {
      throw new Error("fixture derivation failed — the seed no longer contains the substituted text");
    }
    // 자리는 **전시물이 선언한다** — 무엇이 항상 차 있어야 하는지는 전시물만 안다.
    const expectFilled = renderFor(exhibit, ARTIFACT_ID).expectFilled ?? [];
    if (expectFilled.length === 0) {
      throw new Error("dashboard 가 자리를 선언하지 않았다 — 이 단언은 선언이 있어야 성립한다");
    }

    // 대조군 먼저 — 시드가 통과하지 않으면 아래 실패는 아무것도 구별하지 않는다.
    const good = await checkRender(SEED_CONTENT, exhibit.capabilities, {
      expectInvokes: ["dashboard.metrics"],
      expectFilled,
    });
    if (!good.ok) throw new Error(`대조군(시드)이 떨어졌다 — ${good.errors.join(" | ")}`);
    if (good.filled[0]?.total !== 2 || good.filled[0]?.blank !== 0) {
      throw new Error(`대조군 판독이 예상과 다르다: ${JSON.stringify(good.filled)}`);
    }

    // 작은 화면: 총량이 **간신히** 잡는다. 그 여유가 이 단언이 기록하는 값이다.
    const smallMountOnly = await checkRender(emptied, exhibit.capabilities, {
      expectInvokes: ["dashboard.metrics"],
    });
    if (smallMountOnly.ok || smallMountOnly.textLength >= 20) {
      throw new Error(
        `전제가 바뀌었다 — 작은 화면에서 총량이 더 이상 잡지 못하거나 이미 하한을 넘는다: ` +
          `text=${smallMountOnly.textLength} ok=${smallMountOnly.ok}`,
      );
    }

    // 카드 하나만 늘면 총량은 통과한다 — 값은 여전히 전부 빠져 있는데.
    const grownMountOnly = await checkRender(grown, exhibit.capabilities, {
      expectInvokes: ["dashboard.metrics"],
    });
    if (!grownMountOnly.ok) {
      throw new Error(
        `전제가 깨졌다 — 늘어난 화면도 총량이 잡는다면 이 단언이 말하려는 것이 없다: ${grownMountOnly.errors.join(" | ")}`,
      );
    }
    const grownFilled = await checkRender(grown, exhibit.capabilities, {
      expectInvokes: ["dashboard.metrics"],
      expectFilled,
    });
    if (grownFilled.ok || grownFilled.filled[0]?.blank !== 3) {
      throw new Error(`자리 선언이 값 실종을 잡지 못했다: ${JSON.stringify(grownFilled.filled)}`);
    }
    ok(
      n,
      `자리 선언 — 값이 전부 빠진 화면을 총량은 작을 때만 잡고(text=${smallMountOnly.textLength}<20) ` +
        `카드 하나만 늘면 통과시킨다(text=${grownMountOnly.textLength}). 자리 선언은 둘 다 잡는다 (시드는 통과 — 대조군)`,
    );
  } catch (err) {
    fail(n, "자리 선언 — 값이 전부 빠진 화면을 총량은 작을 때만 잡는다 (시드는 통과 — 대조군)", err);
  }

  // ── 18. 전 전시물의 자리 선언이 실제로 돌아간다 ─────────────────────────
  // 선언은 여섯 전시물이 전부 갖고 있으나, 그중 셋은 어떤 게이트도 읽지 않는다
  // (게이트마다 전시물이 하나로 고정돼 있고 한 전시물은 아예 게이트가 없다).
  // 아무도 안 돌리는 선언은 셀렉터가 낡는 순간 조용히 0을 판정하면서 초록으로
  // 남는다 — 단언 14·16·17 이 고친 것과 **같은 모양**의 결함이고, 자리 선언
  // 자체가 매치 0건을 실패로 두는 것과 같은 저울이다.
  //
  // 기대 목록은 `exhibits/` 에서 파생한다(단언 13 과 같은 규율) — 하드코딩하면 새
  // 전시물이 선언 없이 들어와도 통과한다.
  n = 18;
  try {
    const { checkRender } = await import("./tools/render-check.ts");
    const exhibitsDir = new URL("../exhibits/", import.meta.url);
    const names = readdirSync(exhibitsDir).filter((name) =>
      existsSync(new URL(`${name}/exhibit.ts`, exhibitsDir)),
    );
    if (names.length === 0) throw new Error("no exhibits found — the expectation list would be vacuous");

    const undeclared: string[] = [];
    const broken: string[] = [];
    const readout: string[] = [];
    for (const name of names) {
      const ex = (await import(`../exhibits/${name}/exhibit.ts`)).default;
      const declared = renderFor(ex, ex.primaryArtifactId).expectFilled ?? [];
      if (declared.length === 0) {
        undeclared.push(name);
        continue;
      }
      const source = ex.artifacts[ex.primaryArtifactId];
      const r = await checkRender(source, ex.capabilities, renderFor(ex, ex.primaryArtifactId));
      // 시드가 자기 선언에 떨어지거나, 셀렉터가 아무것도 매치하지 못하거나,
      // 매치한 자리가 비어 있으면 그 선언은 낡았다.
      if (!r.ok || r.filled.length === 0 || r.filled.some((f) => f.total === 0 || f.blank > 0)) {
        broken.push(`${name}: ${JSON.stringify(r.filled)} ${r.errors.join(" | ")}`);
        continue;
      }
      readout.push(`${name} ${r.filled.map((f) => f.total).join("/")}`);
    }
    if (undeclared.length > 0) {
      throw new Error(`자리를 선언하지 않은 전시물: ${undeclared.join(", ")} — 그 화면의 판정은 총량으로 돌아간다`);
    }
    if (broken.length > 0) {
      throw new Error(`선언이 실물과 어긋났다 — ${broken.join(" ;; ")}`);
    }
    ok(n, `전 전시물(${names.length})의 자리 선언이 시드에서 실제로 돌아간다 — ${readout.join(" · ")}`);
  } catch (err) {
    fail(n, "전 전시물의 자리 선언이 시드에서 실제로 돌아간다", err);
  }

  // ── 19. 덮이지 않은 화면을 **센다** ──────────────────────────────────────
  // 사각은 여기 있었다: 단언 18 은 전 전시물을 훑지만 **primary 만** 본다. 화면이
  // 여럿인 전시물에서 둘째를 선언하지 않으면 그 화면은 총량 판정으로 돌아가고,
  // 통째로 죽어도 아무도 말하지 않는다(cycle-169 가 storefront 에서 실물로 봤다).
  //
  // 판정선은 cycle-173 이 세운 것을 그대로 쓴다: **선언이 없는 화면은 실패가 아니라
  // 집계 대상**이다 — 화면을 더하는 일이 게이트를 빨갛게 만들면 아무도 더하지 않는다.
  // 그러나 **이미 선언한 전시물이 화면을 더하고 선언을 빠뜨린 것**은 다르다. 그것은
  // 옵트인하지 않은 것이 아니라 **빠뜨린 것**이고, 사각이 자라는 유일한 경로다.
  n = 19;
  try {
    const { readdirSync, existsSync } = await import("node:fs");
    const exhibitsDir = new URL("../exhibits/", import.meta.url);
    const names = readdirSync(exhibitsDir).filter((name) =>
      existsSync(new URL(`${name}/exhibit.ts`, exhibitsDir)),
    );

    let screens = 0;
    let covered = 0;
    const partial: string[] = [];
    const readout: string[] = [];
    for (const name of names) {
      const ex = (await import(`../exhibits/${name}/exhibit.ts`)).default;
      const all = Object.keys(ex.artifacts);
      const uncovered = undeclaredArtifacts(ex);
      screens += all.length;
      covered += all.length - uncovered.length;
      if (uncovered.length > 0 && uncovered.length < all.length) {
        partial.push(`${name}: ${uncovered.join(", ")}`);
      }
      if (all.length > 1) readout.push(`${name} ${all.length - uncovered.length}/${all.length}`);
    }

    if (partial.length > 0) {
      throw new Error(
        `선언한 전시물이 화면을 빠뜨렸다 — ${partial.join(" ;; ")}. ` +
          `전시물이 선언을 시작했으면 화면 전부를 선언해야 한다: 빠진 화면은 총량 판정으로 돌아가고, ` +
          `통째로 죽어도 어떤 게이트도 말하지 않는다`,
      );
    }
    if (covered !== screens) {
      throw new Error(`전시물 전체가 선언을 갖는데 덮이지 않은 화면이 남았다 — ${covered}/${screens}`);
    }
    ok(
      n,
      `덮이지 않은 화면을 센다 — 전시물 ${names.length} · 화면 ${screens} · 선언 ${covered}/${screens}` +
        (readout.length > 0 ? ` (다중 화면: ${readout.join(" · ")})` : ""),
    );
  } catch (err) {
    fail(n, "덮이지 않은 화면을 센다", err);
  }

  console.log(`smoke: ${passCount}/${TOTAL - skipCount} PASS${skipNote}`);
}

main().catch((err) => {
  console.error("smoke: unexpected harness error");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
