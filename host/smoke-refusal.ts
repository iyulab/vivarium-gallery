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
 * 단언 4~6 은 **스키마·데이터 발밑이 움직이면 게이트가 본다**를 판정한다. 드리프트
 * 게이트는 changeset 이 스스로 선언한 baseState 항목만 검사한다. 예전에는
 * 저작자(에이전트)가 `ui-artifact` 항목만 발행해서 데이터가 바뀌어도 아무도 눈치채지
 * 못했고, 이 단언들은 그것을 "통과가 곧 결함"으로 고정하고 있었다. 이제 호스트가
 * 스키마·데이터의 라이브 뷰와 그 지문을 에이전트에 공급하고(agent 0.2.0 ·
 * `SchemaInput.base`/`DataInput.base`), stage 가 spec 0.3.0 의 `data` kind 를 받아들이므로
 * (Vivarium.Stage 0.7.0) 세 단언이 뒤집혔다 — 삭제된 행을 겨누는 낡은 제안은 거부된다.
 *
 * 단언 7·8 은 **거부가 무엇으로 보이는가**를 판정한다. 거부가 크래시와 같은 코드로
 * 나오면 소비자는 제품이 동작한 것과 망가진 것을 구별할 수 없고, 그러면 "거부되는
 * 것이 성공인 턴"을 게이트로 쓸 수 없다. 8 은 대조군이다 — 반대편이 갈려 있지
 * 않으면 7 은 구별 가능성을 증명하지 않는다. Vivarium.Stage 0.9 부터 어댑터가 거부에
 * 이름(`AdapterRefusalReason`)을 붙이므로, 대조군은 "결함은 500"이 아니라 **거부의 종류가
 * 경계에서 갈린다**(부재 타깃 404 ↔ 문서 거부 422)를 본다. 결함이 500 인 것은 이제 호스트가
 * 이름 붙은 타입만 잡는다는 구조가 보장하고, 결함을 일으킬 표면은 만들지 않는다.
 *
 * 단언 9 는 7 의 거부가 **필드 층까지** 닿는지 본다 — Vivarium.Stage 0.6.0 이전에는
 * 닿지 않았고(부재 필드 개명이 조용히 적용됐다) 게이트가 그것을 고정하고 있었다.
 * 단언 3 도 같은 범프로 뒤집혔다 — 거부가 어긋난 사실을 구조로 나른다.
 *
 * Prerequisite: stage-host (8891) + host/server.ts (8890, **--exhibit inventory**,
 * MODEL_PROVIDER 미설정).
 *
 * Usage: node host/smoke-refusal.ts
 * Exit 0 + "smoke-refusal: 9/9 PASS" on success; exit 1 otherwise.
 */

import { addApproval, addDataPatch, addSchemaOp, createChangeset, finalize } from "@vivariumjs/changeset";
import exhibit from "../exhibits/inventory/exhibit.ts";
import { refusalFacts } from "./refusal-facts.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const TARGET = exhibit.target;
const ARTIFACT_ID = exhibit.primaryArtifactId;
const TOTAL = 9;
/** 데이터 전용 변경이 지울 행 — 이 행이 사라진 뒤에도 낡은 제안이 통과하는지가 요점. */
const DOOMED_SKU = "SKU-1003";

let passCount = 0;
const failures: string[] = [];

/**
 * Vivarium.Stage 0.9 는 어댑터 거부에 이름을 붙인다 — `adapterReason` 이 어느 계약 조항이
 * 거부했는지를, 문서 거부면 `details.errors` 가 체인지셋 안의 자리를 짚는다. 소비자는 메시지가
 * 아니라 이 구조로 움직이므로 게이트도 구조를 판정한다. `member` 는 짚혀야 할 멤버(`.entity` 등).
 */
function assertDocumentRefusal(json: any, member: string): void {
  if (json.adapterReason !== "DocumentRefused") {
    throw new Error(`adapterReason 이 DocumentRefused 가 아니다: ${JSON.stringify(json)}`);
  }
  const errors = json.details?.errors;
  const located = Array.isArray(errors) && errors.length > 0 &&
    errors.every((e: any) => typeof e?.path === "string" && e.path.startsWith("$") && typeof e?.message === "string");
  if (!located) throw new Error(`details.errors 가 문서 안의 자리를 짚지 않는다: ${JSON.stringify(json)}`);
  if (!errors.some((e: any) => e.path.endsWith(member))) {
    throw new Error(`details.errors 가 ${member} 를 짚지 않는다: ${JSON.stringify(errors)}`);
  }
}

