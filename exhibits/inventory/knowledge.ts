/**
 * inventory 전시물의 KnowledgeSource — capability SHAPE + 하우스 규칙 +
 * **논리 스키마와 데이터 형태**.
 *
 * 스키마·데이터가 여기 실려 있는 것은 취향이 아니라 **유일한 경로이기
 * 때문**이다: 에이전트의 propose 입력은 UI 아티팩트만 받고(`artifacts`),
 * 스키마/데이터를 위한 1급 입력이 없다. 소비자가 모델에게 "지금 스키마가
 * 어떻게 생겼는지"를 알릴 수 있는 통로는 knowledge 포트(자유 산문)뿐이다.
 * 그래서 이 파일은 전시물의 지식이면서 동시에 **마찰의 전시물**이다 —
 * scenario.md §마찰 참조.
 */

import type { KnowledgeSource } from "@vivariumjs/agent";
import { SEED_DATA, SEED_SCHEMA } from "./seed.ts";

const DATA_CATALOG = `DATA CATALOG — capabilities granted to this inventory sandbox.

1. api.invoke("inventory.list", {})
   → Array<{ sku, name, quantity, restockDue? }> — in-memory mock rows.
   Call it once at mount; never fabricate rows or skip the invoke.`;

/**
 * 구조화된 스키마를 산문으로 눌러 담은 것. 모델이 schema 연산을 쓰려면
 * 엔티티 이름과 기존 필드를 알아야 하는데, 그 지식이 도달할 수 있는 형태가
 * 이것뿐이다.
 */
const LOGICAL_SCHEMA = `LOGICAL SCHEMA — the target's current schema facet (JSON).

${JSON.stringify(SEED_SCHEMA, null, 2)}

Schema operations use the closed changeset vocabulary; the one that adds a
field is: { "op": "field.add", "entity": "<Entity>", "field": { "name": "<field>",
"type": "<logical type>" }, "explanation": "<why>" }. Logical types: string,
number, boolean, date, datetime, reference, json.`;

const DATA_SHAPE = `DATA SHAPE — the target's current data facet (JSON, seed rows).

${JSON.stringify(SEED_DATA, null, 2)}

Data operations (spec §5.3 — the "where" clause is { field, equals }, NOT a
key/value map): { "op": "update", "entity": "<Entity>", "where": { "field":
"<field>", "equals": <literal> }, "set": { "<field>": <value> } } (also
"insert" with "values", "delete" with "where"). A data patch wraps them:
{ "id": "<patch-id>", "explanation": "<why>", "operations": [ … ] }.`;

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
      return [DATA_CATALOG, LOGICAL_SCHEMA, DATA_SHAPE, DESIGN_SYSTEM];
    },
  };
}
