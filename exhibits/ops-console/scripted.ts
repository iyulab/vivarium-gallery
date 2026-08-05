/**
 * ops-console 결정적 scripted provider — **국소 변경 하나**.
 *
 * 이 전시물의 축은 파괴성도 도메인도 아니라 크기다. 그래서 턴은 일부러 작다:
 * 요약 카드 한 장을 더한다. 물음은 *"모델이 이 변경을 해낼 수 있는가"* 가 아니라
 * **"300줄짜리 아티팩트에서 국소 변경이 국소 diff 로 나오는가"** 다. 작은
 * 전시물에서는 전체 재작성과 국소 변경의 줄 수가 비슷해 그 둘이 구별되지 않았다.
 *
 * capability 는 이미 그 값을 돌려주고 있고 화면만 쓰지 않는다 — 카드 목록이
 * 아티팩트 소유이기 때문이다. 그래서 이 턴은 UI facet 하나만 움직인다.
 *
 * 다른 전시물과 같은 경계를 지킨다: generator 단계는 스키마도 데이터도 직접 볼 수
 * 없으므로, 그 지식은 **planner 가 plan 산문에 옮겨 적은 것만** 쓴다.
 */

import type { ModelProvider, ModelRequest } from "@vivariumjs/agent";

/** 아티팩트에서 마지막 카드 spec — uiEdits 의 find 앵커(정확·유일). */
export const CARD_ANCHOR = `    { key: "deploysThisWeek", label: "Deploys this week" },`;

/** 더해질 카드. capability 응답에 이미 있는 키를 읽는다. */
export const CARD_ADDED = `    { key: "rolledBack", label: "Rolled back" },`;

export const CARD_WITH_ADDITION = `${CARD_ANCHOR}
${CARD_ADDED}`;

const PLAN = [
  "1. UI: the artifact owns the summary card list. Add one entry to that",
  '   `cardSpecs` array, right after the "Deploys this week" entry:',
  '   { key: "rolledBack", label: "Rolled back" }.',
  "2. The ops.summary capability already returns a `rolledBack` count, so no",
  "   schema or data change is needed — this turn moves the UI facet only.",
  "3. Change nothing else. The rest of the artifact (three tables, the tier",
  "   filter, the ownership rollup, the badge helper) stays byte-identical.",
].join("\n");

function payload(): string {
  return JSON.stringify({
    uiEdits: [
      {
        artifactId: "ops-console-main",
        find: CARD_ANCHOR,
        replace: CARD_WITH_ADDITION,
        explanation: "이미 집계되고 있는 롤백 배포 수를 요약 카드로 올린다.",
      },
    ],
  });
}

export function createOpsConsoleScriptProvider(): ModelProvider {
  return {
    name: "ops-console-scripted",
    async complete(request: ModelRequest): Promise<string> {
      if (request.system.includes("planner")) return PLAN;
      return payload();
    },
  };
}
