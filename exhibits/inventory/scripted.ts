/**
 * inventory 결정적 scripted provider — 3-facet 턴 하나.
 *
 * **이 스크립트가 알아도 되는 것의 경계 (읽는 사람이 GREEN 을 오해하지 않도록)**
 *
 * 에이전트 파이프라인은 2단계다: planner 가 intent · editContext · knowledge 와
 * **라이브 스키마·데이터**(호스트 공급, host/server.ts)를 읽고 plan 을 쓰며, generator 는
 * plan 과 UI 아티팩트, **같은 스키마·데이터 뷰**를 받아 연산을 낸다. 예전에는 generator 가
 * 스키마도 데이터도 볼 수 없어서 그 지식이 plan 산문을 거쳐서만 도달했다 — 이
 * 스크립트의 plan 이 엔티티·필드·행 키를 전부 적어 두는 것은 그 시절의 형태다.
 *
 * 스크립트는 여전히 plan 에 적힌 것만 쓴다. 시드를 안다는 이유로 모델이 볼 수 없는
 * 것을 "그냥 아는" 짓은 하지 않는다 — 그렇게 하면 GREEN 이 저작 가능성의 증거가 아니게 된다.
 *
 * 실모델에서 3-facet 저작이 성립하는지는 scripted 로는 알 수 없다 — 그 판정은
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
 * planner 가 라이브 스키마·데이터(호스트 공급)를 읽고 쓴 plan.
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
        //  NullReferenceException 으로 터졌다 — 검증기와 어댑터 양쪽의 결함이다.)
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
