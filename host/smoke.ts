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
 * 렌더 검증(tools/render-check.ts — cycle-85 갭 후속)을 검증한다.
 *
 * Usage: node host/smoke.ts
 * Exit 0 + "smoke: 14/14 PASS" on success; exit 1 otherwise.
 */

import { readFileSync } from "node:fs";
import { artifactFingerprint } from "@vivariumjs/changeset";
import exhibit from "../exhibits/dashboard/exhibit.ts";
import { runRollbackGate } from "./tools/rollback-gate.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const TARGET = exhibit.target;
const ARTIFACT_ID = exhibit.primaryArtifactId;
const SEED_CONTENT = exhibit.artifacts[ARTIFACT_ID];
const TOTAL = 14;

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
    const missing = ["dashboard", "landing-page", "form-survey"].filter((name) => !html.includes(`<code>${name}</code>`));
    if (missing.length > 0) {
      throw new Error(`gallery.html missing exhibit section(s): ${missing.join(", ")}`);
    }
    ok(n, "build-index → gallery.html 생성, 전시물 3종 섹션 전부 등재");
  } catch (err) {
    fail(n, "build-index → gallery.html 생성, 전시물 3종 섹션 전부 등재", err);
  }

  // ── 14. 렌더 검증 — 정상 시드 통과 / 기대-invoke 불일치·실행 예외 감지 ──
  n = 14;
  try {
    const { checkRender } = await import("./tools/render-check.ts");
    const good = await checkRender(SEED_CONTENT, exhibit.capabilities, { expectInvokes: ["dashboard.metrics"] });
    if (!good.ok) throw new Error(`seed must pass render check — ${good.errors.join(" | ")}`);
    // cycle-85 감지 사례: 기대 capability(dataset)가 invoke 되지 않으면 FAIL.
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

  const skipNote = skipCount > 0 ? ` + ${skipCount} SKIP (agent ${agentVersion} < 0.0.2)` : "";
  console.log(`smoke: ${passCount}/${TOTAL - skipCount} PASS${skipNote}`);
}

main().catch((err) => {
  console.error("smoke: unexpected harness error");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
