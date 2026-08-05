/**
 * storefront 전시물의 KnowledgeSource — capability SHAPE + 하우스 규칙 +
 * 논리 스키마와 데이터 형태.
 *
 * 다른 전시물과 다른 항목이 하나 있다: **화면이 둘이라는 사실**과, 두 화면에 걸치는
 * 변경은 **artifactId 마다 편집을 따로 낸다**는 것. 화면이 하나인 전시물에서는 말할
 * 필요가 없던 규칙이다.
 */

import type { KnowledgeSource } from "@vivariumjs/agent";
import { SEED_DATA, SEED_SCHEMA } from "./seed.ts";

const DATA_CATALOG = `DATA CATALOG — capabilities granted to this storefront sandbox.

1. api.invoke("storefront.products", {})
   → Array<{ id, name, price }> — in-memory mock rows.
2. api.invoke("storefront.cart", {})
   → Array<{ id, productId, qty }> — in-memory mock rows.

Call what a screen needs at mount; never fabricate rows or skip the invoke.`;

const COMPOSITION = `COMPOSITION — this target holds TWO artifacts, not one.

- "storefront-catalog" — the product list screen.
- "storefront-cart" — the cart screen. It resolves product names through the
  products capability, so both screens read the same source of truth.

A change that has to appear on both screens is TWO ui edits, one per artifactId.
There is no edit that targets "the artifact" — every edit names which one.`;

const LOGICAL_SCHEMA = `LOGICAL SCHEMA — the target's current schema facet (JSON).

${JSON.stringify(SEED_SCHEMA, null, 2)}

Schema operations use the closed changeset vocabulary: "field.add",
"field.remove", "field.rename", "field.retype", "entity.add", "entity.remove",
"entity.rename", "constraint.add", "constraint.remove".
Logical types: string, number, boolean, date, datetime, reference, json.

A schema operation moves the schema facet only. If the change means the values
move too, the document must say so in its data patch.`;

const DATA_SHAPE = `DATA SHAPE — the target's current data facet (JSON, seed rows).

${JSON.stringify(SEED_DATA, null, 2)}

Data operations (spec §5.3 — the "where" clause is { field, equals }):
{ "op": "update", "entity": "<Entity>", "where": { "field": "<field>",
"equals": <literal> }, "set": { "<field>": <value> } } (also "insert" with
"values", "delete" with "where"). A data patch wraps them:
{ "id": "<patch-id>", "explanation": "<why>", "operations": [ … ] }.`;

const DESIGN_SYSTEM = `DESIGN SYSTEM — house rules for this storefront's generated UI.

Structure
- Each screen owns its own list markup. A row's missing value renders as "—".
- Both screens open with an <h1> naming the screen and end by appending their
  list to the page element.

Language
- Copy is Korean. Field names/keys stay English.

Style
- Inline styles, system-ui sans. Ink #1d2129, muted #5b6472, 12px page padding.

Safety
- Build DOM nodes and use textContent for any data-derived string.
  No innerHTML with interpolated data.`;

export function createStorefrontKnowledge(): KnowledgeSource {
  return {
    name: "storefront-catalog-knowledge",
    async retrieve() {
      return [DATA_CATALOG, COMPOSITION, LOGICAL_SCHEMA, DATA_SHAPE, DESIGN_SYSTEM];
    },
  };
}
