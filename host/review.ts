/**
 * 승인 전 변경 검토 표면 (T3, **host 한정**).
 *
 * 갤러리는 지금까지 변경을 **결과로만** 보여줬다 — 프리뷰 샌드박스가 바뀐 화면을
 * 렌더하지만, "무엇이 왜 바뀌는가"는 어디에도 없었다. "검토 가능한 단위"라는 주장의
 * **검토 절반이 화면에 없던 것**이다.
 *
 * 이 모듈은 **changeset 이 이미 담고 있는 것을 렌더할 뿐이다.** 라이브러리에 아무것도
 * 추가하지 않는다(계획 §T3 경계) — diff 렌더링·리뷰 UX 는 호스트 영역이다.
 *
 * **주입 안전**: changeset 의 intent·explanation·diff 는 전부 **모델 유래(비신뢰)**다.
 * 이 모듈은 어떤 문자열도 innerHTML 로 넣지 않는다 — 전부 textContent 로 DOM 을
 * 세운다. 검토 화면이 검토 대상에게 조작당하면 검토가 아니다.
 */

/** 문서에 의존하지 않도록 document 를 주입받는다(jsdom 게이트에서 그대로 쓰인다). */
export interface ReviewDeps {
  doc: Document;
}

function el(doc: Document, tag: string, className?: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 스키마 연산 하나를 사람이 읽는 한 줄로. 어휘는 스펙 §5.1 의 닫힌 목록이다. */
export function describeSchemaOp(op: Record<string, any>): string {
  const entity = String(op.entity ?? "?");
  switch (op.op) {
    case "entity.create":
      return `엔티티 ${entity} 생성 (필드 ${(op.fields ?? []).length}개)`;
    case "entity.rename":
      return `엔티티 ${entity} → ${op.newName}`;
    case "entity.remove":
      return `엔티티 ${entity} 제거`;
    case "field.add":
      return `${entity}.${op.field?.name} 추가 (${op.field?.type})`;
    case "field.rename":
      return `${entity}.${op.field} → ${op.newName}`;
    case "field.retype":
      return `${entity}.${op.field} 타입 → ${op.newType}`;
    case "field.remove":
      return `${entity}.${op.field} 제거`;
    case "constraint.add":
      return `${entity} 제약 추가`;
    case "constraint.remove":
      return `${entity} 제약 제거`;
    default:
      return `알 수 없는 연산: ${String(op.op)}`;
  }
}

/** 데이터 연산 하나를 사람이 읽는 한 줄로 (스펙 §5.3 — where 는 {field, equals}). */
export function describeDataOp(op: Record<string, any>): string {
  const entity = String(op.entity ?? "?");
  const where = op.where ? `${op.where.field} = ${JSON.stringify(op.where.equals)}` : "전체";
  switch (op.op) {
    case "insert":
      return `${entity} 행 추가 ${JSON.stringify(op.values ?? {})}`;
    case "update":
      return `${entity} 갱신 [${where}] → ${JSON.stringify(op.set ?? {})}`;
    case "delete":
      return `${entity} 삭제 [${where}]`;
    default:
      return `알 수 없는 연산: ${String(op.op)}`;
  }
}

/**
 * diff 하나의 **크기**. 머리말과 접힘 판정이 같은 값을 본다.
 *
 * 세는 단위가 `+`/`-` 줄인 이유: 승인자가 알아야 하는 것은 문서에 담긴 줄 수가 아니라
 * **무엇이 바뀌는가의 양**이다. 문맥 줄은 diff 알고리즘이 정하는 값이라 변경의 크기가
 * 아니다.
 */
export interface DiffSize {
  added: number;
  removed: number;
  hunks: number;
  /** 렌더될 총 줄 수 — 접힘 판정의 입력. */
  lines: number;
}

export function measureDiff(diff: string): DiffSize {
  const lines = diff.split("\n");
  let added = 0;
  let removed = 0;
  let hunks = 0;
  for (const line of lines) {
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
    else if (line.startsWith("@")) hunks++;
  }
  return { added, removed, hunks, lines: lines.length };
}

/**
 * 이 줄 수를 넘는 diff 는 **접어서** 낸다.
 *
 * 발명한 값이 아니라 실측에서 도출한 값이다. 작은 전시물(25줄 아티팩트)의 **최악**
 * 변경 — 모든 줄이 바뀌는 경우 — 이 **약 52줄 diff / 2,420자**였고, 그것이 한 화면에
 * 들어가 문제되지 않던 크기다. 그래서 임계를 **그 위에** 둔다: *지금까지 무해했던
 * 것은 전부 펼친 채로 남고, 그보다 큰 것부터 접힌다.* 임계를 52 아래로 내리면 이
 * 장치가 아무 문제도 없던 화면을 접기 시작한다.
 *
 * 접어도 **크기는 접히지 않는다** — 요약 줄이 항상 보인다. 이 모듈이 고치는 결함이
 * 정확히 *"승인 전에 크기를 알 수 없다"* 이므로, 접힘이 그 결함을 다시 만들면 안 된다.
 */
export const FOLD_ABOVE_LINES = 60;

/** diff 본문을 줄 단위로 색칠해 렌더한다 (문자열 조작 없이 줄별 노드). */
function renderDiffBody(doc: Document, diff: string): HTMLElement {
  const pre = el(doc, "pre", "review-diff");
  for (const line of diff.split("\n")) {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@") ? "hunk" : "ctx";
    const span = el(doc, "span", `diff-${cls}`, line);
    pre.append(span, doc.createTextNode("\n"));
  }
  return pre;
}

/**
 * diff 를 크기 요약과 함께 낸다. 임계를 넘으면 `<details>` 로 접되 요약은 **항상**
 * 보이게 둔다.
 *
 * 주입 안전은 여기서도 유지된다 — 요약 문자열은 이 모듈이 숫자로 만들고, diff 본문은
 * 종전대로 `textContent` 로만 들어간다(`innerHTML` 미사용).
 */
function renderDiff(doc: Document, diff: string): HTMLElement {
  const size = measureDiff(diff);
  const label = `+${size.added} −${size.removed} · ${size.hunks}개 구간 · ${size.lines}줄`;
  if (size.lines <= FOLD_ABOVE_LINES) {
    const wrap = el(doc, "div", "review-diff-wrap");
    wrap.append(el(doc, "p", "review-diff-size", label));
    wrap.append(renderDiffBody(doc, diff));
    return wrap;
  }
  const details = doc.createElement("details");
  details.className = "review-fold";
  const summary = doc.createElement("summary");
  summary.className = "review-diff-size";
  summary.textContent = `${label} — 펼쳐서 보기`;
  details.append(summary, renderDiffBody(doc, diff));
  return details;
}

function facetBlock(doc: Document, title: string, count: number): HTMLElement {
  const section = el(doc, "section", "review-facet");
  section.append(el(doc, "h3", undefined, `${title} (${count})`));
  return section;
}

/**
 * 검토 표면을 root 에 그린다. 반환값은 렌더된 facet 별 항목 수 — 게이트가 단언할
 * 대상이며, 화면과 판정이 같은 값을 본다.
 */
export function renderChangesetReview(
  root: HTMLElement,
  changeset: Record<string, any>,
  deps: ReviewDeps = { doc: root.ownerDocument! },
): { schema: number; data: number; ui: number } {
  const doc = deps.doc;
  root.replaceChildren();

  const patches = changeset.patches ?? {};
  const schema: any[] = patches.schema ?? [];
  const data: any[] = patches.data ?? [];
  const ui: any[] = patches.ui ?? [];

  // 머리말 — 무엇을 승인하려는가. fingerprint 는 승인이 묶이는 대상 그 자체다.
  const head = el(doc, "div", "review-head");
  head.append(el(doc, "p", "review-intent", changeset.intent ?? "(intent 없음)"));
  head.append(
    el(doc, "p", "review-fp", `fingerprint ${String(changeset.fingerprint ?? "").slice(0, 23)}…`),
  );
  // 머리말은 facet 마다 **그 facet 의 크기 단위**를 센다.
  //
  // 옛 문안은 셋 다 *패치 수*를 셌고, 그중 둘에서 그것은 크기가 아니었다: 데이터 패치
  // 하나가 연산 39개를 담을 수 있고, UI 패치 하나가 한 줄짜리 변경일 수도 전면
  // 재작성일 수도 있다. 실측에서 439자짜리 화면과 24,586자짜리 화면이 **글자 그대로
  // 같은 요약**을 받았다. 스키마만 맞았던 것은 우연이다 — 스키마 패치 하나가 곧
  // 연산 하나이기 때문이다.
  //
  // 그래서 단위를 갈랐다: 스키마는 **연산**, 데이터는 **연산**(패치 아님), UI 는
  // **변경 줄**. 셋 다 changeset 이 이미 담고 있는 값에서 나오며, 새 필드를 요구하지
  // 않는다(라이브러리 무변경).
  const dataOps = data.reduce((sum, patch) => sum + (patch.operations?.length ?? 0), 0);
  const uiSize = ui.reduce(
    (acc, patch) => {
      const diff = patch.diff ?? patch.reviewDiff;
      if (typeof diff !== "string" || diff === "") return acc;
      const size = measureDiff(diff);
      return { added: acc.added + size.added, removed: acc.removed + size.removed };
    },
    { added: 0, removed: 0 },
  );
  head.append(
    el(
      doc,
      "p",
      "review-facets",
      `facet — 스키마 연산 ${schema.length} · 데이터 연산 ${dataOps}` +
        `(패치 ${data.length}) · UI +${uiSize.added} −${uiSize.removed}(아티팩트 ${ui.length})`,
    ),
  );
  root.append(head);

  if (schema.length > 0) {
    const block = facetBlock(doc, "스키마", schema.length);
    for (const op of schema) {
      const item = el(doc, "div", "review-item");
      item.append(el(doc, "code", undefined, describeSchemaOp(op)));
      item.append(el(doc, "p", "review-why", String(op.explanation ?? "")));
      block.append(item);
    }
    root.append(block);
  }

  if (data.length > 0) {
    const block = facetBlock(doc, "데이터", data.length);
    for (const patch of data) {
      const item = el(doc, "div", "review-item");
      item.append(el(doc, "p", "review-why", String(patch.explanation ?? "")));
      const list = el(doc, "ul", "review-ops");
      for (const op of patch.operations ?? []) {
        list.append(el(doc, "li", undefined, describeDataOp(op)));
      }
      item.append(list);
      block.append(item);
    }
    root.append(block);
  }

  if (ui.length > 0) {
    const block = facetBlock(doc, "UI", ui.length);
    for (const patch of ui) {
      const item = el(doc, "div", "review-item");
      item.append(el(doc, "code", undefined, `${patch.artifactId} · ${patch.profile}`));
      item.append(el(doc, "p", "review-why", String(patch.explanation ?? "")));
      // whole-artifact@0 은 reviewDiff, verified-diff@0 은 diff 를 담는다 —
      // 둘 다 **검토를 위해** 문서에 이미 들어 있는 값이다(스펙 §5.2).
      const diff = patch.diff ?? patch.reviewDiff;
      if (typeof diff === "string" && diff !== "") item.append(renderDiff(doc, diff));
      block.append(item);
    }
    root.append(block);
  }

  return { schema: schema.length, data: data.length, ui: ui.length };
}