/**
 * 앱이 이 거부를 **사람 말로** 옮기는가 — 앱이 쓰는 바로 그 함수(`refusal-facts.ts`)에
 * 호스트가 실제로 돌려준 본문을 넣는다. 구조가 와도 앱이 JSON 덤프로 떨어지면 사람에게는
 * 산문 파싱과 다를 바 없다 — 판정 구조는 소비자까지 닿아야 한다.
 */
function assertReadable(json: any, title: string, mentions: string): void {
  const facts = refusalFacts(json);
  if (facts.length === 0 || facts.some(([t]) => t === "게이트가 관측한 사실")) {
    throw new Error(`앱이 이 거부를 읽지 못하고 받은 그대로 보인다: ${JSON.stringify(facts)}`);
  }
  const [head, body] = facts[0];
  if (!head.includes(title) || !body.includes(mentions)) {
    throw new Error(`앱 문장이 "${title}" 제목 아래 ${mentions} 를 짚지 않는다: ${JSON.stringify(facts)}`);
  }
}

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
/** 승인 결합 — 정확한 fingerprint 에만 묶인다(`addApproval` 이 문서 자신의 것을 쓴다). */
function approve(changeset: any): any {
  return addApproval(changeset, { approvedBy: "smoke-refusal-reviewer", approvedAt: new Date().toISOString() });
}

