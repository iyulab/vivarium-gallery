/**
 * 시나리오 드라이버 (G3) — scenario.md 의 턴 시퀀스를 선언적 spec(JSON)으로
 * 받아 호스트 HTTP 표면(UI 와 동일 API)을 구동한다: 시드 → 턴 루프
 * (턴1 /agent/session, 이후 /agent/refine + baseArtifacts 재기저) → 각 턴
 * 승인·apply → 마지막에 롤백 공통 게이트(rollback-gate.ts).
 *
 * 판정 철학: no-proposal(exhausted)·no-op(changedLines=0)은 중단 사유가
 * 아니라 **기록 대상**이다 — 시나리오 완주 판정은 실행 주체가 RUN.md 에서
 * 내린다 (cycle-81 no-op 소비 재현이 선례). 종료 코드는 게이트 통과 여부.
 *
 * spec 형식:
 *   {
 *     "base": "http://localhost:8890",        // 생략 시 기본값
 *     "exhibit": "landing-page",
 *     "turns": [ { "type": "build", "instruction": "..." }, ... ],
 *     "gateCheckpointTurn": 3,                 // 체크포인트 = 이 턴(1-기반)
 *                                              // apply 직후 상태. 생략 시
 *                                              // 마지막-1 턴.
 *     "rollbackOut": "<rollback.json 경로>"    // 생략 시 미기록
 *   }
 *
 * Usage: node host/tools/drive-scenario.ts <spec.json>
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExhibitDefinition } from "../exhibit-schema.ts";
import { runRollbackGate } from "./rollback-gate.ts";

const galleryRoot = normalize(join(fileURLToPath(import.meta.url), "..", "..", ".."));

interface TurnSpec {
  type: string;
  instruction: string;
  /** renderCheck 활성 시 이 턴 apply 후 반드시 invoke 돼 있어야 할 capability. */
  expectInvokes?: string[];
}
interface ScenarioSpec {
  base?: string;
  exhibit: string;
  turns: TurnSpec[];
  gateCheckpointTurn?: number;
  rollbackOut?: string;
  /** 턴별 jsdom 렌더 검증 (render-check.ts — cycle-85 갭 후속). */
  renderCheck?: boolean;
}

const specPath = process.argv[2];
if (!specPath) {
  console.error("Usage: node drive-scenario.ts <spec.json>");
  process.exit(2);
}
const spec: ScenarioSpec = JSON.parse(readFileSync(specPath, "utf8"));
const base = spec.base ?? "http://localhost:8890";
if (!/^[a-z0-9-]+$/.test(spec.exhibit) || !Array.isArray(spec.turns) || spec.turns.length === 0) {
  console.error("invalid spec: exhibit slug + non-empty turns required");
  process.exit(2);
}

const exhibit: ExhibitDefinition = (
  await import(pathToFileURL(join(galleryRoot, "exhibits", spec.exhibit, "exhibit.ts")).href)
).default;
const TARGET = exhibit.target;

