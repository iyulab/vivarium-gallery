/**
 * 3-facet 동반 변경 스모크 (T1 게이트) — inventory 전시물 고정.
 *
 * `smoke.ts` 와 별개인 이유: 그쪽 14 단언은 은퇴한 선행 샘플과의 1:1 동등성
 * 이식본이고 dashboard 전시물에 고정돼 있다. 호스트 프로세스 하나가 전시물
 * 하나를 싣는 구조이므로, 다른 전시물을 구동하는 게이트는 별도 스크립트가
 * 맞다(전시물-무관 일반화는 수요-주도로 미룬다 — 선제 일반화 금지).
 *
 * 이 게이트가 증명하려는 것 하나: **필드 추가는 스키마+데이터+UI 가 함께여야
 * 올바른 변경이고, 그 셋이 하나의 fingerprint·하나의 승인·하나의 원자 flip 으로
 * 착지하며, 롤백에서도 함께 되돌아온다.**
 *
 * 판정의 근거는 월드 JSON 심층 비교가 아니라 **facet fingerprint** 다 — "UI 는
 * 바뀌었는데 스키마는 안 바뀌었다"를 구분할 수 있어야 원자성 주장이 성립한다.
 * 다만 fingerprint 는 *무엇이* 바뀌었는지 말하지 않으므로, 내용 판독을 한 번씩
 * 곁들인다(새 필드가 스키마에 있는가 · 행에 값이 들어갔는가 · 열이 표에 있는가).
 *
 * Prerequisite: stage-host (8891) + host/server.ts (8890, **--exhibit inventory**,
 * MODEL_PROVIDER 미설정 — 결정성은 scripted provider 에 의존).
 *
 * Usage: node host/smoke-3facet.ts
 * Exit 0 + "smoke-3facet: 8/8 PASS" on success; exit 1 otherwise.
 */

import exhibit from "../exhibits/inventory/exhibit.ts";
import { COLUMN_ADDED, RESTOCK_DUE } from "../exhibits/inventory/scripted.ts";
import { runRollbackGate } from "./tools/rollback-gate.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const TARGET = exhibit.target;
const ARTIFACT_ID = exhibit.primaryArtifactId;
const SEED_CONTENT = exhibit.artifacts[ARTIFACT_ID];
const TOTAL = 8;
/**
 * facet fingerprint 의 키. 참조 어댑터는 schema·data 는 facet 이름으로,
 * UI 는 **아티팩트 id 하나당 하나**로 낸다 — fidelity 매니페스트가 쓰는
 * `"ui"` 키는 fingerprint 쪽에 존재하지 않는다(어휘 비대칭, cycle-117 이슈).
 */
const FACET_KEYS = ["schema", "data", ARTIFACT_ID];

let passCount = 0;
const failures: string[] = [];

function ok(n: number, desc: string): void {
  passCount++;
  console.log(`ok ${n} - ${desc}`);
}

