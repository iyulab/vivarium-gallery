/**
 * contacts 결정적 scripted provider — **폐기 턴** 하나 (되돌릴 수 있는 파괴).
 *
 * 이 전시물의 파괴적 턴 중 **이것 하나만** 에이전트가 저작한다. 나머지 둘(부재
 * 표적을 지목하는 턴)은 에이전트가 저작할 수 **없다** — 저작 시점 표적 검사가
 * 실재하지 않는 엔티티·필드를 거부하기 때문이다. 그래서 게이트는 그 턴들을 손으로
 * 저작해 첫 번째 문을 지나쳐 **두 번째 문(어댑터)** 에 닿는다. 지름길이 아니라
 * 요점이다: 같은 규칙이 이제 두 층에서 집행되고, 그중 하나만 게시본에 있다.
 * scenario.md §두 개의 문.
 *
 * inventory 의 scripted 와 같은 경계를 지킨다: generator 단계는 스키마도 데이터도
 * 직접 볼 수 없으므로, 그 지식은 **planner 가 plan 산문에 옮겨 적은 것만** 쓴다.
 * 시드를 안다는 이유로 generator 가 스키마를 "그냥 아는" 짓을 하면, GREEN 이 실제
 * 모델이 할 수 없는 일을 통과시킨 결과가 된다.
 */

import type { ModelProvider, ModelRequest } from "@vivariumjs/agent";
import { SEED_DATA } from "./seed.ts";

/** 아티팩트에서 팩스 열의 앞 줄 — uiEdits 의 find 앵커(정확·유일). */
export const COLUMN_ANCHOR = `    { key: "email", label: "이메일" },`;
export const COLUMN_WITH_FAX = `${COLUMN_ANCHOR}
    { key: "faxNumber", label: "팩스" },`;

/** 폐기 대상 — 세 곳(스키마·데이터·UI)에서 함께 사라져야 한다. */
export const RETIRED_FIELD = "faxNumber";

const PLAN = [
  "1. Schema: remove field `faxNumber` from entity `Contact`.",
  "2. Data: for each existing Contact row, clear `faxNumber` (where clause is",
  '   { field: "id", equals: <id> } per spec §5.3, set the field to null) —',
  ...SEED_DATA.Contact.map((row) => `   - id = ${row.id} (currently ${row.faxNumber})`),
  '3. UI: remove the `{ key: "faxNumber", label: "팩스" }` column from the',
  "   artifact's `columns` array.",
  "This turn destroys data. It is reversible by rollback, not by re-running it.",
  "[[3-facet]]",
].join("\n");

function payload(): string {
  return JSON.stringify({
    uiEdits: [
      {
        artifactId: "contacts-main",
        find: COLUMN_WITH_FAX,
        replace: COLUMN_ANCHOR,
        explanation: "표에서 팩스 열을 없앤다.",
      },
    ],
    dataPatches: [
      {
        id: "clear-retired-fax",
        explanation: "폐기되는 필드의 값을 행에서 비운다 — 스키마만 지우면 값은 남는다.",
        operations: SEED_DATA.Contact.map((row) => ({
          op: "update",
          entity: "Contact",
          where: { field: "id", equals: row.id },
          set: { [RETIRED_FIELD]: null },
        })),
      },
    ],
    schemaOps: [
      {
        op: "field.remove",
        entity: "Contact",
        field: RETIRED_FIELD,
        explanation: "더 이상 쓰지 않는 팩스 번호를 연락처 스키마에서 폐기한다.",
      },
    ],
  });
}

export function createContactsScriptProvider(): ModelProvider {
  return {
    name: "contacts-scripted",
    async complete(request: ModelRequest): Promise<string> {
      if (request.system.includes("planner")) return PLAN;
      return payload();
    },
  };
}
