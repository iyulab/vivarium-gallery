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

/** diff 본문을 줄 단위로 색칠해 렌더한다 (문자열 조작 없이 줄별 노드). */
function renderDiff(doc: Document, diff: string): HTMLElement {
  const pre = el(doc, "pre", "review-diff");
  for (const line of diff.split("\n")) {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@") ? "hunk" : "ctx";
    const span = el(doc, "span", `diff-${cls}`, line);
    pre.append(span, doc.createTextNode("\n"));
  }
  return pre;
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
  head.append(
    el(
      doc,
      "p",
      "review-facets",
      `facet — 스키마 ${schema.length} · 데이터 ${data.length} · UI ${ui.length}`,
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
