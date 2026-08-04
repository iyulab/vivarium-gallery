/**
 * contacts 전시물의 KnowledgeSource — capability SHAPE + 하우스 규칙 +
 * **논리 스키마와 데이터 형태**.
 *
 * inventory 와 같은 이유로 스키마·데이터가 산문으로 실려 있다: 에이전트의 propose
 * 입력에는 UI 아티팩트 말고 스키마/데이터를 위한 1급 통로가 게시본에 아직 없고,
 * knowledge 포트(자유 산문)가 유일한 경로다. 이 우회는 의존이 3-facet 입력 계약을
 * 나르기 시작하면 불필요해진다.
 *
 * 여기 실린 연산 어휘가 inventory 와 다른 것이 이 전시물의 존재 이유다 — 저 쪽은
 * 더하는 연산을, 이 쪽은 **지우고 바꾸는 연산**을 모델 앞에 놓는다.
 */

import type { KnowledgeSource } from "@vivariumjs/agent";
import { SEED_DATA, SEED_SCHEMA } from "./seed.ts";

const DATA_CATALOG = `DATA CATALOG — capabilities granted to this contacts sandbox.

1. api.invoke("contacts.list", {})
   → Array<{ id, name, email, faxNumber? }> — in-memory mock rows.
   Call it once at mount; never fabricate rows or skip the invoke.`;

const LOGICAL_SCHEMA = `LOGICAL SCHEMA — the target's current schema facet (JSON).

${JSON.stringify(SEED_SCHEMA, null, 2)}

Schema operations use the closed changeset vocabulary. The destructive members
of it are: { "op": "field.remove", "entity": "<Entity>", "field": "<field>",
"explanation": "<why>" }, { "op": "field.rename", …, "newName": "<name>" },
{ "op": "field.retype", …, "newType": "<logical type>" }, { "op":
"entity.remove", … }, { "op": "entity.rename", …, "newName": "<name>" },
{ "op": "constraint.add" / "constraint.remove", …, "constraint": { … } }.
Logical types: string, number, boolean, date, datetime, reference, json.

A schema operation moves the schema facet only. Removing a field does NOT
remove the values the rows already hold — if the change means the values go
too, the document must say so in its data patch.`;

const DATA_SHAPE = `DATA SHAPE — the target's current data facet (JSON, seed rows).

${JSON.stringify(SEED_DATA, null, 2)}

Data operations (spec §5.3 — the "where" clause is { field, equals }, NOT a
key/value map): { "op": "update", "entity": "<Entity>", "where": { "field":
"<field>", "equals": <literal> }, "set": { "<field>": <value> } } (also
"insert" with "values", "delete" with "where"). A data patch wraps them:
{ "id": "<patch-id>", "explanation": "<why>", "operations": [ … ] }.`;

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
      return [DATA_CATALOG, LOGICAL_SCHEMA, DATA_SHAPE, DESIGN_SYSTEM];
    },
  };
}