async function http(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    signal: AbortSignal.timeout(600_000),
  });
  const json = JSON.parse((await res.text()) || "{}");
  if (!res.ok) throw new Error(`${method} ${path} — HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

function changedLines(before: string, after: string): number {
  const a = before.split("\n");
  const b = after.split("\n");
  let n = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) n++;
  return n;
}

// ── 시드 ─────────────────────────────────────────────────────────────────
// 다중 facet 전시물은 schema·data 도 함께 시드한다 — 없으면 스키마 연산이
// 존재하지 않는 엔티티를 대상으로 하게 된다.
await http("POST", "/stage/targets", {
  target: TARGET,
  artifacts: exhibit.artifacts,
  ...(exhibit.schema ? { schema: exhibit.schema } : {}),
  ...(exhibit.data ? { data: exhibit.data } : {}),
});
let live: Record<string, string> = { ...exhibit.artifacts };
const multiFacet = Boolean(exhibit.schema || exhibit.data);

/** 현재 라이브의 facet fingerprint (다중 facet 전시물의 동반성 판정 근거). */
async function facetFingerprints(): Promise<Record<string, string>> {
  return (await http("GET", `/stage/targets/${TARGET}/artifacts`)).fingerprints ?? {};
}
console.log(`seeded ${TARGET} (${spec.turns.length} turns)${multiFacet ? " [multi-facet]" : ""}`);

// ── 턴 루프 ──────────────────────────────────────────────────────────────
/** 턴별 apply 직후 상태 (게이트 체크포인트 조회용). states[0] = 시드. */
const states: Array<Record<string, string>> = [{ ...live }];
/** states 와 같은 인덱스의 facet fingerprint 스냅샷 (다중 facet 전시물만 채운다). */
const facetStates: Array<Record<string, string>> = [multiFacet ? await facetFingerprints() : {}];
let lastApply: { sessionId: string; approved: unknown; fingerprint: string } | null = null;
let anyDefect = false;

const renderCheckFn = spec.renderCheck ? (await import("./render-check.ts")).checkRender : null;

for (let i = 0; i < spec.turns.length; i++) {
  const { type, instruction, expectInvokes } = spec.turns[i];
  const t = Date.now();
  const turn =
    i === 0
      ? await http("POST", "/agent/session", {
          intent: instruction,
          editContext: null,
          artifacts: Object.entries(live).map(([artifactId, content]) => ({ artifactId, content })),
        })
      : await http("POST", "/agent/refine", { instruction, baseArtifacts: live });
  const secs = ((Date.now() - t) / 1000).toFixed(1);

  if (!turn.proposal) {
    console.log(`turn${i + 1} ${type}: NO-PROPOSAL (${turn.outcome?.status}) ${secs}s — recorded, continuing`);
    anyDefect = true;
    states.push({ ...live });
    facetStates.push(facetStates[facetStates.length - 1]);
    continue;
  }

  // 제안이 담은 facet 구성 — 3-facet 저작 판정의 1차 근거(모델이 낸 것 그대로).
  const p = turn.proposal.changeset.patches;
  const facetCounts = { schema: p.schema.length, data: p.data.length, ui: p.ui.length };

  const approved = structuredClone(turn.proposal.changeset);
  approved.approvals = [
    { fingerprint: turn.proposal.fingerprint, approvedBy: "run-cycle-session", approvedAt: new Date().toISOString() },
  ];
  const propose = await http("POST", `/stage/targets/${TARGET}/changesets`, approved);
  const apply = await http("POST", `/stage/sessions/${propose.sessionId}/apply`, {
    actor: "run-cycle-session",
    evidence: { observed: `${type} preview verified` },
  });
  if (apply.state !== "Applied") throw new Error(`turn${i + 1} apply failed: ${JSON.stringify(apply)}`);

  const delta = Object.keys(apply.artifacts).reduce(
    (sum: number, id: string) => sum + changedLines(live[id] ?? "", apply.artifacts[id]),
    0,
  );
  if (delta === 0) anyDefect = true;
  console.log(
    `turn${i + 1} ${type}: ${turn.outcome.status} attempts=${turn.outcome.attempts} ${secs}s changedLines=${delta}${delta === 0 ? " ← NO-OP" : ""}` +
      ` facets={schema:${facetCounts.schema},data:${facetCounts.data},ui:${facetCounts.ui}}`,
  );
  live = apply.artifacts;
  states.push({ ...live });
  if (multiFacet) {
    const after = await facetFingerprints();
    const before = facetStates[facetStates.length - 1];
    const moved = Object.keys(after).filter((k) => after[k] !== before[k]);
    console.log(`  facets moved: [${moved.join(", ")}]`);
    facetStates.push(after);
  } else {
    facetStates.push({});
  }
  lastApply = { sessionId: propose.sessionId, approved, fingerprint: turn.proposal.fingerprint };

  if (renderCheckFn) {
    const check = await renderCheckFn(live[exhibit.primaryArtifactId], exhibit.capabilities, { expectInvokes });
    if (!check.ok) anyDefect = true;
    console.log(
      `  render-check: ${check.ok ? "ok" : "FAIL"} invoked=[${check.invoked.join(",")}] children=${check.childCount} text=${check.textLength}${check.ok ? "" : " — " + check.errors.join(" | ")}`,
    );
  }
}

// ── 롤백 공통 게이트 ─────────────────────────────────────────────────────
if (!lastApply) {
  console.error("no turn was applied — gate skipped");
  process.exit(1);
}
const checkpointTurn = spec.gateCheckpointTurn ?? spec.turns.length - 1;
const record = await runRollbackGate({
  base,
  target: TARGET,
  sessionId: lastApply.sessionId,
  fingerprint: lastApply.fingerprint,
  approvedChangeset: lastApply.approved,
  checkpointArtifacts: states[checkpointTurn],
  ...(multiFacet ? { checkpointFacetFingerprints: facetStates[checkpointTurn] } : {}),
});
if (spec.rollbackOut) {
  mkdirSync(dirname(spec.rollbackOut), { recursive: true });
  writeFileSync(spec.rollbackOut, JSON.stringify(record, null, 2));
}
console.log(`gate: passed=${record.passed} checks=${JSON.stringify(record.checks)}`);
if (!record.passed) console.log("gate detail:", JSON.stringify(record.detail));
console.log(`DONE${anyDefect ? " (with recorded observations — 판정은 RUN.md)" : ""}`);
process.exit(record.passed ? 0 : 1);
