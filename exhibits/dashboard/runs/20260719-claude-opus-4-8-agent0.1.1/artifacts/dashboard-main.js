export default async function mount(root, api) {
  const data = await api.invoke("dashboard.dataset", {});
  const meta = data?.meta ?? {};
  const summary = Array.isArray(data?.summary) ? data.summary : [];
  const revenueTrend = Array.isArray(data?.revenueTrend) ? data.revenueTrend : [];
  const topProducts = Array.isArray(data?.topProducts) ? data.topProducts : [];

  // ---- formatting helpers (never fabricate; only format returned values) ----
  const fmtUsd = (n) => {
    if (typeof n !== "number" || !isFinite(n)) return "n/a";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(1) + "B";
    if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(1) + "M";
    if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
    return sign + "$" + Math.round(abs).toLocaleString();
  };
  const fmtPct = (n) => (typeof n === "number" && isFinite(n)) ? n.toFixed(1) + "%" : "n/a";
  const fmtCount = (n) => (typeof n === "number" && isFinite(n)) ? Math.round(n).toLocaleString() : "n/a";
  const fmtValue = (v, unit) => unit === "usd" ? fmtUsd(v) : unit === "pct" ? fmtPct(v) : fmtCount(v);
  const fmtUsdFull = (n) => (typeof n === "number" && isFinite(n)) ? (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US") : "n/a";
  const fmtValueFull = (v, unit) => unit === "usd" ? fmtUsdFull(v) : unit === "pct" ? fmtPct(v) : fmtCount(v);
  const fmtSignedPct = (n) => {
    if (typeof n !== "number" || !isFinite(n)) return "n/a";
    const s = n.toFixed(1) + "%";
    return n > 0 ? "+" + s : s;
  };
  const deltaColor = (d, goodWhenDown) => {
    if (typeof d !== "number" || d === 0) return "#555";
    const up = d > 0;
    const good = goodWhenDown ? !up : up;
    return good ? "#006300" : "#d03b3b";
  };
  const arrow = (d) => d > 0 ? "\u25B2" : d < 0 ? "\u25BC" : "";

  root.innerHTML = "";
  const CARD = "background:#fcfcfb;border:1px solid rgba(11,11,11,0.10);border-radius:12px;padding:16px;box-sizing:border-box;min-width:0";
  const page = document.createElement("div");
  page.style.cssText = "font-family:system-ui,-apple-system,sans-serif;background:#f9f9f7;min-height:100%;padding:16px;box-sizing:border-box;display:grid;gap:16px;color:#0b0b0b";

  // ---- header ----
  const header = document.createElement("header");
  const h1 = document.createElement("h1");
  h1.textContent = meta.business ?? "Dashboard";
  h1.style.cssText = "margin:0;font-size:22px;font-weight:700";
  const sub = document.createElement("div");
  sub.textContent = meta.period?.label ?? "";
  sub.style.cssText = "margin-top:4px;font-size:13px;color:#555";
  header.append(h1, sub);

  // ---- KPI stat row (6 tiles) ----
  const kpiRow = document.createElement("section");
  kpiRow.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px";
  for (const item of summary) {
    const card = document.createElement("div");
    card.style.cssText = CARD;
    const label = document.createElement("div");
    label.textContent = item.label ?? "";
    label.style.cssText = "font-size:13px;color:#555;font-weight:500";
    const value = document.createElement("div");
    value.textContent = fmtValueFull(item.value, item.unit);
    value.style.cssText = "font-size:30px;font-weight:700;margin:6px 0;font-variant-numeric:tabular-nums;line-height:1.1";
    const delta = document.createElement("div");
    const dp = item.deltaPct;
    if (typeof dp === "number") {
      delta.textContent = (arrow(dp) + " " + fmtSignedPct(dp)).trim();
      delta.style.cssText = "font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;color:" + deltaColor(dp, item.goodWhenDown === true);
    }
    card.append(label, value, delta);
    kpiRow.append(card);
  }

  // ---- revenue trend line chart (inline SVG) ----
  const chartCard = document.createElement("section");
  chartCard.style.cssText = CARD;
  const chartTitle = document.createElement("h2");
  chartTitle.textContent = "Revenue Trend";
  chartTitle.style.cssText = "margin:0 0 12px;font-size:16px;font-weight:700";
  chartCard.append(chartTitle);

  const svgNS = "http://www.w3.org/2000/svg";
  const W = 720, H = 260, padL = 8, padR = 52, padT = 18, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const vals = revenueTrend.map((d) => typeof d.revenue === "number" ? d.revenue : 0);
  const n = vals.length;
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("width", "100%");
  svg.style.cssText = "display:block;max-width:100%;height:auto";

  if (n > 0) {
    const maxV = Math.max.apply(null, vals);
    const minV = Math.min.apply(null, vals);
    const range = (maxV - minV) || 1;
    const yMin = minV - range * 0.1;
    const yMax = maxV + range * 0.1;
    const x = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const gridCount = 4;
    for (let g = 0; g <= gridCount; g++) {
      const gy = padT + (g / gridCount) * plotH;
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", padL);
      line.setAttribute("x2", padL + plotW);
      line.setAttribute("y1", gy);
      line.setAttribute("y2", gy);
      line.setAttribute("stroke", "rgba(11,11,11,0.08)");
      line.setAttribute("stroke-width", "1");
      svg.append(line);
      const gv = yMax - (g / gridCount) * (yMax - yMin);
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", padL + plotW + 6);
      t.setAttribute("y", gy + 4);
      t.setAttribute("font-size", "10");
      t.setAttribute("fill", "#999");
      t.setAttribute("font-family", "system-ui,sans-serif");
      t.style.fontVariantNumeric = "tabular-nums";
      t.textContent = fmtUsd(gv);
      svg.append(t);
    }

    let dstr = "";
    vals.forEach((v, i) => { dstr += (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " "; });
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", dstr.trim());
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#2a78d6");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    svg.append(path);

    const maxIdx = vals.indexOf(maxV);
    const labelIdx = Array.from(new Set([0, n - 1, maxIdx])).filter((i) => i >= 0);
    labelIdx.forEach((i) => {
      const cx = x(i), cy = y(vals[i]);
      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("cx", cx);
      dot.setAttribute("cy", cy);
      dot.setAttribute("r", "3");
      dot.setAttribute("fill", "#2a78d6");
      svg.append(dot);
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", cx);
      t.setAttribute("y", cy - 8);
      t.setAttribute("font-size", "10");
      t.setAttribute("fill", "#2a78d6");
      t.setAttribute("font-weight", "600");
      t.setAttribute("text-anchor", i === 0 ? "start" : i === n - 1 ? "end" : "middle");
      t.setAttribute("font-family", "system-ui,sans-serif");
      t.style.fontVariantNumeric = "tabular-nums";
      t.textContent = fmtUsd(vals[i]);
      svg.append(t);
    });

    revenueTrend.forEach((d, i) => {
      const m = d.month ?? d.label;
      if (m == null) return;
      if (n > 8 && i % 2 !== 0 && i !== n - 1) return;
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", x(i));
      t.setAttribute("y", H - 8);
      t.setAttribute("font-size", "10");
      t.setAttribute("fill", "#999");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-family", "system-ui,sans-serif");
      t.textContent = String(m);
      svg.append(t);
    });
  }
  chartCard.append(svg);

  // ---- Top Products table ----
  const tableCard = document.createElement("section");
  tableCard.style.cssText = CARD;
  const tableTitle = document.createElement("h2");
  tableTitle.textContent = "Best Sellers";
  tableTitle.style.cssText = "margin:0 0 12px;font-size:16px;font-weight:700";
  tableCard.append(tableTitle);
  const wrap = document.createElement("div");
  wrap.style.cssText = "overflow-x:auto";
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px";
  const cols = [
    { t: "Rank", num: true },
    { t: "Name", num: false },
    { t: "Category", num: false },
    { t: "Units", num: true },
    { t: "Revenue", num: true },
    { t: "MoM Growth", num: true },
  ];
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  cols.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c.t;
    th.style.cssText = "text-align:" + (c.num ? "right" : "left") + ";padding:8px 10px;border-bottom:1px solid rgba(11,11,11,0.15);color:#555;font-weight:600;white-space:nowrap";
    htr.append(th);
  });
  thead.append(htr);
  table.append(thead);
  const tbody = document.createElement("tbody");
  const mkCell = (text, num, color) => {
    const td = document.createElement("td");
    td.textContent = text;
    td.style.cssText = "padding:8px 10px;border-bottom:1px solid rgba(11,11,11,0.06);" +
      (num ? "text-align:right;font-variant-numeric:tabular-nums;" : "text-align:left;") +
      (color ? ("color:" + color + ";font-weight:600;") : "");
    return td;
  };
  topProducts.forEach((p, i) => {
    const tr = document.createElement("tr");
    const g = typeof p.growthPct === "number" ? p.growthPct
      : typeof p.momGrowth === "number" ? p.momGrowth
      : typeof p.growth === "number" ? p.growth : null;
    tr.append(mkCell(String(p.rank ?? (i + 1)), true));
    tr.append(mkCell(p.name ?? "", false));
    tr.append(mkCell(p.category ?? "", false));
    tr.append(mkCell(fmtCount(p.units), true));
    tr.append(mkCell(fmtUsd(p.revenue), true));
    tr.append(mkCell(g == null ? "n/a" : fmtSignedPct(g), true, g == null ? null : deltaColor(g, false)));
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  tableCard.append(wrap);

  page.append(header, kpiRow, chartCard, tableCard);
  root.append(page);
}
