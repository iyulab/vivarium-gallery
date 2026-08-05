/**
 * storefront 결정적 scripted provider — **두 화면에 걸치는 턴 하나**.
 *
 * 구성 축의 턴은 화면 하나로 끝나지 않는다. 그것이 이 전시물이 재는 것이고, 그래서
 * 이 턴은 UI 패치를 **둘** 낸다 — 같은 안내 문구를 두 화면에 함께 넣는다. 화면이
 * 하나뿐이면 저작할 수조차 없는 종류의 변경이다.
 *
 * 다른 전시물과 같은 경계를 지킨다: generator 단계는 스키마도 데이터도 직접 볼 수
 * 없으므로 그 지식은 planner 가 plan 산문에 옮겨 적은 것만 쓴다.
 */

import type { ModelProvider, ModelRequest } from "@vivariumjs/agent";

/** 두 아티팩트에 공통으로 있는 앵커 — 각 편집이 자기 artifactId 안에서만 찾는다. */
export const APPEND_ANCHOR = "  page.append(list);";

/** 더해질 안내 문구. 두 화면에 **같은 문자열**이 들어가는 것이 판정의 대상이다. */
export const NOTE_TEXT = "배송은 영업일 기준 2일 걸립니다.";

export const APPEND_WITH_NOTE = `${APPEND_ANCHOR}
  const note = document.createElement("p");
  note.className = "sf-note";
  note.style.cssText = "margin:10px 0 0;color:#5b6472;font-size:13px";
  note.textContent = "${NOTE_TEXT}";
  page.append(note);`;

const PLAN = [
  "1. UI: both screens end by appending their list to `page`. Insert the same",
  "   notice paragraph after that append, in BOTH artifacts:",
  `   a <p class="sf-note"> whose text is "${NOTE_TEXT}".`,
  "2. This turn spans two artifacts. Emit one uiEdits entry per artifactId —",
  "   `storefront-catalog` and `storefront-cart` — not one entry for both.",
  "3. No schema or data change is needed; the notice is fixed copy.",
].join("\n");

function payload(): string {
  return JSON.stringify({
    uiEdits: [
      {
        artifactId: "storefront-catalog",
        find: APPEND_ANCHOR,
        replace: APPEND_WITH_NOTE,
        explanation: "목록 화면에 배송 안내를 넣는다.",
      },
      {
        artifactId: "storefront-cart",
        find: APPEND_ANCHOR,
        replace: APPEND_WITH_NOTE,
        explanation: "장바구니 화면에도 같은 배송 안내를 넣는다.",
      },
    ],
  });
}

export function createStorefrontScriptProvider(): ModelProvider {
  return {
    name: "storefront-scripted",
    async complete(request: ModelRequest): Promise<string> {
      if (request.system.includes("planner")) return PLAN;
      return payload();
    },
  };
}
