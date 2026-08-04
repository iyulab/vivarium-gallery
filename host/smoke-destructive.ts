/**
 * 파괴성 축 게이트 — contacts 전시물 고정.
 *
 * 갤러리가 지금까지 시험한 스키마 연산은 `field.add` 하나, 데이터 연산은 `update`
 * 하나였다. 그래서 *"변경은 검토 가능하고 되돌릴 수 있다"* 는 이 패밀리의 주장이
 * **가장 안전한 연산에서만** 증명돼 있었다. 이 게이트는 지우는 변경을 무대에 올린다.
 *
 * **성공의 형태가 턴마다 다르다** — 그것이 이 축의 핵심이고, 게이트가 세 어법을
 * 나눠 쓰는 이유다:
 *
 *   ① 되돌릴 수 있는 파괴 — 적용되고 **롤백이 잃은 값을 되돌려야** 성공.
 *      "롤백이 200 을 줬는가"가 아니라 **행마다 값이 돌아왔는가**를 묻는다.
 *   ② 거부가 정답 — **거부되고 이유를 말해야** 성공. 거부가 크래시와 같은 코드로
 *      나오면 이 판정 자체가 성립하지 않는다.
 *   ③ 미선언 영역 — 통과하되 **기록에 남아야** 성공(`smoke-refusal` 문법:
 *      *"거부가 없는 자리"*). 통과가 곧 결함인 것과, 통과가 **선언되지 않았을 뿐**인
 *      것을 갈라 적는다 — 전자는 의존이 고치면 뒤집히고 후자는 뒤집히지 않는다.
 *
 * **판정 대상은 소비 중인 게시본**이다. 어떤 단언이 오늘 초록인 이유가 "고쳐져서"가
 * 아니라 "아직 안 고쳐져서"인 자리가 있고, 그런 자리는 그 사실을 실패 메시지에
 * 적어 둔다 — 의존이 범프되면 그 단언이 빨개지고, 그때 뒤집는 것이 정답이다.
 *
 * Prerequisite: stage-host (8891) + host/server.ts (8890, **--exhibit contacts**,
 * MODEL_PROVIDER 미설정 — 결정성은 scripted provider 에 의존).
 *
 * Usage: node host/smoke-destructive.ts
 * Exit 0 + "smoke-destructive: 8/8 PASS" on success; exit 1 otherwise.
 */

import { addSchemaOp, createChangeset, finalize } from "@vivariumjs/changeset";
import exhibit from "../exhibits/contacts/exhibit.ts";
import { COLUMN_WITH_FAX, RETIRED_FIELD } from "../exhibits/contacts/scripted.ts";
import { runRollbackGate } from "./tools/rollback-gate.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const TARGET = exhibit.target;
const ARTIFACT_ID = exhibit.primaryArtifactId;
const SEED_CONTENT = exhibit.artifacts[ARTIFACT_ID];
const ENTITY = "Contact";
/** 실재하지 않는 엔티티 — 저작 시점 검사가 아니라 **어댑터**를 시험하기 위한 표적. */
const ABSENT_ENTITY = "NoSuchEntity";
const TOTAL = 8;
const FACET_KEYS = ["schema", "data", ARTIFACT_ID];

let passCount = 0;
const failures: string[] = [];

function ok(n: number, desc: string): void {
  passCount++;
  console.log(`ok ${n} - ${desc}`);
}
function fail(n: number, desc: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  failures.push(`${n} - ${desc}: ${message}`);
  console.log(`FAIL ${n} - ${desc}\n  detail: ${message}`);
}

