/**
 * storefront 전시물 — **구성 축**.
 *
 * 앞선 여섯과 다른 점은 도메인도 크기도 아니라 **아티팩트가 둘**이라는 것이다.
 *
 * 실측이 밝혀 둔 것: **라이브러리 층은 이미 아티팩트 N개를 끝까지 다룬다** — 한
 * 문서의 UI 패치 둘이 preview 에 둘 다 오르고, apply 가 둘을 함께 뒤집고, rollback 이
 * 둘 다 바이트 복귀한다. 못 하는 것은 이 **샘플 호스트**이고, 그것도 실패가 아니라
 * **침묵**으로 못 한다. `smoke-compose` 가 그 침묵을 판정으로 바꾼다.
 */

import type { ExhibitDefinition } from "../../host/exhibit-schema.ts";
import { createStorefrontKnowledge } from "./knowledge.ts";
import { createStorefrontScriptProvider } from "./scripted.ts";
import { MOCK_CART, MOCK_PRODUCTS, SEED_ARTIFACTS, SEED_DATA, SEED_SCHEMA } from "./seed.ts";

const exhibit: ExhibitDefinition = {
  meta: {
    name: "storefront",
    title: "상점",
    description: "화면이 둘인 전시물 — 목록과 장바구니. 한 문서가 두 화면을 함께 바꾸고, 호스트는 하나만 본다",
    domain: "storefront",
  },
  target: "storefront",
  artifacts: SEED_ARTIFACTS,
  // 계약이 아티팩트 **하나**를 지목하게 돼 있다. 둘째는 시드되고 바뀌고 되돌아오지만
  // 이 필드가 가리키지 않으므로 화면·아카이브·드라이버 어디에도 나타나지 않는다.
  primaryArtifactId: "storefront-catalog",
  schema: SEED_SCHEMA,
  data: SEED_DATA,
  capabilities: [
    {
      descriptor: { name: "storefront.products", description: "in-memory mock rows — the product list" },
      handler: async () => MOCK_PRODUCTS,
    },
    {
      descriptor: { name: "storefront.cart", description: "in-memory mock rows — the cart lines" },
      handler: async () => MOCK_CART,
    },
  ],
  // **선언이 아티팩트 축을 갖지 않는다.** 이 블록은 화면 하나를 가정하고 쓰였고,
  // 그래서 여기 적힌 것은 전부 `primaryArtifactId` 의 화면에 대한 것이다. 둘째
  // 화면의 자리·상호작용은 **선언할 자리가 없다** — 그것이 구성 축이 드러내는
  // 계약 공백이고, `smoke-compose` 단언 5 가 그것을 고정한다.
  render: {
    expectInvokes: ["storefront.products"],
    expectFilled: [{ selector: ".sf-product", placeholder: "—" }],
  },
  createKnowledge: () => [createStorefrontKnowledge()],
  createScriptedProvider: () => createStorefrontScriptProvider(),
};

export default exhibit;
