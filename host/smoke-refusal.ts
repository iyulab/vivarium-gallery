/**
 * 거부 경로 게이트 (T2) — inventory 전시물 고정.
 *
 * 거부는 이 제품의 **결함이 아니라 기능**인데, 갤러리에서는 미승인 apply 한 종류
 * 밖에 일어난 적이 없었다. 이 게이트는 **드리프트 거부를 실제로 일으키고**,
 * 거부가 소비자에게 무엇을 전달하는지(그리고 무엇을 전달하지 못하는지) 기록한다.
 *
 * 드리프트를 만드는 방법: **같은 base 에서 세션 두 개를 딴다.** 하나를 적용하면
 * 다른 하나는 그 순간 stale 이 된다 — 이것이 out-of-band 조작 없이 재현하는
 * 동시 편집자/낡은 제안 시나리오이고, ⑬ 이 말하는 TOCTOU 창 그 자체다.
 * 호스트에 새 표면을 만들지 않는다.
 *
 * 단언 5·6 은 **거부가 일어나지 않는 것**을 판정한다 — 드리프트 게이트가
 * changeset 이 스스로 선언한 baseState 항목만 검사하고, 저작자(에이전트)는
 * `ui-artifact` 항목만 발행하므로, **스키마·데이터가 발밑에서 바뀌어도 아무도
 * 눈치채지 못한다.** 통과가 곧 결함인 단언이다.
 *
 * 단언 7·8 은 **거부가 무엇으로 보이는가**를 판정한다. 거부가 크래시와 같은 코드로
 * 나오면 소비자는 제품이 동작한 것과 망가진 것을 구별할 수 없고, 그러면 "거부되는
 * 것이 성공인 턴"을 게이트로 쓸 수 없다. 8 은 대조군이다 — 반대편이 갈려 있지
 * 않으면 7 은 구별 가능성을 증명하지 않는다.
 *
 * 단언 9 는 5·6 과 같은 성격이다(**통과가 곧 결함**) — 7 이 초록이라고 해서 부재
 * 표적이 전부 거부된다는 뜻이 아님을 게이트가 직접 말한다. 초록의 **폭**을 초록의
 * **의미**로 읽는 것이 이 게이트가 막아야 할 마지막 오독이다.
 *
 * Prerequisite: stage-host (8891) + host/server.ts (8890, **--exhibit inventory**,
 * MODEL_PROVIDER 미설정).
 *
 * Usage: node host/smoke-refusal.ts
 * Exit 0 + "smoke-refusal: 9/9 PASS" on success; exit 1 otherwise.
 */

import { addDataPatch, addSchemaOp, createChangeset, finalize } from "@vivariumjs/changeset";
import exhibit from "../exhibits/inventory/exhibit.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const TARGET = exhibit.target;
const ARTIFACT_ID = exhibit.primaryArtifactId;
const TOTAL = 9;
/** 데이터 전용 변경이 지울 행 — 이 행이 사라진 뒤에도 낡은 제안이 통과하는지가 요점. */
const DOOMED_SKU = "SKU-1003";

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
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}
async function post(path: string, body: unknown): Promise<any> {
  const { status, json } = await raw(path, body);
  if (status >= 300) throw new Error(`POST ${path} — HTTP ${status}: ${JSON.stringify(json)}`);
  return json;
}
async function world(): Promise<any> {
  return (await fetch(`${BASE}/stage/targets/${TARGET}/artifacts`)).json();
}
/** 승인 결합 — 정확한 fingerprint 에만 묶인다. */
function approve(changeset: any, fingerprint: string): any {
  const approved = structuredClone(changeset);
  approved.approvals = [
    { fingerprint, approvedBy: "smoke-refusal-reviewer", approvedAt: new Date().toISOString() },
  ];
  return approved;
}

