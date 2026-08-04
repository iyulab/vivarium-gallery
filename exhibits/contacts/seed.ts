/**
 * contacts 시드 — 이 전시물의 단일 출처 (exhibit.ts · scripted.ts · knowledge.ts 공유).
 *
 * 이 전시물이 세워진 이유는 도메인이 아니라 **축**이다: 지금까지 갤러리가 시험한
 * 스키마 연산은 `field.add` 하나, 데이터 연산은 `update` 하나였다. 즉 *"변경은
 * 검토 가능하고 되돌릴 수 있다"* 가 **가장 안전한 연산에서만** 증명돼 있었다.
 * 여기서는 **지우는 변경**이 무대에 선다 — scenario.md 참조.
 *
 * 그래서 시드는 **잃을 것이 있게** 만들어져 있다:
 *   - `faxNumber` 는 세 행 전부에 값이 있다 → 필드를 지우면 **실제로 데이터가 사라진다**.
 *   - 그중 둘은 **같은 번호**를 공유한다(한 사무실의 공용 팩스) → 그 필드에 unique
 *     제약을 거는 변경은 **기존 데이터를 위반한다**.
 * 이 두 성질이 없으면 파괴적 턴은 파괴할 것이 없어 아무것도 시험하지 못한다.
 */

/** 논리 스키마 시드 — stage-host 의 월드 `schema` facet. */
export const SEED_SCHEMA = {
  entities: {
    Contact: {
      fields: {
        id: { name: "id", type: "string" },
        name: { name: "name", type: "string" },
        email: { name: "email", type: "string" },
        faxNumber: { name: "faxNumber", type: "string" },
      },
      constraints: [],
    },
  },
};

/** 데이터 시드 — 월드 `data` facet. 팩스 번호는 **세 행 전부에 값이 있다**. */
export const SEED_DATA = {
  Contact: [
    { id: "C-001", name: "가온", email: "gaon@example.com", faxNumber: "02-555-0100" },
    // 같은 사무실이라 팩스를 공유한다 — unique 제약이 기존 데이터를 위반하게 만드는 행.
    { id: "C-002", name: "나린", email: "narin@example.com", faxNumber: "02-555-0100" },
    { id: "C-003", name: "다솜", email: "dasom@example.com", faxNumber: "02-555-0177" },
  ],
};

/**
 * capability mock 이 돌려주는 행. 정적이므로 데이터 facet 의 변화를 반영하지
 * 않는다(inventory 와 같은 규율 2 제약) — **데이터가 사라졌다/돌아왔다의 증거는
 * 화면 픽셀이 아니라 월드 상태와 원장**이다. scenario.md §증거.
 */
export const MOCK_ROWS = SEED_DATA.Contact;

/** UI 아티팩트 시드. Plain-JS contract: default-export `mount(root, api)`. */
export const SEED_CONTENT = `export default async function mount(root, api) {
  // Column list is OWNED BY THE ARTIFACT — retiring a schema field only leaves
  // the screen when the column is removed here too. That coupling is the point,
  // and it cuts both ways: adding and removing.
  const columns = [
    { key: "name", label: "이름" },
    { key: "email", label: "이메일" },
    { key: "faxNumber", label: "팩스" },
  ];
  const rows = await api.invoke("contacts.list", {});
  root.innerHTML = "";
  const page = document.createElement("main");
  page.style.cssText = "font-family:system-ui,sans-serif;color:#1d2129;max-width:720px;margin:0 auto;padding:24px";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:22px;margin:0 0 16px";
  title.textContent = "연락처";
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
