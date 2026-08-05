/**
 * 승인 전 검토 표면 게이트 (T3) — inventory 전시물 고정.
 *
 * 증명 대상: **"검토 가능한 단위"라는 주장의 *검토* 절반이 화면에 있다.** 갤러리는
 * 그동안 변경을 결과(프리뷰 렌더)로만 보여줬고, 무엇이 왜 바뀌는지는 어디에도
 * 없었다.
 *
 * 이 게이트는 브라우저 없이 jsdom 으로 `review.ts` 를 구동한다 — 검토 표면은
 * changeset 하나를 받아 DOM 을 세우는 순수 함수이므로 서버 렌더링과 같은 방식으로
 * 판정할 수 있다. 실제 changeset 은 살아 있는 호스트에서 받아온다(합성 픽스처가
 * 아니라 **파이프라인이 실제로 내는 문서**를 검토해야 의미가 있다).
 *
 * 단언 5는 **주입 안전**을 본다. 검토 화면의 입력은 전부 모델 유래(비신뢰)이고,
 * 검토 대상에게 조작당하는 검토 화면은 검토가 아니다.
 *
 * 단언 6·7 은 **크기 보고**를 본다(조각 2-b). 규모 축이 실측한 결함은 머리말이 facet
 * 마다 **틀린 단위**를 세는 것이었고 — 데이터는 패치 수를 세어 연산 1개와 39개가 같은
 * 요약을 받았다 — 그 수리는 전시물과 무관한 동작이므로 규모 게이트가 아니라 **여기서**
 * 지켜져야 한다. 규모 게이트에만 두면 한 전시물에서만 보장되는 기능이 된다.
 *
 * Prerequisite: stage-host (8891) + host/server.ts (8890, **--exhibit inventory**).
 * Usage: node host/smoke-review.ts
 * Exit 0 + "smoke-review: 5/5 PASS"; 1 otherwise.
 */

import { JSDOM } from "jsdom";
import exhibit from "../exhibits/inventory/exhibit.ts";
import { FOLD_ABOVE_LINES, renderChangesetReview, describeDataOp, describeSchemaOp } from "./review.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const ARTIFACT_ID = exhibit.primaryArtifactId;
const TOTAL = 7;

let passCount = 0;
const failures: string[] = [];
const ok = (n: number, d: string) => (passCount++, console.log(`ok ${n} - ${d}`));
const fail = (n: number, d: string, e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  failures.push(`${n} ${d}: ${m}`);
  console.log(`FAIL ${n} - ${d}\n  detail: ${m}`);
};

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} — HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text || "{}");
}

