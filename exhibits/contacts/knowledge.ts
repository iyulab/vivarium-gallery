/**
 * contacts 전시물의 KnowledgeSource — capability SHAPE + 백엔드의 facet 규칙 + 하우스 규칙.
 *
 * 라이브 스키마·데이터는 호스트가 지문과 함께 `SchemaInput`/`DataInput` 으로 공급하고
 * (host/server.ts), 연산 어휘는 에이전트의 system 프롬프트가 싣는다. 여기 남은 것은
 * 스키마가 말하지 못하는 것 — 이 백엔드에서 필드를 지워도 행 값은 남는다는 규칙이다.
 * 이 전시물은 **지우고 바꾸는 연산**의 무대라 그 규칙이 곧 요점이다.
 */

import type { KnowledgeSource } from "@vivariumjs/agent";

const DATA_CATALOG = `DATA CATALOG — capabilities granted to this contacts sandbox.

1. api.invoke("contacts.list", {})
   → Array<{ id, name, email, faxNumber? }> — in-memory mock rows.
   Call it once at mount; never fabricate rows or skip the invoke.`;

const FACET_RULES = `FACET RULES — how this backend moves the facets.

A schema operation moves the schema facet only. Removing a field does NOT
remove the values the rows already hold — if the change means the values go
too, the document must say so in its data patch.`;

const DESIGN_SYSTEM = `DESIGN SYSTEM — house rules for this contact table's generated UI.

Structure
- The artifact owns the column list (which columns, their order, their
  labels). Retiring a schema field does NOT take it off screen — the column
  must be removed from the artifact's \`columns\` array too. Column keys match
  field names.
- A missing/null cell renders as "—".

Language
- Column labels are Korean. Field names/keys stay English.

Style
- Inline styles, system-ui sans. Ink #1d2129, header rule 2px #dde1e8, row
  rule 1px #eef0f4, cells 8px/12px padding, max width 720px.

Safety
- Build DOM nodes and use textContent for any data-derived string.
  No innerHTML with interpolated data.`;

export function createContactsKnowledge(): KnowledgeSource {
  return {
    name: "contacts-catalog",
    async retrieve() {
      return [DATA_CATALOG, FACET_RULES, DESIGN_SYSTEM];
    },
  };
}
