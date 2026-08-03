export default async function mount(root, api) {
  // Column list is OWNED BY THE ARTIFACT — adding a schema field only shows up
  // on screen when a column is added here too. That coupling is the point.
  const columns = [
    { key: "sku", label: "SKU" },
    { key: "name", label: "품목" },
    { key: "quantity", label: "수량" },
    { key: "restockDue", label: "재입고 예정일" },
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
}