/**
 * storefront 시드 — 이 전시물의 단일 출처 (exhibit.ts · scripted.ts · knowledge.ts 공유).
 *
 * 이 전시물이 세워진 이유는 도메인도 크기도 아니라 **구성**이다. 앞선 여섯은 전부
 * 아티팩트가 **하나**였고, 그래서 *"변경은 검토 가능하고 되돌릴 수 있다"* 가 **화면
 * 하나짜리 앱에서만** 증명돼 있었다.
 *
 * 실측이 그 앞에 한 가지를 밝혀 뒀다: **라이브러리 층은 이미 아티팩트 N개를 끝까지
 * 다룬다.** 한 문서의 UI 패치 둘이 preview 에 둘 다 오르고, apply 가 둘을 함께
 * 뒤집고, rollback 이 둘 다 바이트 복귀한다. 못 하는 것은 **이 샘플 호스트**이며,
 * 그것도 실패가 아니라 **침묵**으로 못 한다 — 둘째 화면은 서고 바뀌고 되돌아오는데
 * 아무도 그리지 않고 아무도 판정하지 않는다.
 *
 * 그래서 이 시드는 **작다.** 잃히기 위해 존재하지 예쁘기 위해 존재하지 않는다.
 * 두 화면이 같은 데이터를 다른 각도로 본다는 것만 갖추면 된다 — 목록과 장바구니.
 */

export interface ProductRow {
  id: string;
  name: string;
  price: number;
}

export interface CartLineRow {
  id: string;
  productId: string;
  qty: number;
}

export const MOCK_PRODUCTS: ProductRow[] = [
  { id: "P-1", name: "노트", price: 3200 },
  { id: "P-2", name: "만년필", price: 18500 },
  { id: "P-3", name: "잉크", price: 7400 },
];

/**
 * 세 줄인 이유: 둘이면 이 화면의 렌더 텍스트가 17자로 **기본 하한(20) 아래**가 되고,
 * 그러면 *"둘째 화면이 판정되지 않는다"* 는 이 전시물의 요점에 *"총량이 잡았을 텐데"*
 * 라는 반론이 섞인다. 잡을 수 있었는데 안 잡은 것과 아예 안 본 것은 다르므로, 혼동
 * 없이 **아무도 안 본다**만 남게 크기를 올린다.
 */
export const MOCK_CART: CartLineRow[] = [
  { id: "L-1", productId: "P-2", qty: 1 },
  { id: "L-2", productId: "P-3", qty: 2 },
  { id: "L-3", productId: "P-1", qty: 3 },
];

export const SEED_SCHEMA = {
  entities: {
    Product: {
      fields: {
        id: { name: "id", type: "string" },
        name: { name: "name", type: "string" },
        price: { name: "price", type: "number" },
      },
      constraints: [],
    },
    CartLine: {
      fields: {
        id: { name: "id", type: "string" },
        productId: { name: "productId", type: "string" },
        qty: { name: "qty", type: "number" },
      },
      constraints: [],
    },
  },
};

export const SEED_DATA = {
  Product: MOCK_PRODUCTS,
  CartLine: MOCK_CART,
};

/** 화면 ① — 상품 목록. `primaryArtifactId` 가 가리키는 쪽이다. */
export const CATALOG_CONTENT = `export default async function mount(root, api) {
  const products = await api.invoke("storefront.products", {});
  root.innerHTML = "";
  const page = document.createElement("main");
  page.className = "sf-catalog";
  page.style.cssText = "font:14px/1.5 system-ui,sans-serif;padding:12px";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:16px;margin:0 0 8px";
  title.textContent = "상품";
  page.append(title);
  const list = document.createElement("ul");
  list.style.cssText = "margin:0;padding-left:18px";
  for (const p of products) {
    const li = document.createElement("li");
    li.className = "sf-product";
    li.textContent = (p.name === undefined || p.name === null ? "—" : String(p.name)) +
      " · " + (p.price === undefined || p.price === null ? "—" : String(p.price));
    list.append(li);
  }
  page.append(list);
  root.append(page);
}
`;

/**
 * 화면 ② — 장바구니. **이 화면이 이 전시물의 요점이다.**
 *
 * 시드되고, 변경되고, 롤백된다. 그리고 호스트는 이것을 **한 번도 그리지 않는다**.
 */
export const CART_CONTENT = `export default async function mount(root, api) {
  const [products, lines] = await Promise.all([
    api.invoke("storefront.products", {}),
    api.invoke("storefront.cart", {}),
  ]);
  const nameById = {};
  for (const p of products) nameById[p.id] = p.name;
  root.innerHTML = "";
  const page = document.createElement("main");
  page.className = "sf-cart";
  page.style.cssText = "font:14px/1.5 system-ui,sans-serif;padding:12px";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:16px;margin:0 0 8px";
  title.textContent = "장바구니";
  page.append(title);
  const list = document.createElement("ul");
  list.style.cssText = "margin:0;padding-left:18px";
  for (const line of lines) {
    const li = document.createElement("li");
    li.className = "sf-line";
    const label = nameById[line.productId];
    li.textContent = (label === undefined || label === null ? "—" : String(label)) +
      " × " + (line.qty === undefined || line.qty === null ? "—" : String(line.qty));
    list.append(li);
  }
  page.append(list);
  root.append(page);
}
`;

/** 두 화면이 한 전시물이다 — 계약은 이미 `Record<artifactId, source>` 다. */
export const SEED_ARTIFACTS = {
  "storefront-catalog": CATALOG_CONTENT,
  "storefront-cart": CART_CONTENT,
};
