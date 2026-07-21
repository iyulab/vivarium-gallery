export default async function mount(root, api) {
  const data = await api.invoke("dashboard.dataset", {});
  const meta = data?.meta ?? {};
  const summary = Array.isArray(data?.summary) ? data.summary : [];
  const revenueTrend = Array.isArray(data?.revenueTrend) ? data.revenueTrend : [];
  const topProducts = Array.isArray(data?.topProducts) ? data.topProducts : [];

  const INK = "#0b0b0b";
  const INK2 = "#52514e";
  const MUTED = "#898781";
  const CARD_BG = "#fcfcfb";
  const CARD_BORDER = "rgba(11,11,11,0.10)";
  const GRID = "#e1e0d9";
  const AXIS = "#c3c2b7";
  const SERIES1 = "#2a78d6";
  const UP = "#006300";
  const DOWN = "#d03b3b";

  const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  const usdFull = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const countFmt = new Intl.NumberFormat("en-US");

  function fmtValue(value, unit) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "n/a");
    if (unit === "usd") return usdFull.format(n);
    if (unit === "pct") return n.toFixed(1) + "%";
    return countFmt.format(n);
  }

  function fmtSignedPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    return sign + Math.abs(n).toFixed(1) + "%";
  }

  function deltaColor(deltaPct, goodWhenDown) {
    const n = Number(deltaPct);
    if (!Number.isFinite(n) || n === 0) return INK2;
    const isUp = n > 0;
    const good = goodWhenDown === true ? !isUp : isUp;
    return good ? UP : DOWN;
  }

  root.innerHTML = "";

  const page = document.createElement("div");
  page.style.cssText = "background:#f9f9f7;font-family:system-ui,-apple-system,sans-serif;min-height:100%;box-sizing:border-box;";

  const stack = document.createElement("div");
  stack.style.cssText = "display:grid;gap:16px;padding:16px;max-width:1100px;margin:0 auto;";
  page.append(stack);

  function makeCard() {
    const card = document.createElement("section");
    card.style.cssText = "background:" + CARD_BG + ";border:1px solid " + CARD_BORDER + ";border-radius:12px;padding:16px;box-sizing:border-box;";
    return card;
  }

  // 1. Header
  const header = document.createElement("header");
  const bizName = document.createElement("div");
  bizName.style.cssText = "color:" + INK + ";font-size:22px;font-weight:700;";
  bizName.textContent = String(meta.business ?? "");
  const period = document.createElement("div");
  period.style.cssText = "color:" + INK2 + ";font-size:14px;margin-top:2px;";
  period.textContent = String(meta?.period?.label ?? "");
  header.append(bizName, period);
  stack.append(header);

  // 2. KPI stat row
  const kpiRow = document.createElement("div");
  kpiRow.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;";
  for (const entry of summary) {
    const tile = makeCard();
    const label = document.createElement("div");
    label.style.cssText = "color:" + INK2 + ";font-size:13px;";
    label.textContent = String(entry.label ?? "");
    const value = document.createElement("div");
    value.style.cssText = "color:" + INK + ";font-size:30px;font-weight:700;margin:6px 0 4px;font-variant-numeric:tabular-nums;";
    value.textContent = fmtValue(entry.value, entry.unit);
    tile.append(label, value);
    if (entry.deltaPct !== undefined && entry.deltaPct !== null) {
      const delta = document.createElement("div");
      const n = Number(entry.deltaPct);
      const arrow = n > 0 ? "\u25B2" : n < 0 ? "\u25BC" : "";
      delta.style.cssText = "font-size:13px;font-variant-numeric:tabular-nums;color:" + deltaColor(entry.deltaPct, entry.goodWhenDown) + ";";
      delta.textContent = (arrow ? arrow + " " : "") + fmtSignedPct(entry.deltaPct);
      tile.append(delta);
    }
    kpiRow.append(tile);
  }
  stack.append(kpiRow);

  // 3. Revenue Trend line chart
  const chartCard = makeCard();
  const chartTitle = document.createElement("div");
  chartTitle.style.cssText = "color:" + INK + ";font-size:16px;font-weight:600;margin-bottom:12px;";
  chartTitle.textContent = "Revenue Trend";
  chartCard.append(chartTitle);

  const points = revenueTrend
    .map((d) => ({ month: String(d.month ?? ""), revenue: Number(d.revenue) }))
    .filter((d) => Number.isFinite(d.revenue));

  if (points.length > 0) {
    const svgNS = "http://www.w3.org/2000/svg";
    const W = 900, H = 300;
    const padL = 56, padR = 24, padT = 24, padB = 36;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const values = points.map((p) => p.revenue);
    let minV = Math.min(...values);
    let maxV = Math.max(...values);
    if (minV === maxV) { minV = minV - 1; maxV = maxV + 1; }
    const niceMin = Math.min(0, minV);

    const xAt = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const yAt = (v) => padT + plotH - ((v - niceMin) / (maxV - niceMin)) * plotH;

    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", "100%");
    svg.setAttribute("role", "img");
    svg.style.display = "block";

    // horizontal gridlines + y ticks
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const v = niceMin + (t / ticks) * (maxV - niceMin);
      const y = yAt(v);
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", String(padL));
      line.setAttribute("x2", String(W - padR));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", t === 0 ? AXIS : GRID);
      line.setAttribute("stroke-width", "1");
      svg.append(line);
      const lbl = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", String(padL - 8));
      lbl.setAttribute("y", String(y + 4));
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("font-size", "11");
      lbl.setAttribute("fill", MUTED);
      lbl.textContent = usdCompact.format(v);
      svg.append(lbl);
    }

    // baseline (x axis)
    const xAxis = document.createElementNS(svgNS, "line");
    xAxis.setAttribute("x1", String(padL));
    xAxis.setAttribute("x2", String(W - padR));
    xAxis.setAttribute("y1", String(padT + plotH));
    xAxis.setAttribute("y2", String(padT + plotH));
    xAxis.setAttribute("stroke", AXIS);
    xAxis.setAttribute("stroke-width", "1");
    svg.append(xAxis);

    // x tick labels
    for (let i = 0; i < points.length; i++) {
      const lbl = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", String(xAt(i)));
      lbl.setAttribute("y", String(H - 12));
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("font-size", "11");
      lbl.setAttribute("fill", MUTED);
      lbl.textContent = points[i].month;
      svg.append(lbl);
    }

    // line path
    let dAttr = "";
    for (let i = 0; i < points.length; i++) {
      dAttr += (i === 0 ? "M" : "L") + xAt(i) + " " + yAt(points[i].revenue) + " ";
    }
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", dAttr.trim());
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", SERIES1);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    svg.append(path);

    // selective direct labels: first, last, max
    let maxIdx = 0;
    for (let i = 1; i < points.length; i++) { if (points[i].revenue > points[maxIdx].revenue) maxIdx = i; }
    const labelIdx = new Set([0, points.length - 1, maxIdx]);
    for (const i of labelIdx) {
      const cx = xAt(i), cy = yAt(points[i].revenue);
      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "3");
      dot.setAttribute("fill", SERIES1);
      svg.append(dot);
      const lbl = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", String(cx));
      lbl.setAttribute("y", String(cy - 8));
      lbl.setAttribute("text-anchor", i === points.length - 1 ? "end" : i === 0 ? "start" : "middle");
      lbl.setAttribute("font-size", "11");
      lbl.setAttribute("font-weight", "600");
      lbl.setAttribute("fill", INK);
      lbl.textContent = usdCompact.format(points[i].revenue);
      svg.append(lbl);
    }

    chartCard.append(svg);
  }
  stack.append(chartCard);

  // 4. Top Products table
  const tableCard = makeCard();
  const tableTitle = document.createElement("div");
  tableTitle.style.cssText = "color:" + INK + ";font-size:16px;font-weight:600;margin-bottom:12px;";
  tableTitle.textContent = "Top Products";
  tableCard.append(tableTitle);

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:14px;";
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  const headers = [
    { text: "Rank", num: true },
    { text: "Product", num: false },
    { text: "Category", num: false },
    { text: "Units", num: true },
    { text: "Revenue", num: true },
    { text: "MoM Growth", num: true },
  ];
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h.text;
    th.style.cssText = "text-align:" + (h.num ? "right" : "left") + ";padding:8px 10px;color:" + INK2 + ";font-weight:600;border-bottom:1px solid " + CARD_BORDER + ";" + (h.num ? "font-variant-numeric:tabular-nums;" : "");
    htr.append(th);
  }
  thead.append(htr);
  table.append(thead);

  const tbody = document.createElement("tbody");
  topProducts.forEach((p, idx) => {
    const tr = document.createElement("tr");
    const mom = p.momGrowth ?? p.mom ?? p.growthPct ?? p.momPct;
    const cells = [
      { text: String(p.rank ?? idx + 1), num: true },
      { text: String(p.product ?? p.name ?? ""), num: false },
      { text: String(p.category ?? ""), num: false },
      { text: countFmt.format(Number(p.units ?? 0)), num: true },
      { text: usdCompact.format(Number(p.revenue ?? 0)), num: true },
      { text: fmtSignedPct(mom), num: true, color: (mom !== undefined && mom !== null) ? deltaColor(mom, false) : INK },
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c.text;
      td.style.cssText = "text-align:" + (c.num ? "right" : "left") + ";padding:8px 10px;color:" + (c.color ?? INK) + ";border-bottom:1px solid " + GRID + ";" + (c.num ? "font-variant-numeric:tabular-nums;" : "");
      tr.append(td);
    }
    tbody.append(tr);
  });
  table.append(tbody);
  tableCard.append(table);
  stack.append(tableCard);

  root.append(page);
}