function fail(n: number, desc: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  failures.push(`${n} - ${desc}\n  detail: ${message}`);
  console.log(`FAIL ${n} - ${desc}\n  detail: ${message}`);
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`POST ${path} — non-JSON response (status ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`POST ${path} — HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function world(): Promise<any> {
  const res = await fetch(`${BASE}/stage/targets/${TARGET}/artifacts`);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET world — HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function main(): Promise<void> {
  let n = 1;

  // 원장 기준선 — 장수 stage-host 는 재실행마다 항목을 쌓으므로, 단언 8은
  // 이번 실행분(seq > baseline)만 판정해야 한다 (smoke.ts 와 동일 규율).
  let baselineSeq = 0;
  try {
    const ledger = await (await fetch(`${BASE}/stage/ledger`)).json();
    baselineSeq = Array.isArray(ledger) && ledger.length > 0 ? Math.max(...ledger.map((e: any) => e.seq)) : 0;
  } catch {
    baselineSeq = 0;
  }

  // ── 1. 세 facet 시드 — 전시물이 schema·data·ui 를 전부 세운다 ────────────
  let seededFingerprints: Record<string, string> = {};
  try {
    await post("/stage/targets", {
      target: TARGET,
      artifacts: exhibit.artifacts,
      schema: exhibit.schema,
      data: exhibit.data,
    });
    const seeded = await world();
    if (seeded.artifacts?.[ARTIFACT_ID] !== SEED_CONTENT) {
      throw new Error("seeded artifact content mismatch");
    }
    if (!seeded.schema?.entities?.Item?.fields?.quantity) {
      throw new Error(`seeded schema missing Item.quantity — got ${JSON.stringify(seeded.schema)}`);
    }
    if (seeded.schema.entities.Item.fields.restockDue) {
      throw new Error("seed must NOT already declare restockDue — the change under test adds it");
    }
    if (!Array.isArray(seeded.data?.Item) || seeded.data.Item.length !== 3) {
      throw new Error(`seeded data must hold 3 Item rows — got ${JSON.stringify(seeded.data)}`);
    }
    const missing = FACET_KEYS.filter((f) => typeof seeded.fingerprints?.[f] !== "string");
    if (missing.length > 0) {
      throw new Error(`world read lacks facet fingerprints: ${missing.join(", ")}`);
    }
    seededFingerprints = seeded.fingerprints;
    ok(n, "3-facet 시드 → schema·data·ui 가 전부 서고 facet fingerprint 3종이 읽힌다");
  } catch (err) {
    fail(n, "3-facet 시드 → schema·data·ui 가 전부 서고 facet fingerprint 3종이 읽힌다", err);
  }

  // ── 2. 에이전트 턴 — 한 제안이 세 facet 을 전부 담는다 ───────────────────
  n = 2;
  let proposal: any;
  try {
    const turn = await post("/agent/session", {
      intent: "품목에 재입고 예정일을 추가하고 표에도 보여줘",
      editContext: null,
      artifacts: [{ artifactId: ARTIFACT_ID, content: SEED_CONTENT }],
    });
    if (!turn.proposal) {
      throw new Error(`no proposal — outcome=${JSON.stringify(turn.outcome?.status)} retries=${JSON.stringify(turn.outcome?.retries)}`);
    }
    const patches = turn.proposal.changeset.patches;
    const counts = { schema: patches.schema.length, data: patches.data.length, ui: patches.ui.length };
    if (counts.schema < 1 || counts.data < 1 || counts.ui < 1) {
      throw new Error(`proposal is not 3-facet — patch counts ${JSON.stringify(counts)}`);
    }
    if (!String(turn.proposal.fingerprint).startsWith("sha256:")) {
      throw new Error(`fingerprint does not start with sha256: — got ${turn.proposal.fingerprint}`);
    }
    proposal = turn.proposal;
    ok(n, "한 턴의 제안이 schema·data·ui 패치를 전부 담고 fingerprint 하나로 봉인된다");
  } catch (err) {
    fail(n, "한 턴의 제안이 schema·data·ui 패치를 전부 담고 fingerprint 하나로 봉인된다", err);
  }

  // ── 3. 프리뷰(브랜치) — 승인 전에 세 facet 변화를 미리 본다 ──────────────
  n = 3;
  try {
    const propose = await post(`/stage/targets/${TARGET}/changesets`, proposal.changeset);
    if (!propose.sessionId) throw new Error(`missing sessionId — got ${JSON.stringify(propose)}`);
    if (!String(propose.preview?.[ARTIFACT_ID]).includes('key: "restockDue"')) {
      throw new Error("preview artifact lacks the new column");
    }
    const live = await world();
    if (live.schema.entities.Item.fields.restockDue) {
      throw new Error("live schema changed before apply — the branch must not touch the live world");
    }
    ok(n, "브랜치 프리뷰에 새 열이 보이되 라이브 스키마는 아직 그대로 (브랜치≠라이브)");
  } catch (err) {
    fail(n, "브랜치 프리뷰에 새 열이 보이되 라이브 스키마는 아직 그대로 (브랜치≠라이브)", err);
  }

  // ── 4. 미승인 apply → 409 FingerprintGate (세 facet 도 게이트를 못 비껴간다) ──
  n = 4;
  try {
    const propose = await post(`/stage/targets/${TARGET}/changesets`, proposal.changeset);
    const res = await fetch(`${BASE}/stage/sessions/${propose.sessionId}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "smoke-3facet", evidence: { observed: "preview rendered" } }),
    });
    const json = await res.json();
    if (res.status !== 409 || json.reason !== "FingerprintGate") {
      throw new Error(`expected 409 FingerprintGate, got ${res.status}: ${JSON.stringify(json)}`);
    }
    ok(n, "미승인 3-facet 제안 apply → 409 FingerprintGate");
  } catch (err) {
    fail(n, "미승인 3-facet 제안 apply → 409 FingerprintGate", err);
  }

  // ── 5. 승인 결합 후 apply → 세 facet 이 함께 flip ────────────────────────
  n = 5;
  let approvedChangeset: any;
  let appliedSessionId = "";
  try {
    approvedChangeset = structuredClone(proposal.changeset);
    approvedChangeset.approvals = [
      { fingerprint: proposal.fingerprint, approvedBy: "smoke-3facet-reviewer", approvedAt: new Date().toISOString() },
    ];
    const propose = await post(`/stage/targets/${TARGET}/changesets`, approvedChangeset);
    const apply = await post(`/stage/sessions/${propose.sessionId}/apply`, {
      actor: "smoke-3facet",
      evidence: { observed: "preview rendered" },
    });
    if (apply.state !== "Applied") throw new Error(`expected Applied, got ${JSON.stringify(apply)}`);
    appliedSessionId = propose.sessionId;

    const live = await world();
    const moved = FACET_KEYS.filter((f) => live.fingerprints[f] !== seededFingerprints[f]);
    if (moved.length !== FACET_KEYS.length) {
      throw new Error(
        `only ${moved.length}/3 facets changed at the flip (${moved.join(", ")}) — a 3-facet change must move all three`,
      );
    }
    ok(n, "승인 1건으로 apply → schema·data·ui fingerprint 셋이 **함께** 이동");
  } catch (err) {
    fail(n, "승인 1건으로 apply → schema·data·ui fingerprint 셋이 **함께** 이동", err);
  }

  // ── 6. 내용 판독 — 옳은 것이 착지했는가 (fingerprint 는 무엇이 바뀌었는지 말하지 않는다) ──
  n = 6;
  try {
    const live = await world();
    const field = live.schema?.entities?.Item?.fields?.restockDue;
    if (field?.type !== "date") {
      throw new Error(`schema: Item.restockDue not declared as date — got ${JSON.stringify(field)}`);
    }
    const rows: any[] = live.data?.Item ?? [];
    const wrong = rows.filter((r) => r.restockDue !== RESTOCK_DUE[r.sku]);
    if (rows.length !== 3 || wrong.length > 0) {
      throw new Error(`data: rows not backfilled — ${JSON.stringify(rows)}`);
    }
    if (!String(live.artifacts?.[ARTIFACT_ID]).includes(COLUMN_ADDED)) {
      throw new Error("ui: artifact does not carry the new column block");
    }
    ok(n, "내용 판독 — 스키마에 date 필드·행 3건 백필·표에 열 추가가 전부 착지");
  } catch (err) {
    fail(n, "내용 판독 — 스키마에 date 필드·행 3건 백필·표에 열 추가가 전부 착지", err);
  }

  // ── 7. 롤백 공통 게이트 + facet 동반 복귀 (T1 의 핵심 단언) ──────────────
  n = 7;
  try {
    const record = await runRollbackGate({
      base: BASE,
      target: TARGET,
      sessionId: appliedSessionId,
      fingerprint: proposal.fingerprint,
      approvedChangeset,
      checkpointArtifacts: { [ARTIFACT_ID]: SEED_CONTENT },
      checkpointFacetFingerprints: seededFingerprints,
    });
    if (!record.passed) {
      throw new Error(`rollback gate failed: ${JSON.stringify({ checks: record.checks, detail: record.detail })}`);
    }
    if (record.checks.facetsRestored !== true) {
      throw new Error("facet 복귀 판정이 수행되지 않았다 — checkpointFacetFingerprints 가 무시됐다");
    }
    ok(n, "롤백 게이트 — 롤백·바이트 일치·계보 정합·재적용 + **세 facet 동반 복귀**");
  } catch (err) {
    fail(n, "롤백 게이트 — 롤백·바이트 일치·계보 정합·재적용 + **세 facet 동반 복귀**", err);
  }

  // ── 8. 원장 — 한 번의 변경이 하나의 fingerprint 로 기록된다 ──────────────
  n = 8;
  try {
    const res = await fetch(`${BASE}/stage/ledger`);
    const ledger: any[] = await res.json();
    const thisRun = ledger.filter((e) => e.target === TARGET && e.seq > baselineSeq);
    const mine = thisRun.filter((e) => e.changesetFingerprint === proposal.fingerprint);
    if (mine.length === 0) throw new Error("ledger has no entry for this changeset");
    const kinds = mine.map((e) => e.kind);
    if (!kinds.includes("apply-started") || !kinds.includes("apply-completed")) {
      throw new Error(`ledger lacks the apply pair — kinds=${JSON.stringify(kinds)}`);
    }
    // 게이트 7의 재적용까지 포함해 이번 실행의 모든 항목이 같은 fingerprint 를
    // 인용한다 — facet 별로 원장이 갈라지지 않는다는 것이 원자성의 기록면이다.
    const others = thisRun.filter((e) => e.changesetFingerprint !== proposal.fingerprint);
    if (others.length > 0) {
      throw new Error(`ledger carries entries with a different fingerprint: ${JSON.stringify(others.map((e) => e.kind))}`);
    }
    ok(n, "원장 — 세 facet 변경이 fingerprint 하나 아래 apply/rollback 쌍으로 기록");
  } catch (err) {
    fail(n, "원장 — 세 facet 변경이 fingerprint 하나 아래 apply/rollback 쌍으로 기록", err);
  }

  console.log(
    failures.length === 0
      ? `smoke-3facet: ${passCount}/${TOTAL} PASS`
      : `smoke-3facet: ${passCount}/${TOTAL} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