async function main(): Promise<void> {
  const seeded = await post("/stage/targets", {
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
  const approved = approve(proposal.changeset);

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

  // ── 3. 거부가 소비자에게 무엇을 주는가 — 어긋난 ref·기대·실제가 구조로 온다 ──
  n = 3;
  try {
    if (!driftRefusal) throw new Error("no drift refusal captured (단언 2 실패)");
    // Vivarium.Stage 0.6.0 이전에는 구조 필드가 `reason` 하나뿐이었고 어긋난 사실은
    // 산문 메시지 안에만 있었다(BD-01). 이제 호스트가 메시지를 파싱하지 않고
    // "무엇이 어긋났는지"를 보여 줄 수 있어야 한다.
    const details = driftRefusal.details;
    if (!details || details.scope !== "base-state" || !Array.isArray(details.drifted)) {
      throw new Error(`drift refusal carries no structured base-state details: ${JSON.stringify(driftRefusal)}`);
    }
    const entry = details.drifted.find((d: any) => d.ref === ARTIFACT_ID);
    if (!entry) throw new Error(`drifted 가 어긋난 ref 를 지목하지 않는다: ${JSON.stringify(details.drifted)}`);
    const isFp = (v: unknown) => typeof v === "string" && v.startsWith("sha256:");
    if (!isFp(entry.expected) || !isFp(entry.actual) || entry.expected === entry.actual) {
      throw new Error(`기대·실제 지문이 구별되지 않는다: ${JSON.stringify(entry)}`);
    }
    assertReadable(driftRefusal, "어긋난 것", ARTIFACT_ID);
    ok(n, "드리프트 거부가 어긋난 ref·기대·실제 지문을 **구조로** 나른다 — 산문 파싱 불필요 (BD-01 해소), 앱이 그것을 사람 말로 옮긴다");
  } catch (err) {
    fail(n, "드리프트 거부가 어긋난 ref·기대·실제 지문을 **구조로** 나른다 — 산문 파싱 불필요 (BD-01 해소), 앱이 그것을 사람 말로 옮긴다", err);
  }

  // ── 4. 3-facet 제안이 세 facet 의 base 를 전부 선언한다 ──────────────────
  n = 4;
  const desc4 = "3-facet 제안이 schema·data·ui-artifact base 를 **전부** 선언한다 — 지문은 시드 시점의 라이브 그대로";
  try {
    const entries: any[] = proposal.changeset.provenance.baseState;
    const kinds = [...new Set(entries.map((e) => e.kind))].sort();
    if (JSON.stringify(kinds) !== JSON.stringify(["data", "schema", "ui-artifact"])) {
      throw new Error(`baseState kinds — got ${JSON.stringify(kinds)}`);
    }
    // 선언이 있다는 것만으로는 부족하다 — 호스트가 공급한 지문이 라이브와 같아야 게이트가 뜻을 갖는다.
    for (const e of entries) {
      if (e.fingerprint !== seeded.fingerprints[e.ref]) {
        throw new Error(`${e.kind}/${e.ref} 지문이 라이브와 다르다: ${e.fingerprint} ≠ ${seeded.fingerprints[e.ref]}`);
      }
    }
    if (proposal.changeset.specVersion !== "0.3.0") {
      throw new Error(`data base 를 선언한 문서는 spec 0.3.0 이어야 한다 — got ${proposal.changeset.specVersion}`);
    }
    ok(n, desc4);
  } catch (err) {
    fail(n, desc4, err);
  }

  // 정리: 적용된 세션을 되돌려 라이브를 시드로 복귀시킨다.
  if (appliedSessionId) await post(`/stage/sessions/${appliedSessionId}/rollback`, { actor: "smoke-refusal" });

  // ── 5. 데이터 전용 변경이 라이브를 움직인다 (행 삭제) ────────────────────
  n = 5;
  const desc5 = `데이터 전용 changeset(data base 선언 · spec 0.3.0) 적용 → 행 ${DOOMED_SKU} 제거`;
  try {
    // spec 0.3.0 이 `data` kind 를 더했다 — 데이터만 바꾸는 저작자도 자기가 선 자리를 선언한다.
    const live0 = await world();
    let draft = createChangeset({
      intent: "재고 정리 — 단종 품목 행 삭제",
      producedBy: "gallery/smoke-refusal (hand-authored, data facet only)",
      createdAt: new Date().toISOString(),
      baseState: [{ kind: "data", ref: "data", fingerprint: live0.fingerprints.data }],
    });
    draft = addDataPatch(draft, {
      id: "retire-discontinued",
      explanation: "단종된 품목의 행을 제거한다.",
      operations: [{ op: "delete", entity: "Item", where: { field: "sku", equals: DOOMED_SKU } }],
    });
    const dataOnly: any = finalize(draft);
    const propose = await post(
      `/stage/targets/${TARGET}/changesets`,
      approve(dataOnly),
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
    ok(n, desc5);
  } catch (err) {
    fail(n, desc5, err);
  }

  // ── 6. 삭제된 행을 겨누는 낡은 제안은 **거부된다** ─────────────────────
  n = 6;
  const desc6 =
    "삭제된 행을 겨누는 낡은 제안 → 409 DriftGate — 어긋난 것은 **data 하나**로 지목되고 라이브는 그대로";
  try {
    // 제안은 3개 행이 있던 세계에서 저작됐고 그중 하나를 갱신하려 한다. 그 행은
    // 이제 없다. 스키마·UI 는 롤백으로 시드 그대로라 어긋난 것은 데이터뿐이다.
    const targeted: string[] = proposal.changeset.patches.data.flatMap((p: any) =>
      p.operations.map((o: any) => String(o.where?.equals)),
    );
    if (!targeted.includes(DOOMED_SKU)) {
      throw new Error(`제안이 ${DOOMED_SKU} 를 대상으로 하지 않는다 — 이 단언의 전제가 깨졌다`);
    }
    const before = await world();
    const propose = await post(`/stage/targets/${TARGET}/changesets`, approved);
    const { status, json } = await raw(`/stage/sessions/${propose.sessionId}/apply`, {
      actor: "editor-a",
      evidence: { observed: "stale proposal re-applied" },
    });
    if (status !== 409 || json.reason !== "DriftGate") {
      throw new Error(`expected 409 DriftGate, got ${status}: ${JSON.stringify(json)}`);
    }
    const drifted: any[] = json.details?.drifted ?? [];
    if (drifted.length !== 1 || drifted[0].kind !== "data" || drifted[0].ref !== "data") {
      throw new Error(`drifted 는 data 하나여야 한다: ${JSON.stringify(drifted)}`);
    }
    const after = await world();
    if (JSON.stringify(after.data) !== JSON.stringify(before.data) || after.schema.entities.Item.fields.restockDue) {
      throw new Error("거부됐는데 라이브가 움직였다");
    }
    ok(n, desc6);
  } catch (err) {
    fail(n, desc6, err);
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
      approve(absent),
    );
    if (status !== 422 || json.reason !== "AdapterRefused") {
      throw new Error(`expected 422 AdapterRefused, got ${status}: ${JSON.stringify(json)}`);
    }
    assertDocumentRefusal(json, ".entity");
    assertReadable(json, "실행할 수 없는 자리", ".entity");
    // 거부는 무엇을 못 찾았는지 말해야 한다 — 코드만으로는 소비자가 다시 물어야 한다.
    if (!String(json.error ?? "").includes("NoSuchEntity")) {
      throw new Error(`거부가 표적을 이름으로 부르지 않는다: ${JSON.stringify(json)}`);
    }
    ok(n, "부재 표적을 지목한 변경 → 422 AdapterRefused — 어댑터 층 거부가 자기 층을 말한다");
  } catch (err) {
    fail(n, "부재 표적을 지목한 변경 → 422 AdapterRefused — 어댑터 층 거부가 자기 층을 말한다", err);
  }

  // ── 8. 대조군 — 거부의 종류가 경계에서 갈린다 ─────────────────────────
  n = 8;
  try {
    // 단언 7 만으로는 "거부가 코드를 하나 갖는다"까지만 말한다. **구별 가능성**은
    // 반대편이 갈려 있어야 성립하므로 대조군이 판정의 절반이다: 어댑터 거부를
    // 종류와 무관하게 한 코드로 뭉개면 이 단언이 즉시 빨개진다. Vivarium.Stage 0.8
    // 까지는 이 자리가 500 이었다 — 부재 타깃이 이름 없는 예외로 나와 결함과 같았다.
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
    const { status, json } = await raw("/stage/targets/no-such-target/changesets", anything);
    if (status !== 404 || json.reason !== "UnknownTarget") {
      throw new Error(
        `미지 타깃이 ${status} ${JSON.stringify(json)} 로 나온다 — 부재는 문서 거부(422)와 다른 자리여야 한다`,
      );
    }
    ok(n, "시드된 적 없는 타깃 → 404 UnknownTarget — 부재(404)와 문서 거부(422)가 경계에서 갈린다 (대조군)");
  } catch (err) {
    fail(n, "시드된 적 없는 타깃 → 404 UnknownTarget — 부재(404)와 문서 거부(422)가 경계에서 갈린다 (대조군)", err);
  }

  // ── 9. 부재 표적 거부는 **필드 층에도** 있다 ───────────────────────────────
  n = 9;
  try {
    // 단언 7 은 부재 **엔티티** 로 거부를 일으킨다. Vivarium.Stage 0.6.0 이전에는
    // 같은 문장이 부재 **필드** 에는 성립하지 않았다 — 없는 필드를 개명하면 적용되고
    // 새 이름 아래 빈 선언이 남았다(통과가 곧 결함). 이제는 같은 거부여야 한다.
    const before = JSON.stringify((await world()).schema);
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
          newName: "phantomRenamed",
          explanation: "엔티티는 실재하고 필드는 실재하지 않는다.",
        },
      ),
    );
    const approvedGhost = approve(ghost);
    const { status, json } = await raw(`/stage/targets/${TARGET}/changesets`, approvedGhost);
    if (status !== 422 || json.reason !== "AdapterRefused") {
      throw new Error(`expected 422 AdapterRefused, got ${status}: ${JSON.stringify(json)}`);
    }
    assertDocumentRefusal(json, ".field");
    assertReadable(json, "실행할 수 없는 자리", ".field");
    if (!String(json.error ?? "").includes("noSuchFieldHere")) {
      throw new Error(`거부가 필드를 이름으로 부르지 않는다: ${JSON.stringify(json)}`);
    }
    if (JSON.stringify((await world()).schema) !== before) {
      throw new Error("거부됐는데 라이브 스키마가 바뀌었다");
    }
    ok(n, "부재 **필드** 를 지목한 개명 → 422 AdapterRefused — 부재 표적 거부가 필드 층까지 닿는다");
  } catch (err) {
    fail(n, "부재 **필드** 를 지목한 개명 → 422 AdapterRefused — 부재 표적 거부가 필드 층까지 닿는다", err);
  }

  console.log(
    failures.length === 0
      ? `smoke-refusal: ${passCount}/${TOTAL} PASS`
      : `smoke-refusal: ${passCount}/${TOTAL} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
