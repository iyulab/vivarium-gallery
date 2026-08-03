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
 * Prerequisite: stage-host (8891) + host/server.ts (8890, **--exhibit inventory**).
 * Usage: node host/smoke-review.ts
 * Exit 0 + "smoke-review: 5/5 PASS"; 1 otherwise.
 */

import { JSDOM } from "jsdom";
import exhibit from "../exhibits/inventory/exhibit.ts";
import { renderChangesetReview, describeDataOp, describeSchemaOp } from "./review.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const ARTIFACT_ID = exhibit.primaryArtifactId;
const TOTAL = 5;

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
    const added = root.querySelectorAll(".diff-add").length;
    const removed = root.querySelectorAll(".diff-del").length;
    if (added === 0 && removed === 0) throw new Error("diff 가 렌더됐으나 추가/삭제 줄이 하나도 표시되지 않았다");
    ok(n, `UI 변경이 diff 로 표시된다 (추가 ${added}줄 · 삭제 ${removed}줄)`);
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

  console.log(
    failures.length === 0
      ? `smoke-review: ${passCount}/${TOTAL} PASS`
      : `smoke-review: ${passCount}/${TOTAL} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
