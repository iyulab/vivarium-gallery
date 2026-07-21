export default async function mount(root, api) {
  const data = await api.invoke("dashboard.metrics", {});
  const { meta, summary = [], revenueTrend = [], topProducts = [] } = data;
  root.innerHTML = "";

  const container = document.createElement("div");
  container.style.cssText = `background:#f9f9f7;min-height:100vh;padding:24px;font-family:system-ui,sans-serif;color:#0b0b0b;display:flex;flex-direction:column;gap:24px;`;

  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
  const biz = document.createElement("h1");
  biz.textContent = meta?.business ?? "Dashboard";
  biz.style.fontSize = "22px";
  const per = document.createElement("span");
  per.textContent = meta?.period?.label ?? "";
  per.style.cssText = "color:#52514e;font-size:14px;";
  header.append(biz, per);
  container.append(header);

  const kpiGrid = document.createElement("div");
  kpiGrid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;";
  const cardBase = "background:#fcfcfb;border:1px solid rgba(11,11,11,0.10);border-radius:12px;padding:16px;overflow:hidden;display:flex;flex-direction:column;gap:8px;";
  for (const s of summary) {
    const card = document.createElement("div");
    card.style.cssText = cardBase;
    const lbl = document.createElement("div");
    lbl.textContent = s.label;
    lbl.style.color = "#52514e";
    const val = document.createElement("div");
    val.style.cssText = "font-size:28px;font-weight:bold;";
    val.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(s.value);
    const dlt = document.createElement("div");
    if (s.deltaPct !== undefined) {
      const p = parseFloat(s.deltaPct);
      const sign = p >= 0 ? "+" : "-";
      const txt = `${sign}${Math.abs(p).toFixed(1)}%`;
      let pos = p >= 0;
      if (s.goodWhenDown) pos = !pos;
      const arrow = pos ? "▲" : "▼";
      dlt.textContent = `${arrow} ${txt}`;
      dlt.style.color = pos ? "#006300" : "#d03b3b";
    }
    card.append(lbl, val, dlt);
    kpiGrid.append(card);
  }
  container.append(kpiGrid);

  const chartWrap = document.createElement("div");
  chartWrap.style.cssText = cardBase + "height:300px;margin-bottom:16px;";
  const chartTitle = document.createElement("div");
  chartTitle.textContent = "Revenue Trend";
  chartTitle.style.cssText = "font-weight:600;margin-bottom:8px;";
  chartWrap.appendChild(chartTitle);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1000 300");
  svg.style.cssText = "width:100%;height:100%;";
  chartWrap.appendChild(svg);

  const chartData = revenueTrend.map(d => ({ x: d.x || 0, y: d.revenue || 0 }));
  if (chartData.length > 0) {
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const W = 1000, H = 300;
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;
    const maxVal = Math.max(...chartData.map(d => d.y));
    const minVal = 0;
    const yScale = (val) => margin.top + h - ((val - minVal) / (maxVal - minVal || 1)) * h;
    const xScale = (i) => margin.left + (i / (chartData.length - 1 || 1)) * w;

    for (let i = 0; i <= 4; i++) {
      const val = minVal + (i / 4) * (maxVal - minVal);
      const y = yScale(val);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", margin.left);
      line.setAttribute("y1", y);
      line.setAttribute("x2", W - margin.right);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", "#e1e0d9");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tick.setAttribute("x", margin.left - 10);
      tick.setAttribute("y", y + 4);
      tick.setAttribute("text-anchor", "end");
      tick.setAttribute("fill", "#898781");
      tick.setAttribute("font-size", "12");
      tick.textContent = val >= 1000 ? `${(val/1000).toFixed(1)}k` : val.toFixed(1);
      svg.appendChild(tick);
    }
    const base = document.createElementNS("http://www.w3.org/2000/svg", "line");
    base.setAttribute("x1", margin.left);
    base.setAttribute("y1", yScale(minVal));
    base.setAttribute("x2", W - margin.right);
    base.setAttribute("y2", yScale(minVal));
    base.setAttribute("stroke", "#c3c2b7");
    base.setAttribute("stroke-width", "2");
    svg.appendChild(base);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    let dStr = "";
    chartData.forEach((pt, i) => {
      const cx = xScale(i);
      const cy = yScale(pt.y);
      dStr += (i === 0 ? "M" : "L") + `${cx},${cy}`;
    });
    path.setAttribute("d", dStr);
    path.setAttribute("stroke", "#2a78d6");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("fill", "none");
    svg.appendChild(path);

    const indices = [0, chartData.length - 1, chartData.findIndex(p => p.y === maxVal)];
    const uniqueIndices = [...new Set(indices)];
    uniqueIndices.forEach(i => {
      const cx = xScale(i);
      const cy = yScale(chartData[i].y);
      const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
      txt.setAttribute("x", cx);
      txt.setAttribute("y", cy - 10);
      txt.setAttribute("text-anchor", "middle");
      txt.setAttribute("fill", "#0b0b0b");
      txt.setAttribute("font-size", "12");
      txt.setAttribute("font-weight", "600");
      const val = chartData[i].y;
      let formatted = val >= 1000 ? `$${(val/1000).toFixed(1)}K` : `$${val.toFixed(2)}`;
      txt.textContent = formatted;
      svg.appendChild(txt);
    });
  }
  container.append(chartWrap);

  const tableWrap = document.createElement("div");
  tableWrap.style.cssText = cardBase;
  const tTitle = document.createElement("div");
  tTitle.textContent = "상위 제품";
  tTitle.style.cssText = "font-weight:600;margin-bottom:12px;";
  tableWrap.appendChild(tTitle);

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;text-align:left;font-size:14px;";
  const thead = document.createElement("thead");
  const hRow = document.createElement("tr");
  const headers = ["Rank", "Product", "Category", "Units", "Revenue", "MoM Growth"];
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    th.style.cssText = "padding:8px 4px;border-bottom:2px solid #e1e0d9;color:#0b0b0b;font-weight:600;";
    if (["MoM Growth", "Units", "Revenue", "Rank"].includes(h)) th.style.textAlign = "right";
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (let i = 0; i < Math.min(5, topProducts.length); i++) {
    const p = topProducts[i];
    const tr = document.createElement("tr");
    const cols = [
      { val: i + 1, align: "right", tabular: true },
      { val: p.product, align: "left", tabular: false },
      { val: p.category, align: "left", tabular: false },
      { val: p.units, align: "right", tabular: true },
      { val: p.revenue, align: "right", tabular: true, format: "currency" },
      { val: p.momGrowthPct, align: "right", tabular: true, format: "percent" }
    ];
    cols.forEach(c => {
      const td = document.createElement("td");
      td.style.cssText = `padding:8px 4px;border-bottom:1px solid #f0f0ed;color:#0b0b0b;${c.align === "right" ? "text-align:right;" : ""}`;
      if (c.tabular) td.style.fontVariantNumeric = "tabular-nums";
      let txt = String(c.val);
      if (c.format === "currency") txt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(c.val);
      else if (c.format === "percent") txt = `${c.val >= 0 ? "+" : "-"}${Math.abs(c.val).toFixed(1)}%`;
      td.textContent = txt;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  container.append(tableWrap);
  root.append(container);
}