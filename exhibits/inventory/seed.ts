/**
 * inventory 시드 — 이 전시물의 단일 출처 (exhibit.ts · scripted.ts · knowledge.ts 공유).
 *
 * 이 전시물이 다른 셋과 다른 점: **세 facet 을 전부 시드한다.**
 *   - SEED_SCHEMA — 논리 스키마 (엔티티 `Item` 의 필드)
 *   - SEED_DATA   — 그 스키마를 따르는 행
 *   - SEED_CONTENT — 표를 그리는 UI 아티팩트 (열 목록은 **아티팩트 소유**)
 *
 * 필드 하나를 추가하는 변경은 이 셋이 **함께** 움직여야 올바르다: 스키마가
 * 필드를 선언하고, 데이터가 값을 담고, 아티팩트가 열을 보여준다. 하나라도
 * 빠지면 화면·스키마·데이터가 서로 거짓말을 한다.
 *
 * `inventory.list` capability 는 **정적 mock** 이다 (규율 2 — 전시물은 실백엔드를
 * 알지 못한다). 따라서 데이터 facet 이 실제로 움직였다는 증거는 화면 픽셀이
 * 아니라 **월드 상태와 원장**이다 — scenario.md §증거 참조.
 */

/** 논리 스키마 시드 — stage-host 의 월드 `schema` facet 으로 들어간다. */
export const SEED_SCHEMA = {
  entities: {
    Item: {
      fields: {
        sku: { name: "sku", type: "string" },
        name: { name: "name", type: "string" },
        quantity: { name: "quantity", type: "number" },
      },
      constraints: [],
    },
  },
};

/** 데이터 시드 — 월드 `data` facet. 아직 재입고 예정일 필드는 없다. */
export const SEED_DATA = {
  Item: [
    { sku: "SKU-1001", name: "무선 마우스", quantity: 42 },
    { sku: "SKU-1002", name: "기계식 키보드", quantity: 7 },
    { sku: "SKU-1003", name: "USB-C 허브", quantity: 0 },
  ],
};

/**
 * capability mock 이 돌려주는 행. 정적이므로 데이터 facet 의 변화를 반영하지
 * 않는다 — 새 열이 화면에서 비어 보이지 않도록 값을 미리 담아 둔다. 이 값이
 * "데이터가 바뀌었다"의 증거가 **아니라는 것**이 중요하다(위 §mock 주석).
 */
export const MOCK_ROWS = [
  { sku: "SKU-1001", name: "무선 마우스", quantity: 42, restockDue: "2026-08-20" },
  { sku: "SKU-1002", name: "기계식 키보드", quantity: 7, restockDue: "2026-08-12" },
  { sku: "SKU-1003", name: "USB-C 허브", quantity: 0, restockDue: "2026-08-07" },
];

/** UI 아티팩트 시드. Plain-JS contract: default-export `mount(root, api)`. */
export const SEED_CONTENT = `export default async function mount(root, api) {
  // Column list is OWNED BY THE ARTIFACT — adding a schema field only shows up
  // on screen when a column is added here too. That coupling is the point.
  const columns = [
    { key: "sku", label: "SKU" },
    { key: "name", label: "품목" },
    { key: "quantity", label: "수량" },
  ];
  const rows = await api.invoke("inventory.list", {});
  root.innerHTML = "";
  const page = document.createElement("main");
  page.style.cssText = "font-family:system-ui,sans-serif;color:#1d2129;max-width:720px;margin:0 auto;padding:24px";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:22px;margin:0 0 16px";
  title.textContent = "재고 품목";
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:14px";
  const head = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.style.cssText = "text-align:left;border-bottom:2px solid #dde1e8;padding:8px 12px;font-weight:600";
    th.textContent = col.label;
    head.append(th);
  }
  table.append(head);
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const col of columns) {
      const td = document.createElement("td");
      td.style.cssText = "border-bottom:1px solid #eef0f4;padding:8px 12px";
      td.textContent = row[col.key] === undefined || row[col.key] === null ? "—" : String(row[col.key]);
      tr.append(td);
    }
    table.append(tr);
  }
  page.append(title, table);
  root.append(page);
}`;