async function main(): Promise<void> {
  const dom = new JSDOM("<!doctype html><div id='review'></div>");
  const doc = dom.window.document;
  const root = doc.getElementById("review") as unknown as HTMLElement;

  const turn = await post("/agent/session", {
    intent: "품목에 재입고 예정일을 추가하고 표에도 보여줘",
    editContext: null,
    artifacts: [{ artifactId: ARTIFACT_ID, content: exhibit.artifacts[ARTIFACT_ID] }],
  });
  const changeset = turn.proposal?.changeset;
  if (!changeset) throw new Error(`no proposal — ${JSON.stringify(turn.outcome)}`);

  const counts = renderChangesetReview(root, changeset, { doc: doc as unknown as Document });
  const text = root.textContent ?? "";

  // ── 1. 세 facet 이 전부 화면에 오른다 ────────────────────────────────────
  let n = 1;
  try {
    if (counts.schema < 1 || counts.data < 1 || counts.ui < 1) {
      throw new Error(`렌더된 facet 수 ${JSON.stringify(counts)} — 3-facet 제안인데 빠진 facet 이 있다`);
    }
    for (const label of ["스키마", "데이터", "UI"]) {
      if (!text.includes(label)) throw new Error(`facet 제목 "${label}" 이 화면에 없다`);
    }
    ok(n, "3-facet 제안의 스키마·데이터·UI 가 전부 검토 화면에 오른다");
  } catch (e) {
    fail(n, "3-facet 제안의 스키마·데이터·UI 가 전부 검토 화면에 오른다", e);
  }

  // ── 2. 승인이 묶이는 대상(fingerprint)과 의도가 보인다 ──────────────────
  n = 2;
  try {
    if (!text.includes(String(changeset.intent))) throw new Error("intent 가 화면에 없다");
    if (!text.includes(String(changeset.fingerprint).slice(0, 20))) {
      throw new Error("fingerprint 가 화면에 없다 — 승인은 이 값에 묶인다");
    }
    ok(n, "의도와 fingerprint 가 보인다 (승인이 무엇에 묶이는지)");
  } catch (e) {
    fail(n, "의도와 fingerprint 가 보인다 (승인이 무엇에 묶이는지)", e);
  }

  // ── 3. 연산이 사람 문장으로 요약된다 (원시 JSON 나열이 아니다) ──────────
  n = 3;
  try {
    const schemaOp = changeset.patches.schema[0];
    const dataOp = changeset.patches.data[0]?.operations?.[0];
    const s = describeSchemaOp(schemaOp);
    if (!/추가|제거|생성|타입|제약|→/.test(s)) throw new Error(`스키마 요약이 서술이 아니다: ${s}`);
    if (!text.includes(s)) throw new Error(`스키마 요약이 화면에 없다: ${s}`);
    if (dataOp) {
      const d = describeDataOp(dataOp);
      if (!text.includes(d)) throw new Error(`데이터 요약이 화면에 없다: ${d}`);
    }
    ok(n, "스키마·데이터 연산이 사람이 읽는 문장으로 요약된다");
  } catch (e) {
    fail(n, "스키마·데이터 연산이 사람이 읽는 문장으로 요약된다", e);
  }

  // ── 4. UI 변경은 diff 로 보인다 — 결과가 아니라 **차이** ────────────────
  n = 4;
  try {
    const uiPatch = changeset.patches.ui[0];
    const diff = uiPatch.diff ?? uiPatch.reviewDiff;
    if (typeof diff !== "string" || diff === "") {
      throw new Error(`changeset 의 UI 패치에 diff 가 없다(profile=${uiPatch.profile}) — 전제 붕괴`);
    }
    // 검토 대상이 **편집**임을 구속한다. 생성(빈 base 로부터의 전체 추가)도 diff 로
    // 렌더되므로, 크기를 세기만 하면 엉뚱한 전시물을 판정하면서도 통과한다 —
    // 실제로 그런 통과가 오진 하나를 만들었다.
    if (uiPatch.profile !== "verified-diff@0" || !uiPatch.baseFingerprint) {
      throw new Error(
        `검토 대상이 편집이 아니다(profile=${uiPatch.profile}, baseFingerprint=${uiPatch.baseFingerprint}) — ` +
        "이 전시물의 변경은 열 하나 추가이고, 생성 diff 가 왔다면 잘못된 호스트·전시물을 보고 있다",
      );
    }
    const added = root.querySelectorAll(".diff-add").length;
    const removed = root.querySelectorAll(".diff-del").length;
    // scripted provider 라 제안이 결정적이므로 크기도 값으로 박는다. 전시물의
    // 변경이 바뀌면 여기서 실패해야 한다 — 조용히 다른 것을 판정하느니 갱신을 요구한다.
    const EXPECTED = { added: 1, removed: 0 };
    if (added !== EXPECTED.added || removed !== EXPECTED.removed) {
      throw new Error(
        `예상: 추가 ${EXPECTED.added}줄·삭제 ${EXPECTED.removed}줄, 실제: 추가 ${added}줄·삭제 ${removed}줄 — ` +
        "전시물의 변경이 바뀌었다면 이 기대값을 갱신할 것",
      );
    }
    ok(n, `UI 변경이 **편집** diff 로 표시된다 (추가 ${added}줄 · 삭제 ${removed}줄)`);
  } catch (e) {
    fail(n, "UI 변경이 diff 로 표시된다", e);
  }

  // ── 5. 주입 안전 — 검토 대상이 검토 화면을 조작하지 못한다 ──────────────
  n = 5;
  try {
    const hostile = structuredClone(changeset);
    hostile.intent = "<img src=x onerror=alert(1)>";
    hostile.patches.schema[0] = {
      ...hostile.patches.schema[0],
      explanation: "<script>alert(2)</script>",
    };
    const root2 = doc.createElement("div") as unknown as HTMLElement;
    renderChangesetReview(root2, hostile, { doc: doc as unknown as Document });
    if (root2.querySelector("img") || root2.querySelector("script")) {
      throw new Error("모델 유래 문자열이 마크업으로 해석됐다");
    }
    if (!(root2.textContent ?? "").includes("<img src=x onerror=alert(1)>")) {
      throw new Error("문자열이 텍스트로도 보이지 않는다 — 조용히 삼켰다");
    }
    ok(n, "모델 유래 문자열은 텍스트로만 렌더된다 (마크업 해석 0, 침묵 삼킴 0)");
  } catch (e) {
    fail(n, "모델 유래 문자열은 텍스트로만 렌더된다 (마크업 해석 0, 침묵 삼킴 0)", e);
  }

  // ── 6. 머리말이 facet 마다 **그 facet 의 크기 단위**를 센다 ───────────────
  // 옛 문안은 셋 다 패치 수를 셌다. 데이터 패치 하나가 연산 39개를 담을 수 있으므로
  // 그것은 크기가 아니었고, 실측에서 108자짜리 화면과 1,725자짜리 화면이 같은 요약을
  // 받았다. 스키마만 맞았던 것은 우연이다(스키마 패치 하나 = 연산 하나).
  n = 6;
  try {
    const mk = (ops: number): string => {
      const r2 = doc.createElement("div");
      renderChangesetReview(
        r2 as unknown as HTMLElement,
        {
          intent: "x",
          fingerprint: "sha256:0",
          patches: {
            schema: [],
            data: [
              {
                id: "p",
                explanation: "e",
                operations: Array.from({ length: ops }, (_, i) => ({
                  op: "update",
                  entity: "Item",
                  where: { field: "id", equals: `I-${i}` },
                  set: { touched: i },
                })),
              },
            ],
            ui: [],
          },
        },
        { doc: doc as unknown as Document },
      );
      return r2.querySelector(".review-facets")?.textContent ?? "";
    };
    const one = mk(1);
    const many = mk(39);
    if (one === many) {
      throw new Error(`데이터 패치 1개에 연산 1개와 39개가 같은 요약을 받는다: ${JSON.stringify(one)}`);
    }
    if (!one.includes("데이터 연산 1") || !many.includes("데이터 연산 39")) {
      throw new Error(`머리말이 데이터 **연산** 수를 세지 않는다: ${JSON.stringify([one, many])}`);
    }
    ok(n, `머리말이 facet 마다 크기 단위를 센다 — 같은 패치 1개가 연산 수에 따라 "${one}" / "${many}"`);
  } catch (e) {
    fail(n, "머리말이 facet 마다 그 facet 의 크기 단위를 센다", e);
  }

  // ── 7. 임계를 넘는 diff 는 접히되 **크기는 접히지 않는다** ────────────────
  // 이 모듈이 고치는 결함이 "승인 전에 크기를 알 수 없다" 이므로, 접힘이 그 결함을
  // 다시 만들면 수리가 아니다. 요약은 접힌 상태에서도 보여야 한다.
  n = 7;
  try {
    const withDiff = (lines: number): Element => {
      const r2 = doc.createElement("div");
      const NL = "\n";
      const body = Array.from({ length: lines }, (_, i) => `+line ${i}`).join(NL);
      renderChangesetReview(
        r2 as unknown as HTMLElement,
        {
          intent: "x",
          fingerprint: "sha256:0",
          patches: {
            schema: [],
            data: [],
            ui: [{ profile: "verified-diff@0", artifactId: "a", baseFingerprint: "sha256:0",
                   diff: `@@ -1,1 +1,${lines} @@${NL}${body}`, newFingerprint: "sha256:1", explanation: "e" }],
          },
        },
        { doc: doc as unknown as Document },
      );
      return r2;
    };
    const small = withDiff(FOLD_ABOVE_LINES - 10);
    const large = withDiff(FOLD_ABOVE_LINES + 10);
    if (small.querySelectorAll("details, .review-fold").length !== 0) {
      throw new Error("임계 아래의 diff 가 접혔다 — 문제없던 화면을 접고 있다");
    }
    if (large.querySelectorAll("details, .review-fold").length !== 1) {
      throw new Error("임계 위의 diff 가 접히지 않았다");
    }
    const summary = large.querySelector(".review-diff-size")?.textContent ?? "";
    if (!/\+\d+ −\d+/.test(summary)) {
      throw new Error(`접힌 diff 의 요약이 크기를 말하지 않는다: ${JSON.stringify(summary)}`);
    }
    // 접혀도 본문은 문서 안에 있다 — 승인자가 펼칠 수 있어야 한다.
    if (large.querySelectorAll(".review-diff span").length < FOLD_ABOVE_LINES) {
      throw new Error("접힌 diff 의 본문이 사라졌다 — 접는 것과 감추는 것은 다르다");
    }
    ok(n, `임계(${FOLD_ABOVE_LINES}줄) 위만 접히고 요약은 남는다 — "${summary}"`);
  } catch (e) {
    fail(n, "임계를 넘는 diff 는 접히되 크기는 접히지 않는다", e);
  }

  console.log(
    failures.length === 0
      ? `smoke-review: ${passCount}/${TOTAL} PASS`
      : `smoke-review: ${passCount}/${TOTAL} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