async function raw(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text.slice(0, 300) };
  }
  return { status: res.status, json };
}
async function post(path: string, body: unknown): Promise<any> {
  const { status, json } = await raw(path, body);
  if (status >= 300) throw new Error(`POST ${path} — HTTP ${status}: ${JSON.stringify(json)}`);
  return json;
}
async function world(): Promise<any> {
  const res = await fetch(`${BASE}/stage/targets/${TARGET}/artifacts`);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET world — HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
async function seed(): Promise<void> {
  await post("/stage/targets", {
    target: TARGET,
    artifacts: exhibit.artifacts,
    schema: exhibit.schema,
    data: exhibit.data,
  });
}
/** 승인 결합 — 정확한 fingerprint 에만 묶인다. */
function approve(changeset: any, fingerprint: string): any {
  const approved = structuredClone(changeset);
  approved.approvals = [
    { fingerprint, approvedBy: "smoke-destructive-reviewer", approvedAt: new Date().toISOString() },
  ];
  return approved;
}
/**
 * 손으로 저작한 단일 스키마 연산 changeset.
 *
 * 부재 표적을 지목하는 턴은 에이전트가 저작할 수 **없다** — 저작 시점 표적 검사가
 * 먼저 거부하기 때문이다. 그 문을 지나쳐 **어댑터**에 닿는 것이 이 게이트의 목적이고,
 * 그래서 이 헬퍼가 있다(우회가 아니라 두 번째 문을 시험하는 유일한 방법).
 */
function handAuthored(intent: string, op: Record<string, unknown>): any {
  const cs: any = finalize(
    addSchemaOp(
      createChangeset({
        intent,
        producedBy: "gallery/smoke-destructive (hand-authored — bypasses author-time checking on purpose)",
        createdAt: new Date().toISOString(),
      }),
      op,
    ),
  );
  return approve(cs, cs.fingerprint);
}

async function main(): Promise<void> {
  let n = 1;

  // ── 1. 시드 — 파괴할 것이 실제로 있다 (전제) ─────────────────────────────
  let seededFingerprints: Record<string, string> = {};
  try {
    await seed();
    const seeded = await world();
    const fields = seeded.schema?.entities?.[ENTITY]?.fields ?? {};
    if (!fields[RETIRED_FIELD]) {
      throw new Error(`시드가 ${RETIRED_FIELD} 를 선언하지 않는다 — 지울 것이 없으면 이 게이트는 아무것도 시험하지 않는다`);
    }
    const rows: any[] = seeded.data?.[ENTITY] ?? [];
    const valued = rows.filter((r) => typeof r[RETIRED_FIELD] === "string" && r[RETIRED_FIELD] !== "");
    if (rows.length !== 3 || valued.length !== 3) {
      throw new Error(`행 3건 전부가 ${RETIRED_FIELD} 값을 가져야 한다 — 실제 ${rows.length}행 / 값 ${valued.length}건`);
    }
    // 중복 값 하나 — 단언 8(기존 데이터를 위반하는 제약)의 전제.
    const distinct = new Set(rows.map((r) => r[RETIRED_FIELD]));
    if (distinct.size === rows.length) {
      throw new Error(`시드에 ${RETIRED_FIELD} 중복이 없다 — unique 제약 턴의 전제가 사라졌다`);
    }
    const missing = FACET_KEYS.filter((f) => typeof seeded.fingerprints?.[f] !== "string");
    if (missing.length > 0) throw new Error(`facet fingerprint 결손: ${missing.join(", ")}`);
    seededFingerprints = seeded.fingerprints;
    ok(n, `시드 — ${ENTITY}.${RETIRED_FIELD} 가 3행 전부에 값을 갖고 그중 둘이 중복 (파괴할 것이 실재한다)`);
  } catch (err) {
    fail(n, `시드 — ${ENTITY}.${RETIRED_FIELD} 가 3행 전부에 값을 갖고 그중 둘이 중복 (파괴할 것이 실재한다)`, err);
  }

  // ── 2. ① 되돌릴 수 있는 파괴 — 폐기 턴이 세 facet 에서 함께 지운다 ───────
  n = 2;
  let proposal: any;
  let approvedChangeset: any;
  let appliedSessionId = "";
  const seedFax: Record<string, string> = Object.fromEntries(
    (exhibit.data as any)[ENTITY].map((r: any) => [r.id, r[RETIRED_FIELD]]),
  );
  try {
    const turn = await post("/agent/session", {
      intent: "더 이상 쓰지 않는 팩스 번호를 연락처에서 폐기해 줘",
      editContext: null,
      artifacts: [{ artifactId: ARTIFACT_ID, content: SEED_CONTENT }],
    });
    if (!turn.proposal) throw new Error(`no proposal — ${JSON.stringify(turn.outcome)}`);
    proposal = turn.proposal;
    const patches = proposal.changeset.patches;
    if (patches.schema.length < 1 || patches.data.length < 1 || patches.ui.length < 1) {
      throw new Error(
        `폐기 턴이 3-facet 이 아니다 — 스키마만 지우면 값은 남는다: ${JSON.stringify({
          schema: patches.schema.length, data: patches.data.length, ui: patches.ui.length,
        })}`,
      );
    }
    if (patches.schema[0].op !== "field.remove") {
      throw new Error(`스키마 연산이 field.remove 가 아니다 — ${patches.schema[0].op}`);
    }
    approvedChangeset = approve(proposal.changeset, proposal.fingerprint);
    const propose = await post(`/stage/targets/${TARGET}/changesets`, approvedChangeset);
    appliedSessionId = propose.sessionId;
    const applied = await post(`/stage/sessions/${appliedSessionId}/apply`, {
      actor: "directory-steward",
      evidence: { observed: "retirement reviewed" },
    });
    if (applied.state !== "Applied") throw new Error(`apply 실패: ${JSON.stringify(applied)}`);

    const live = await world();
    if (live.schema.entities[ENTITY].fields[RETIRED_FIELD]) {
      throw new Error("스키마에 필드가 남아 있다");
    }
    const stillValued = (live.data[ENTITY] as any[]).filter((r) => r[RETIRED_FIELD]);
    if (stillValued.length !== 0) {
      throw new Error(`행에 값이 남아 있다 — ${JSON.stringify(stillValued)}`);
    }
    if (live.artifacts[ARTIFACT_ID].includes(COLUMN_WITH_FAX)) {
      throw new Error("표에 열이 남아 있다");
    }
    ok(n, "① 폐기 턴이 스키마·데이터·UI 세 곳에서 **함께 지운다** — 승인 하나·flip 하나");
  } catch (err) {
    fail(n, "① 폐기 턴이 스키마·데이터·UI 세 곳에서 **함께 지운다** — 승인 하나·flip 하나", err);
  }

  // ── 3. ① 의 완주 기준 — 롤백이 **잃은 값**을 되돌린다 ────────────────────
  //
  // 이 단언은 **직접 롤백하고 그 직후의 라이브를 읽는다.** 공통 게이트(단언 4)는
  // 마지막 단계에서 **재적용**을 하므로, 그것을 돌린 뒤에 라이브를 읽으면 파괴된
  // 상태를 보게 되고, 읽기 전에 시드를 다시 밀어 넣으면 **롤백이 아니라 시드를
  // 판정하게 된다**(그렇게 쓴 첫 판이 롤백을 전혀 시험하지 않으면서 초록이었다).
  n = 3;
  let reappliedSessionId = "";
  try {
    if (!appliedSessionId) throw new Error("적용된 세션이 없다 (단언 2 실패)");
    const rolled = await post(`/stage/sessions/${appliedSessionId}/rollback`, { actor: "directory-steward" });
    if (rolled.state !== "RolledBack") throw new Error(`롤백 상태가 다르다: ${JSON.stringify(rolled)}`);

    const restored = await world();
    if (!restored.schema.entities[ENTITY].fields[RETIRED_FIELD]) {
      throw new Error("스키마에 필드가 돌아오지 않았다");
    }
    if (!restored.artifacts[ARTIFACT_ID].includes(COLUMN_WITH_FAX)) {
      throw new Error("표에 열이 돌아오지 않았다");
    }
    const back: Record<string, string> = Object.fromEntries(
      (restored.data[ENTITY] as any[]).map((r) => [r.id, r[RETIRED_FIELD]]),
    );
    for (const [id, value] of Object.entries(seedFax)) {
      if (back[id] !== value) {
        throw new Error(`행 ${id} 의 값이 돌아오지 않았다 — 기대 ${value}, 실제 ${JSON.stringify(back[id])}`);
      }
    }
    // 공통 게이트(단언 4)는 apply 된 세션을 요구하므로 같은 승인 문서를 다시 태운다.
    const re = await post(`/stage/targets/${TARGET}/changesets`, approvedChangeset);
    reappliedSessionId = re.sessionId;
    const reApplied = await post(`/stage/sessions/${reappliedSessionId}/apply`, {
      actor: "directory-steward",
      evidence: { observed: "re-applied for the common gate" },
    });
    if (reApplied.state !== "Applied") throw new Error(`재적용 실패: ${JSON.stringify(reApplied)}`);
    ok(n, "① 롤백이 **행마다 잃은 값을 되돌린다** — 되돌아왔는가에 더해 잃은 것이 돌아왔는가");
  } catch (err) {
    fail(n, "① 롤백이 **행마다 잃은 값을 되돌린다** — 되돌아왔는가에 더해 잃은 것이 돌아왔는가", err);
  }

  // ── 4. 롤백 공통 게이트 — 설계 §3, 모든 시나리오의 완주 조건 ─────────────
  n = 4;
  try {
    if (!reappliedSessionId) throw new Error("재적용된 세션이 없다 (단언 3 실패)");
    const record = await runRollbackGate({
      base: BASE,
      target: TARGET,
      sessionId: reappliedSessionId,
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
    ok(n, "롤백 공통 게이트 — 롤백·바이트 일치·계보 정합·재적용 + 세 facet 동반 복귀");
  } catch (err) {
    fail(n, "롤백 공통 게이트 — 롤백·바이트 일치·계보 정합·재적용 + 세 facet 동반 복귀", err);
  }

  // ── 5. ② 거부가 정답 — 부재 엔티티를 지목한 제거는 거부되고 이유를 말한다 ──
  n = 5;
  try {
    await seed();
    const { status, json } = await raw(
      `/stage/targets/${TARGET}/changesets`,
      handAuthored("실재하지 않는 엔티티에서 필드를 지운다", {
        op: "field.remove",
        entity: ABSENT_ENTITY,
        field: RETIRED_FIELD,
        explanation: "표적이 실재하지 않는다 — 어댑터가 판정할 몫이다.",
      }),
    );
    if (status !== 422 || json.reason !== "AdapterRefused") {
      throw new Error(`expected 422 AdapterRefused, got ${status}: ${JSON.stringify(json)}`);
    }
    if (!String(json.error ?? "").includes(ABSENT_ENTITY)) {
      throw new Error(`거부가 표적을 이름으로 부르지 않는다: ${JSON.stringify(json)}`);
    }
    ok(n, "② 부재 엔티티를 지목한 제거 → 422 AdapterRefused, 이유가 표적을 이름으로 부른다");
  } catch (err) {
    fail(n, "② 부재 엔티티를 지목한 제거 → 422 AdapterRefused, 이유가 표적을 이름으로 부른다", err);
  }

  // ── 6. ② 인데 거부가 아니라 **크래시**로 나온다 — 게이트가 결함을 고정한다 ──
  n = 6;
  try {
    await seed();
    const { status } = await raw(
      `/stage/targets/${TARGET}/changesets`,
      handAuthored("실재하지 않는 필드의 타입을 바꾼다", {
        op: "field.retype",
        entity: ENTITY,
        field: "noSuchFieldHere",
        newType: "number",
        explanation: "엔티티는 실재하고 필드는 실재하지 않는다.",
      }),
    );
    // 계약의 §Operation input 은 이 실패 모드를 **명시적으로 금지**한다 —
    // "부재 멤버를 역참조하면 null 참조 결함이 나고, 결함은 이유가 아니다."
    // 그런데 소비 중인 게시본은 정확히 그것을 한다. 즉 이 단언은 **결함이 있어서
    // 초록**이고, 의존이 그것을 고치면 빨개진다 — 그때 뒤집는 것이 정답이다.
    if (status !== 500) {
      throw new Error(
        `부재 필드 retype 이 ${status} 로 나온다 — 의존이 이 구멍을 닫았다는 뜻이므로 ` +
          `이 단언을 **뒤집을 것**: 기대를 422 AdapterRefused 로 바꾸고 메시지가 필드를 이름으로 부르는지 판정한다`,
      );
    }
    ok(n, "② **거부가 정답인데 구조적 크래시(500)** 로 나온다 — 계약이 금지한 실패 모드 (게이트가 결함을 고정)");
  } catch (err) {
    fail(n, "② **거부가 정답인데 구조적 크래시(500)** 로 나온다 — 계약이 금지한 실패 모드 (게이트가 결함을 고정)", err);
  }

  // ── 7. ③ 통과가 곧 결함 — 없는 엔티티를 지우는 것이 조용히 성공한다 ──────
  n = 7;
  try {
    await seed();
    const before = JSON.stringify((await world()).schema);
    const propose = await raw(
      `/stage/targets/${TARGET}/changesets`,
      handAuthored("실재하지 않는 엔티티를 지운다", {
        op: "entity.remove",
        entity: ABSENT_ENTITY,
        explanation: "제거는 대상이 없어도 결과가 같아 보인다 — 그래서 조용한 성공이 그럴듯하다.",
      }),
    );
    if (propose.status !== 200) {
      throw new Error(
        `부재 엔티티 제거가 ${propose.status} 로 거부됐다 — 의존이 이 구멍을 닫았다는 뜻이므로 ` +
          `이 단언을 **뒤집을 것**: 기대를 422 AdapterRefused 로 바꾼다`,
      );
    }
    const applied = await post(`/stage/sessions/${propose.json.sessionId}/apply`, {
      actor: "directory-steward",
      evidence: { observed: "reviewed" },
    });
    if (applied.state !== "Applied") throw new Error(`apply 상태가 다르다: ${JSON.stringify(applied)}`);
    if (JSON.stringify((await world()).schema) !== before) {
      throw new Error("스키마가 바뀌었다 — 이 단언의 전제(아무 일도 일어나지 않는다)가 깨졌다");
    }
    ok(n, "③ 부재 엔티티 제거가 **아무 일도 없이 `Applied` 로 원장에 남는다** — 통과가 곧 결함");
  } catch (err) {
    fail(n, "③ 부재 엔티티 제거가 **아무 일도 없이 `Applied` 로 원장에 남는다** — 통과가 곧 결함", err);
  }

  // ── 8. ③ 미선언 영역 — 기존 데이터를 위반하는 제약이 착지한다 ────────────
  n = 8;
  try {
    await seed();
    const propose = await post(
      `/stage/targets/${TARGET}/changesets`,
      handAuthored("팩스 번호를 유일하게 만든다", {
        op: "constraint.add",
        entity: ENTITY,
        constraint: { kind: "unique", fields: [RETIRED_FIELD] },
        explanation: "이 제약은 지금 데이터가 이미 위반하고 있다 — 두 행이 같은 번호를 공유한다.",
      }),
    );
    const applied = await post(`/stage/sessions/${propose.sessionId}/apply`, {
      actor: "directory-steward",
      evidence: { observed: "reviewed" },
    });
    if (applied.state !== "Applied") throw new Error(`apply 실패: ${JSON.stringify(applied)}`);
    const live = await world();
    const constraints: any[] = live.schema.entities[ENTITY].constraints ?? [];
    if (constraints.length !== 1) throw new Error(`제약이 착지하지 않았다: ${JSON.stringify(constraints)}`);
    const values = (live.data[ENTITY] as any[]).map((r) => r[RETIRED_FIELD]);
    if (new Set(values).size === values.length) {
      throw new Error("데이터가 제약을 위반하지 않는다 — 이 단언의 전제가 깨졌다");
    }
    await post(`/stage/sessions/${propose.sessionId}/rollback`, { actor: "smoke-destructive" });
    // 6·7 과 달리 이것은 **뒤집히지 않는다**: 라이브러리가 데이터를 제약에 대고
    // 검사하겠다고 선언한 적이 없다(스펙은 어댑터에 "표현할 수 없는 것을 거부하라"만
    // 요구하고, 제약 위반은 표현 불가가 아니다). 결함이 아니라 **미선언**이며,
    // 그 구분을 적어 두는 것이 이 단언의 일이다.
    ok(n, "③ 기존 데이터를 위반하는 제약이 **그대로 착지한다** — 결함이 아니라 미선언 (뒤집히지 않는다)");
  } catch (err) {
    fail(n, "③ 기존 데이터를 위반하는 제약이 **그대로 착지한다** — 결함이 아니라 미선언 (뒤집히지 않는다)", err);
  }

  await seed();

  console.log(
    failures.length === 0
      ? `smoke-destructive: ${passCount}/${TOTAL} PASS`
      : `smoke-destructive: ${passCount}/${TOTAL} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
