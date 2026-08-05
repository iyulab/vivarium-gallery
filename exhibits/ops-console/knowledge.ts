/**
 * ops-console 전시물의 KnowledgeSource — capability SHAPE + 하우스 규칙 +
 * **논리 스키마와 데이터 형태**.
 *
 * 다른 전시물과 같은 이유로 스키마·데이터가 산문으로 실려 있다: 에이전트의 propose
 * 입력에는 UI 아티팩트 말고 스키마/데이터를 위한 1급 통로가 게시본에 아직 없고,
 * knowledge 포트(자유 산문)가 유일한 경로다. 이 우회는 의존이 3-facet 입력 계약을
 * 나르기 시작하면 불필요해진다.
 *
 * 여기 실린 것이 다른 전시물과 다른 점은 어휘가 아니라 **분량**이다 — 엔티티 셋과
 * 행 39건이 산문으로 실린다. 그 자체가 이 전시물이 재는 축의 일부다: 규모가 커지면
 * 모델이 읽어야 하는 맥락도 함께 커지고, 그 비용은 `/agent/metrics` 가 보고한다.
 */

import type { KnowledgeSource } from "@vivariumjs/agent";
import { SEED_DATA, SEED_SCHEMA } from "./seed.ts";

const DATA_CATALOG = `DATA CATALOG — capabilities granted to this ops-console sandbox.

1. api.invoke("ops.summary", {})
   → { services, degraded, openIncidents, deploysThisWeek, rolledBack } —
     in-memory mock counts. Note it already reports \`rolledBack\`; whether that
     number is on screen is decided by the artifact's card list, not by this
     capability.
2. api.invoke("ops.services", {})
   → Array<{ id, name, tier, owner, status }>
3. api.invoke("ops.incidents", {})
   → Array<{ id, serviceId, severity, openedAt, summary, resolved }>
4. api.invoke("ops.deploys", {})
   → Array<{ id, serviceId, version, at, result }>

Call each once at mount; never fabricate rows or skip an invoke. A screen that
renders without one of these calls is a screen with a region that silently went
empty.`;

const LOGICAL_SCHEMA = `LOGICAL SCHEMA — the target's current schema facet (JSON).

${JSON.stringify(SEED_SCHEMA, null, 2)}

Schema operations use the closed changeset vocabulary:
{ "op": "field.add", "entity": "<Entity>", "field": "<name>", "type":
"<logical type>", "explanation": "<why>" }, plus "field.remove",
"field.rename", "field.retype", "entity.add", "entity.remove",
"entity.rename", "constraint.add", "constraint.remove".
Logical types: string, number, boolean, date, datetime, reference, json.

A schema operation moves the schema facet only. Removing or renaming a field
does NOT move the values the rows already hold — if the change means the data
moves too, the document must say so in its data patch.`;

const DATA_SHAPE = `DATA SHAPE — the target's current data facet (JSON, seed rows).

${JSON.stringify(SEED_DATA, null, 2)}

Data operations (spec §5.3 — the "where" clause is { field, equals }, NOT a
key/value map): { "op": "update", "entity": "<Entity>", "where": { "field":
"<field>", "equals": <literal> }, "set": { "<field>": <value> } } (also
"insert" with "values", "delete" with "where"). A data patch wraps them:
{ "id": "<patch-id>", "explanation": "<why>", "operations": [ … ] }.`;

const DESIGN_SYSTEM = `DESIGN SYSTEM — house rules for this console's generated UI.

Structure
- The artifact owns the summary card list, each table's column list, and the
  ownership rollup. A schema field appearing or disappearing does NOT change
  what is on screen by itself — the corresponding entry has to move too.
- Every table renders through one shared \`renderTable\` helper: columns, rows,
  and an empty-state string. Do not hand-roll a second table.
- State words (status, severity, result) render through \`renderBadge\`. Plain
  values do not.
- A missing/null/empty cell renders as "—".

Edits
- Prefer the smallest edit that does the job. This artifact is several hundred
  lines; rewriting it whole to change one card is not an equivalent answer.

Style
- Inline styles, system-ui sans. Ink #1d2129, muted #5b6472, header rule 2px
  #dde1e8, row rule 1px #eef0f4, cells 6px/8px padding, page max width 1080px.

Safety
- Build DOM nodes and use textContent for any data-derived string.
  No innerHTML with interpolated data.`;

export function createOpsConsoleKnowledge(): KnowledgeSource {
  return {
    name: "ops-console-catalog",
    async retrieve() {
      return [DATA_CATALOG, LOGICAL_SCHEMA, DATA_SHAPE, DESIGN_SYSTEM];
    },
  };
}
