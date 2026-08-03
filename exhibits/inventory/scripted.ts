/**
 * inventory 결정적 scripted provider — 3-facet 턴 하나.
 *
 * **이 스크립트가 알아도 되는 것의 경계 (읽는 사람이 GREEN 을 오해하지 않도록)**
 *
 * 에이전트 파이프라인은 2단계다: planner 프롬프트는 intent + editContext +
 * **knowledge** 를 받고, generator 프롬프트는 intent + **planner 가 쓴 plan** +
 * **UI 아티팩트만** 받는다. 즉 schema/data 연산을 실제로 뱉는 단계는 스키마도
 * 데이터도 **직접 볼 수 없다** — 그 지식이 도달할 수 있는 유일한 경로는
 * "planner 가 knowledge 에서 읽어 plan 산문에 옮겨 적는 것"이다.
 *
 * 그래서 이 스크립트는 그 경로를 **그대로 흉내낸다**: planner 응답이 엔티티·
 * 필드·행 키를 plan 안에 명시하고, generator 응답은 그 plan 에 적힌 것만 쓴다.
 * 시드를 알고 있다는 이유로 generator 단계에서 스키마를 "그냥 아는" 짓을 하지
 * 않는다 — 그렇게 하면 실제 모델이 할 수 없는 일을 스모크가 통과시켜, GREEN 이
 * 3-facet 저작 가능성의 증거가 아니게 된다.
 *
 * 이 경로가 실모델에서도 성립하는지는 scripted 로는 알 수 없다 — 그 판정은
 * 실모델 run 의 몫이다(scenario.md §완주 기준).
 */

import type { ModelProvider, ModelRequest } from "@vivariumjs/agent";
import { SEED_DATA } from "./seed.ts";

/** 아티팩트에서 열 목록의 마지막 줄 — uiEdits 의 find 앵커(정확·유일). */
export const COLUMN_ANCHOR = `    { key: "quantity", label: "수량" },`;
export const COLUMN_ADDED = `${COLUMN_ANCHOR}
    { key: "restockDue", label: "재입고 예정" },`;

/** 데이터 패치가 채울 값 — 행 하나당 하나. */
export const RESTOCK_DUE: Record<string, string> = {
  "SKU-1001": "2026-08-20",
  "SKU-1002": "2026-08-12",
  "SKU-1003": "2026-08-07",
};

/**
 * planner 가 knowledge(LOGICAL SCHEMA · DATA SHAPE)를 읽고 쓴 plan.
 * generator 가 볼 수 있는 유일한 스키마/데이터 지식이 여기 실려 있다.
 */
const PLAN = [
  "1. Schema: add field `restockDue` of logical type `date` to entity `Item`.",
  "2. Data: for each existing Item row, set `restockDue` (where clause is",
  "   { field: \"sku\", equals: <sku> } per spec §5.3) —",
  ...Object.entries(RESTOCK_DUE).map(([sku, due]) => `   - sku = ${sku} → set restockDue = ${due}`),
  '3. UI: add a `{ key: "restockDue", label: "재입고 예정" }` column to the',
  "   artifact's `columns` array, right after the `quantity` column.",
  "[[3-facet]]",
].join("\n");

function payload(): string {
  return JSON.stringify({
    uiEdits: [
      {
        artifactId: "inventory-main",
        find: COLUMN_ANCHOR,
        replace: COLUMN_ADDED,
        explanation: "표에 재입고 예정 열을 추가한다.",
      },
    ],
    dataPatches: [
      {
        id: "backfill-restock-due",
        explanation: "기존 품목 행에 재입고 예정일을 채운다.",
        // spec §5.3: where 는 { field, equals } 다 — 키/값 맵이 아니다.
        // (첫 실행에서 이 형태를 틀리게 썼고, 검증기는 통과시켰으며, 어댑터가
        //  NullReferenceException 으로 터졌다 — cycle-117 이 남긴 이슈 2건.)
        operations: SEED_DATA.Item.map((row) => ({
          op: "update",
          entity: "Item",
          where: { field: "sku", equals: row.sku },
          set: { restockDue: RESTOCK_DUE[row.sku] },
        })),
      },
    ],
    schemaOps: [
      {
        op: "field.add",
        entity: "Item",
        field: { name: "restockDue", type: "date" },
        explanation: "재입고 예정일을 품목 스키마에 선언한다.",
      },
    ],
  });
}

export function createInventoryScriptProvider(): ModelProvider {
  return {
    name: "inventory-scripted",
    async complete(request: ModelRequest): Promise<string> {
      if (request.system.includes("planner")) return PLAN;
      return payload();
    },
  };
}
