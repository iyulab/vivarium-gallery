export default async function mount(root, api) {
  // Column list is OWNED BY THE ARTIFACT — retiring a schema field only leaves
  // the screen when the column is removed here too. That coupling is the point,
  // and it cuts both ways: adding and removing.
  const columns = [
    { key: "fullName", label: "이름" },
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
}