async function main(): Promise<void> {
  await post("/stage/targets", {
    target: TARGET,
    artifacts: exhibit.artifacts,
    schema: exhibit.schema,
    data: exhibit.data,
  });

  const turn = await post("/agent/session", {
    intent: "품목에 재입고 예정일을 추가하고 표에도 보여줘",
    editContext: null,
    artifacts: [{ artifactId: ARTIFACT_ID, content: exhibit.artifacts[ARTIFACT_ID] }],
  });
  const proposal = turn.proposal;
  if (!proposal) throw new Error(`no proposal — ${JSON.stringify(turn.outcome)}`);
  const approved = approve(proposal.changeset, proposal.fingerprint);

  // ── 1. 미승인 거부 — 승인 게이트 ────────────────────────────────────────
  let n = 1;
  try {
    const propose = await post(`/stage/targets/${TARGET}/changesets`, proposal.changeset);
    const { status, json } = await raw(`/stage/sessions/${propose.sessionId}/apply`, { actor: "smoke-refusal" });
    if (status !== 409 || json.reason !== "FingerprintGate") {
      throw new Error(`expected 409 FingerprintGate, got ${status}: ${JSON.stringify(json)}`);
    }
    ok(n, "미승인 apply → 409 FingerprintGate (승인 게이트)");
  } catch (err) {
    fail(n, "미승인 apply → 409 FingerprintGate (승인 게이트)", err);
  }

  // ── 2. 드리프트 거부 — 같은 base 에서 딴 두 세션, 하나를 적용하면 다른 하나가 stale ──
  n = 2;
  let driftRefusal: any = null;
  let appliedSessionId = "";
  try {
    const sessionA = await post(`/stage/targets/${TARGET}/changesets`, approved);
    const sessionB = await post(`/stage/targets/${TARGET}/changesets`, approved);

    const applyA = await post(`/stage/sessions/${sessionA.sessionId}/apply`, {
      actor: "editor-a",
      evidence: { observed: "preview verified" },
    });
    if (applyA.state !== "Applied") throw new Error(`session A did not apply: ${JSON.stringify(applyA)}`);
    appliedSessionId = sessionA.sessionId;

    const { status, json } = await raw(`/stage/sessions/${sessionB.sessionId}/apply`, {
      actor: "editor-b",
      evidence: { observed: "preview verified" },
    });
    if (status !== 409 || json.reason !== "DriftGate") {
      throw new Error(`expected 409 DriftGate for the stale session, got ${status}: ${JSON.stringify(json)}`);
    }
    driftRefusal = json;
    ok(n, "같은 base 의 두 세션 — 하나를 적용하면 다른 하나는 409 DriftGate (동시 편집자)");
  } catch (err) {
    fail(n, "같은 base 의 두 세션 — 하나를 적용하면 다른 하나는 409 DriftGate (동시 편집자)", err);
  }

  // ── 3. 거부가 소비자에게 무엇을 주는가 — 구조 필드는 reason 하나뿐 ──────
  n = 3;
  try {
    if (!driftRefusal) throw new Error("no drift refusal captured (단언 2 실패)");
    const structural = Object.keys(driftRefusal).filter((k) => k !== "error");
    if (JSON.stringify(structural) !== JSON.stringify(["reason"])) {
      throw new Error(`refusal payload changed — structural keys: ${JSON.stringify(structural)}`);
    }
    // 어긋난 ref·기대값·실제값은 **산문 메시지 안에만** 있다. 호스트가 "무엇이
    // 어긋났는지"를 보여주려면 메시지를 파싱해야 한다 — BD-01 이 지적한 그 상태.
    const message: string = driftRefusal.error ?? "";
    const namesTheRef = message.includes(ARTIFACT_ID);
    const namesFingerprints = (message.match(/sha256:/g) ?? []).length >= 2;
    if (!namesTheRef || !namesFingerprints) {
      throw new Error(`message does not even carry the facts in prose: ${message}`);
    }
    ok(n, "거부 페이로드의 구조 필드는 reason 뿐 — 어긋난 ref·기대·실제는 산문 안에만 (BD-01)");
  } catch (err) {
    fail(n, "거부 페이로드의 구조 필드는 reason 뿐 — 어긋난 ref·기대·실제는 산문 안에만 (BD-01)", err);
  }

  // ── 4. 제안이 선언하는 base 는 UI 아티팩트뿐 ────────────────────────────
  n = 4;
  try {
    const kinds: string[] = proposal.changeset.provenance.baseState.map((e: any) => e.kind);
    const unique = [...new Set(kinds)].sort();
    if (JSON.stringify(unique) !== JSON.stringify(["ui-artifact"])) {
      throw new Error(`baseState kinds changed — got ${JSON.stringify(unique)} (게이트 전제 재검토 필요)`);
    }
    ok(n, "3-facet 제안조차 baseState 에 ui-artifact 만 선언 — 스키마·데이터 base 는 미선언");
  } catch (err) {
    fail(n, "3-facet 제안조차 baseState 에 ui-artifact 만 선언 — 스키마·데이터 base 는 미선언", err);
  }

  // 정리: 적용된 세션을 되돌려 라이브를 시드로 복귀시킨다.
  if (appliedSessionId) await post(`/stage/sessions/${appliedSessionId}/rollback`, { actor: "smoke-refusal" });

  // ── 5. 데이터 전용 변경이 라이브를 움직인다 (행 삭제) ────────────────────
  n = 5;
  try {
    // 저작자가 데이터 base 를 선언하고 싶어도 **어휘에 없다** — 스펙 §4 의
    // baseState kind 는 schema·ui-artifact·changeset 3종이고 data 가 없다.
    // 그래서 이 changeset 의 baseState 는 비어 있을 수밖에 없다.
    let draft = createChangeset({
      intent: "재고 정리 — 단종 품목 행 삭제",
      producedBy: "gallery/smoke-refusal (hand-authored, data facet only)",
      createdAt: new Date().toISOString(),
    });
    draft = addDataPatch(draft, {
      id: "retire-discontinued",
      explanation: "단종된 품목의 행을 제거한다.",
      operations: [{ op: "delete", entity: "Item", where: { field: "sku", equals: DOOMED_SKU } }],
    });
    const dataOnly: any = finalize(draft);
    const propose = await post(
      `/stage/targets/${TARGET}/changesets`,
      approve(dataOnly, dataOnly.fingerprint),
    );
    const apply = await post(`/stage/sessions/${propose.sessionId}/apply`, {
      actor: "data-steward",
      evidence: { observed: "row removal reviewed" },
    });
    if (apply.state !== "Applied") throw new Error(`data-only apply failed: ${JSON.stringify(apply)}`);
    const live = await world();
    if (live.data.Item.some((r: any) => r.sku === DOOMED_SKU)) {
      throw new Error(`row ${DOOMED_SKU} still present after the delete`);
    }
    ok(n, `데이터 전용 changeset 적용 → 행 ${DOOMED_SKU} 제거 (baseState 는 비어 있다 — data kind 부재)`);
  } catch (err) {
    fail(n, `데이터 전용 changeset 적용 → 행 ${DOOMED_SKU} 제거 (baseState 는 비어 있다 — data kind 부재)`, err);
  }

  // ── 6. 그런데 낡은 제안이 **거부되지 않는다** — 통과가 곧 결함 ──────────
  n = 6;
  try {
    // 제안은 3개 행이 있던 세계에서 저작됐고 그중 하나를 갱신하려 한다.
    // 그 행은 이제 없다. 드리프트 게이트는 제안이 선언한 것(UI 아티팩트)만
    // 보므로 아무 일도 일어나지 않는다.
    const targeted: string[] = proposal.changeset.patches.data.flatMap((p: any) =>
      p.operations.map((o: any) => String(o.where?.equals)),
    );
    if (!targeted.includes(DOOMED_SKU)) {
      throw new Error(`제안이 ${DOOMED_SKU} 를 대상으로 하지 않는다 — 이 단언의 전제가 깨졌다`);
    }
    const propose = await post(`/stage/targets/${TARGET}/changesets`, approved);
    const { status, json } = await raw(`/stage/sessions/${propose.sessionId}/apply`, {
      actor: "editor-a",
      evidence: { observed: "stale proposal re-applied" },
    });
    if (status !== 200) {
      throw new Error(
        `드리프트 게이트가 데이터 변화를 잡았다 (${status}: ${JSON.stringify(json)}) — 좋은 소식이지만 이 단언의 전제가 바뀌었으니 게이트를 갱신할 것`,
      );
    }
    const live = await world();
    const rows: any[] = live.data.Item;
    const backfilled = rows.filter((r) => r.restockDue !== undefined).length;
    if (rows.length !== 2 || backfilled !== 2) {
      throw new Error(`예상: 2행·2건 백필, 실제: ${rows.length}행·${backfilled}건 — ${JSON.stringify(rows)}`);
    }
    if (!live.schema.entities.Item.fields.restockDue) {
      throw new Error("스키마에 필드가 선언되지 않았다 — 전제 붕괴");
    }
    ok(
      n,
      "삭제된 행을 대상으로 하는 낡은 제안이 **거부 없이 적용된다** — 드리프트 게이트는 선언된 facet 만 본다 (통과=결함)",
    );
  } catch (err) {
    fail(
      n,
      "삭제된 행을 대상으로 하는 낡은 제안이 **거부 없이 적용된다** — 드리프트 게이트는 선언된 facet 만 본다 (통과=결함)",
      err,
    );
  }

  // ── 7. 어댑터 층 거부는 크래시와 다른 코드로 나온다 ──────────────────────
  n = 7;
  try {
    // well-formed 이지만 라이브 스키마에 없는 엔티티를 지목한다. 라이프사이클
    // 게이트는 이것에 할 말이 없다 — 판정하는 것은 백엔드 어댑터이고, 그 판정은
    // `prepare` 에서 일어난다(어댑터 계약이 거부의 문으로 지정한 자리).
    const absent: any = finalize(
      addSchemaOp(
        createChangeset({
          intent: "라이브에 없는 엔티티에 필드를 더한다",
          producedBy: "gallery/smoke-refusal (hand-authored, absent target)",
          createdAt: new Date().toISOString(),
        }),
        {
          op: "field.add",
          entity: "NoSuchEntity",
          field: { name: "whenever", type: "string" },
          explanation: "표적이 실재하지 않는다 — 어댑터가 판정할 몫이다.",
        },
      ),
    );
    const { status, json } = await raw(
      `/stage/targets/${TARGET}/changesets`,
      approve(absent, absent.fingerprint),
    );
    if (status !== 422 || json.reason !== "AdapterRefused") {
      throw new Error(`expected 422 AdapterRefused, got ${status}: ${JSON.stringify(json)}`);
    }
    // 거부는 무엇을 못 찾았는지 말해야 한다 — 코드만으로는 소비자가 다시 물어야 한다.
    if (!String(json.error ?? "").includes("NoSuchEntity")) {
      throw new Error(`거부가 표적을 이름으로 부르지 않는다: ${JSON.stringify(json)}`);
    }
    ok(n, "부재 표적을 지목한 변경 → 422 AdapterRefused — 어댑터 층 거부가 자기 층을 말한다");
  } catch (err) {
    fail(n, "부재 표적을 지목한 변경 → 422 AdapterRefused — 어댑터 층 거부가 자기 층을 말한다", err);
  }

  // ── 8. 대조군 — 진짜 결함은 여전히 500 ─────────────────────────────────
  n = 8;
  try {
    // 단언 7 만으로는 "거부가 코드를 하나 갖는다"까지만 말한다. **구별 가능성**은
    // 반대편이 갈려 있어야 성립하므로 대조군이 판정의 절반이다: 어댑터 예외를
    // 통째로 거부로 부르면 이 단언이 즉시 빨개진다.
    const anything: any = finalize(
      addDataPatch(
        createChangeset({
          intent: "시드된 적 없는 타깃에 말을 건다",
          producedBy: "gallery/smoke-refusal (hand-authored, control)",
          createdAt: new Date().toISOString(),
        }),
        {
          id: "control",
          explanation: "내용은 무관하다 — 타깃이 먼저 없다.",
          operations: [{ op: "delete", entity: "Item", where: { field: "sku", equals: "any" } }],
        },
      ),
    );
    const { status } = await raw("/stage/targets/no-such-target/changesets", anything);
    if (status !== 500) {
      throw new Error(
        `미지 타깃이 ${status} 로 나온다 — 거부와 결함의 경계가 옮겨졌으니 단언 7 과 함께 재검토할 것`,
      );
    }
    ok(n, "시드된 적 없는 타깃 → 500 — 거부(422)와 결함(500)이 경계에서 갈린다 (대조군)");
  } catch (err) {
    fail(n, "시드된 적 없는 타깃 → 500 — 거부(422)와 결함(500)이 경계에서 갈린다 (대조군)", err);
  }

  // ── 9. 부재 표적 거부는 **엔티티 층에만** 있다 — 통과가 곧 결함 ───────────
  n = 9;
  try {
    // 단언 7 은 부재 **엔티티** 로 거부를 일으킨다. 같은 문장이 부재 **필드** 에도
    // 성립한다고 읽으면 틀린다: 지금 소비되는 게시본에서 없는 필드를 개명하는 연산은
    // 거부되지 않고 **적용된다**. 그 결과가 새 이름 아래의 빈 선언이고, 그것은 뒤의
    // 어떤 읽기도 진짜 필드와 구별하지 못한다 — 승인된 문서가 말한 것과 다른 세계다.
    const PHANTOM = "phantomRenamed";
    const ghost: any = finalize(
      addSchemaOp(
        createChangeset({
          intent: "라이브에 없는 필드를 개명한다",
          producedBy: "gallery/smoke-refusal (hand-authored, absent field target)",
          createdAt: new Date().toISOString(),
        }),
        {
          op: "field.rename",
          entity: "Item",
          field: "noSuchFieldHere",
          newName: PHANTOM,
          explanation: "엔티티는 실재하고 필드는 실재하지 않는다.",
        },
      ),
    );
    const approvedGhost = approve(ghost, ghost.fingerprint);
    const { status: proposeStatus, json: proposeJson } = await raw(
      `/stage/targets/${TARGET}/changesets`,
      approvedGhost,
    );
    if (proposeStatus !== 200) {
      throw new Error(
        `부재 필드 표적이 ${proposeStatus} 로 거부됐다 (${JSON.stringify(proposeJson)}) — ` +
          `게시본이 그 거부를 나르기 시작했다는 뜻이므로 이 단언을 **뒤집을 것**: ` +
          `기대를 422 AdapterRefused 로 바꾸고 아래 라이브 판독을 지운다`,
      );
    }
    const applied = await post(`/stage/sessions/${proposeJson.sessionId}/apply`, {
      actor: "schema-steward",
      evidence: { observed: "reviewed" },
    });
    if (applied.state !== "Applied") throw new Error(`apply 실패: ${JSON.stringify(applied)}`);
    const fields = (await world()).schema.entities.Item.fields;
    if (!(PHANTOM in fields) || fields[PHANTOM] !== null) {
      throw new Error(
        `라이브가 예상과 다르다 — ${PHANTOM} 이 빈 선언으로 들어가 있어야 한다: ${JSON.stringify(fields)}`,
      );
    }
    await post(`/stage/sessions/${proposeJson.sessionId}/rollback`, { actor: "smoke-refusal" });
    ok(
      n,
      "부재 **필드** 를 지목한 개명은 **거부 없이 적용되고 빈 선언을 남긴다** — 부재 표적 거부는 엔티티 층에만 있다 (통과=결함)",
    );
  } catch (err) {
    fail(
      n,
      "부재 **필드** 를 지목한 개명은 **거부 없이 적용되고 빈 선언을 남긴다** — 부재 표적 거부는 엔티티 층에만 있다 (통과=결함)",
      err,
    );
  }

  console.log(
    failures.length === 0
      ? `smoke-refusal: ${passCount}/${TOTAL} PASS`
      : `smoke-refusal: ${passCount}/${TOTAL} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
