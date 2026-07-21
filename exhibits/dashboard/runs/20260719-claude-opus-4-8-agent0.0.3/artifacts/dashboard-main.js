export default async function mount(root, api) {
  const data = await api.invoke("dashboard.dataset", {});
  const meta = data.meta || {};
  const summary = Array.isArray(data.summary) ? data.summary : [];
  const revenueTrend = Array.isArray(data.revenueTrend) ? data.revenueTrend : [];
  const topProducts = Array.isArray(data.topProducts) ? data.topProducts : [];

  // ---- Formatters ----
  const fmtCurrencyCompact = (n) => {
    const num = Number(n) || 0;
    const abs = Math.abs(num);
    const sign = num < 0 ? "-" : "";
    if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(1) + "B";
    if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(1) + "M";
    if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
    return sign + "$" + abs.toFixed(0);
  };
  const fmtCurrencyFull = (n) => {
    const num = Number(n) || 0;
    const abs = Math.abs(num);
    const sign = num < 0 ? "-" : "";
    return sign + "$" + Math.round(abs).toLocaleString("en-US");
  };
  const fmtByUnit = (value, unit) => {
    if (unit === "usd") return fmtCurrencyFull(value);
    if (unit === "pct") return (Number(value) || 0).toFixed(1) + "%";
    return new Intl.NumberFormat("en-US").format(Number(value) || 0);
  };
  const fmtSignedPct = (v) => {
    const num = Number(v) || 0;
    const sign = num > 0 ? "+" : num < 0 ? "\u2212" : "";
    return sign + Math.abs(num).toFixed(1) + "%";
  };

  // ---- House design tokens ----
  const INK = "#0b0b0b";
  const INK_SECONDARY = "#6b6a64";
  const INK_MUTED = "#898781";
  const PAGE_BG = "#f9f9f7";
  const CARD_BG = "#fcfcfb";
  const CARD_BORDER = "rgba(11,11,11,0.10)";
  const GREEN = "#006300";
  const RED = "#d03b3b";
  const SERIES1 = "#2a78d6";
  const GRIDLINE = "#e1e0d9";
  const AXIS_LINE = "#c3c2b7";
  const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const SVGNS = "http://www.w3.org/2000/svg";

  root.innerHTML = "";

  const page = document.createElement("div");
  page.style.cssText =
    "background:" + PAGE_BG + ";min-height:100%;padding:16px;box-sizing:border-box;" +
    "font-family:" + FONT + ";color:" + INK + ";display:grid;grid-template-columns:1fr;gap:16px;";

  const card = () => {
    const c = document.createElement("section");
    c.style.cssText =
      "background:" + CARD_BG + ";border:1px solid " + CARD_BORDER + ";border-radius:12px;padding:16px;";
    return c;
  };

  // ---- Header ----
  const header = document.createElement("header");
  const h1 = document.createElement("h1");
  h1.style.cssText = "margin:0;font-size:24px;font-weight:700;color:" + INK + ";";
  h1.textContent = String(meta.business ?? "");
  const caption = document.createElement("p");
  caption.style.cssText = "margin:4px 0 0;font-size:14px;color:" + INK_SECONDARY + ";";
  caption.textContent = String((meta.period && meta.period.label) ?? "");
  header.append(h1, caption);
  page.append(header);

  // ---- KPI stat row ----
  const kpiRow = document.createElement("div");
  kpiRow.style.cssText =
    "display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;";
  for (const s of summary) {
    const tile = card();
    const label = document.createElement("div");
    label.style.cssText = "font-size:13px;color:" + INK_SECONDARY + ";";
    label.textContent = String(s.label ?? "");
    const value = document.createElement("div");
    value.style.cssText =
      "font-size:30px;font-weight:700;margin:6px 0 4px;color:" + INK + ";font-variant-numeric:tabular-nums;";
    value.textContent = fmtByUnit(s.value, s.unit);

    const deltaNum = Number(s.deltaPct) || 0;
    const goodWhenDown = s.goodWhenDown === true;
    const isGood = goodWhenDown ? deltaNum <= 0 : deltaNum >= 0;
    const arrow = deltaNum > 0 ? "\u2191" : deltaNum < 0 ? "\u2193" : "\u2192";
    const delta = document.createElement("div");
    delta.style.cssText =
      "font-size:13px;font-variant-numeric:tabular-nums;color:" + (isGood ? GREEN : RED) + ";";
    delta.textContent = arrow + " " + fmtSignedPct(deltaNum);

    tile.append(label, value, delta);
    kpiRow.append(tile);
  }
  page.append(kpiRow);

  // ---- Revenue trend chart ----
  const chartCard = card();
  const chartTitle = document.createElement("h2");
  chartTitle.style.cssText = "margin:0 0 12px;font-size:16px;font-weight:600;color:" + INK + ";";
  chartTitle.textContent = "Revenue Trend";
  chartCard.append(chartTitle);

  const W = 720, H = 280;
  const padL = 56, padR = 56, padT = 16, padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("width", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.cssText = "display:block;font-family:" + FONT + ";";

  const revs = revenueTrend.map((d) => Number(d.revenue) || 0);
  const maxRev = revs.length ? Math.max(...revs) : 0;
  const minRev = 0;
  const range = maxRev - minRev || 1;
  const n = revenueTrend.length;

  const xAt = (i) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yAt = (v) => padT + plotH - ((v - minRev) / range) * plotH;

  // gridlines + y ticks
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const val = minRev + (range * t) / ticks;
    const y = yAt(val);
    const line = document.createElementNS(SVGNS, "line");
    line.setAttribute("x1", String(padL));
    line.setAttribute("x2", String(padL + plotW));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", GRIDLINE);
    line.setAttribute("stroke-width", "1");
    svg.append(line);

    const label = document.createElementNS(SVGNS, "text");
    label.setAttribute("x", String(padL - 8));
    label.setAttribute("y", String(y + 4));
    label.setAttribute("text-anchor", "end");
    label.setAttribute("fill", INK_MUTED);
    label.setAttribute("font-size", "11");
    label.setAttribute("style", "font-variant-numeric:tabular-nums;");
    label.textContent = fmtCurrencyCompact(val);
    svg.append(label);
  }

  // axis line (x)
  const xAxis = document.createElementNS(SVGNS, "line");
  xAxis.setAttribute("x1", String(padL));
  xAxis.setAttribute("x2", String(padL + plotW));
  xAxis.setAttribute("y1", String(padT + plotH));
  xAxis.setAttribute("y2", String(padT + plotH));
  xAxis.setAttribute("stroke", AXIS_LINE);
  xAxis.setAttribute("stroke-width", "1");
  svg.append(xAxis);

  // x axis ticks (month labels)
  revenueTrend.forEach((d, i) => {
    const label = document.createElementNS(SVGNS, "text");
    label.setAttribute("x", String(xAt(i)));
    label.setAttribute("y", String(padT + plotH + 18));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", INK_MUTED);
    label.setAttribute("font-size", "10");
    label.setAttribute("style", "font-variant-numeric:tabular-nums;");
    label.textContent = String(d.month ?? "");
    svg.append(label);
  });

  // line path
  if (n > 0) {
    let dAttr = "";
    revenueTrend.forEach((d, i) => {
      const x = xAt(i);
      const y = yAt(Number(d.revenue) || 0);
      dAttr += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2) + " ";
    });
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("d", dAttr.trim());
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", SERIES1);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    svg.append(path);

    // direct-label last point
    const last = revenueTrend[n - 1];
    const lx = xAt(n - 1);
    const ly = yAt(Number(last.revenue) || 0);
    const dot = document.createElementNS(SVGNS, "circle");
    dot.setAttribute("cx", String(lx));
    dot.setAttribute("cy", String(ly));
    dot.setAttribute("r", "3");
    dot.setAttribute("fill", SERIES1);
    svg.append(dot);

    const lastLabel = document.createElementNS(SVGNS, "text");
    lastLabel.setAttribute("x", String(lx - 6));
    lastLabel.setAttribute("y", String(ly - 8));
    lastLabel.setAttribute("text-anchor", "end");
    lastLabel.setAttribute("fill", SERIES1);
    lastLabel.setAttribute("font-size", "12");
    lastLabel.setAttribute("font-weight", "600");
    lastLabel.setAttribute("style", "font-variant-numeric:tabular-nums;");
    lastLabel.textContent = fmtCurrencyCompact(Number(last.revenue) || 0);
    svg.append(lastLabel);
  }

  chartCard.append(svg);
  page.append(chartCard);

  // ---- Top Products table ----
  const tableCard = card();
  const tableTitle = document.createElement("h2");
  tableTitle.style.cssText = "margin:0 0 12px;font-size:16px;font-weight:600;color:" + INK + ";";
  tableTitle.textContent = "\uC0C1\uC704 \uC81C\uD488";
  tableCard.append(tableTitle);

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";

  const cols = [
    { key: "rank", label: "Rank", align: "left" },
    { key: "product", label: "Product", align: "left" },
    { key: "category", label: "Category", align: "left" },
    { key: "units", label: "Units", align: "right" },
    { key: "revenue", label: "Revenue", align: "right" },
    { key: "momGrowth", label: "MoM Growth", align: "right" },
  ];

  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    th.style.cssText =
      "text-align:" + c.align + ";padding:8px 10px;border-bottom:1px solid " + CARD_BORDER +
      ";color:" + INK_SECONDARY + ";font-weight:600;" +
      (c.align === "right" ? "font-variant-numeric:tabular-nums;" : "");
    th.textContent = c.label;
    htr.append(th);
  }
  thead.append(htr);
  table.append(thead);

  const tbody = document.createElement("tbody");
  topProducts.forEach((row, i) => {
    const tr = document.createElement("tr");
    cols.forEach((c) => {
      const td = document.createElement("td");
      const rightAlign = c.align === "right";
      let style =
        "text-align:" + c.align + ";padding:8px 10px;border-bottom:1px solid " + GRIDLINE + ";" +
        (rightAlign ? "font-variant-numeric:tabular-nums;" : "");
      if (c.key === "revenue") {
        td.textContent = fmtCurrencyCompact(row.revenue);
      } else if (c.key === "momGrowth") {
        const g = Number(row.momGrowth) || 0;
        style += "color:" + (g >= 0 ? GREEN : RED) + ";";
        td.textContent = fmtSignedPct(g);
      } else if (c.key === "units") {
        td.textContent = new Intl.NumberFormat("en-US").format(Number(row.units) || 0);
      } else if (c.key === "rank") {
        td.textContent = String(row.rank ?? i + 1);
      } else {
        td.textContent = String(row[c.key] ?? "");
      }
      td.setAttribute("style", style);
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  tableCard.append(table);
  page.append(tableCard);

  root.append(page);
}
