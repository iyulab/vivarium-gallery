/**
 * inventory 전시물의 KnowledgeSource — capability SHAPE + 하우스 규칙.
 *
 * 논리 스키마와 데이터는 여기 없다. 예전에는 에이전트 입력에 스키마/데이터를 위한
 * 1급 통로가 없어서 이 파일이 둘을 산문으로 눌러 담아 날랐다(마찰의 전시물이었다).
 * 이제 호스트가 라이브 facet 을 지문과 함께 `SchemaInput`/`DataInput` 으로 공급하고
 * (host/server.ts), 연산 어휘는 에이전트의 system 프롬프트가 싣는다. 지식은
 * 스키마가 말하지 못하는 것 — capability 모양과 이 표의 하우스 규칙 — 만 남는다.
 */

import type { KnowledgeSource } from "@vivariumjs/agent";

const DATA_CATALOG = `DATA CATALOG — capabilities granted to this inventory sandbox.

1. api.invoke("inventory.list", {})
   → Array<{ sku, name, quantity, restockDue? }> — in-memory mock rows.
   Call it once at mount; never fabricate rows or skip the invoke.`;

const DESIGN_SYSTEM = `DESIGN SYSTEM — house rules for this inventory table's generated UI.

Structure
- The artifact owns the column list (which columns, their order, their
  labels). Adding a schema field does NOT put it on screen — a column must be
  added to the artifact's \`columns\` array too. Column keys match field names.
- A missing/null cell renders as "—".

Language
- Column labels are Korean; SKU stays "SKU". Field names/keys stay English.

Style
- Inline styles, system-ui sans. Ink #1d2129, header rule 2px #dde1e8, row
  rule 1px #eef0f4, cells 8px/12px padding, max width 720px.

Safety
- Build DOM nodes and use textContent for any data-derived string.
  No innerHTML with interpolated data.`;

export function createInventoryKnowledge(): KnowledgeSource {
  return {
    name: "inventory-catalog",
    async retrieve() {
      return [DATA_CATALOG, DESIGN_SYSTEM];
    },
  };
}
