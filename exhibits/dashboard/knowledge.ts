/**
 * Sample-local KnowledgeSource for the dashboard-builder (mission M6).
 *
 * First consumer exercise of the published `@vivariumjs/agent` knowledge
 * port (fixed principle 4: knowledge is pluggable data, recorded in
 * provenance). Two documents are served on every query:
 *
 *   1. DATA CATALOG — which capabilities the sandbox grants and the exact
 *      shape they return. The shape example is derived from data.ts at
 *      runtime (JSON of a truncated instance), so catalog and dataset can
 *      never drift apart.
 *   2. DESIGN SYSTEM — the sample's house style rules for generated UI
 *      (palette, ink, layout, chart marks). Palette values are the
 *      validated reference set of the dataviz method (adjacent-pair CVD
 *      ΔE ≥ 8, normal-vision ΔE ≥ 15, light surface #fcfcfb).
 *
 * This is app-side wiring, not a library change: the harness only sees the
 * KnowledgeSource port. `retrieve()` ignores the query on purpose — both
 * documents are small, always relevant to this single-surface sample, and
 * deterministic (the scripted-provider smoke stays deterministic).
 */

import type { KnowledgeSource } from "@vivariumjs/agent";
import { DASHBOARD_DATASET } from "./data.ts";

/** Truncated but real instance — arrays cut to their first entry. */
function shapeExample(): string {
  const d = DASHBOARD_DATASET;
  return JSON.stringify(
    {
      meta: d.meta,
      summary: [d.summary[0], "…(6 entries total)"],
      revenueTrend: [d.revenueTrend[0], "…(12 months, oldest→newest, ends at meta.period.current)"],
      categorySales: [d.categorySales[0], "…(5 categories, share sums to 100)"],
      topProducts: [d.topProducts[0], "…(5 products by revenue)"],
      channels: [d.channels[0], "…(4 channels)"],
    },
    null,
    1,
  );
}

const DATA_CATALOG = () => `DATA CATALOG — capabilities granted to this dashboard sandbox.
Fetch data ONLY via these invokes; never fabricate numbers or copy values from the screen.

1. api.invoke("dashboard.dataset", {}) → the full analytics dataset:
${shapeExample()}
Field semantics: unit "usd" = US dollars, "pct" = percent, "count" = plain count.
deltaPct is signed percent vs meta.period.previous. An entry with goodWhenDown
=== true (e.g. refundRate) improves when it decreases — color its delta accordingly.

2. api.invoke("dashboard.metrics", {}) → legacy 2-KPI array
[{ id: "revenue"|"orders", label, value }] — superseded by dashboard.dataset;
prefer dashboard.dataset for anything new.`;

const DESIGN_SYSTEM = `DESIGN SYSTEM — house rules for this dashboard's generated UI (light mode).

Language (FRICTION-20260718-label-language-follows-instruction)
- ALL dashboard copy — widget titles, axis labels, table headers, captions,
  footers — is in English, regardless of the language the user's instruction
  is written in. The conversation language never leaks into UI text.

Layout
- Page order: header (business name + period label) → KPI stat row → charts → table.
- One scroll surface; nothing may overflow its card. CSS grid, 16px gaps,
  cards: background #fcfcfb, 1px solid rgba(11,11,11,0.10), border-radius 12px,
  padding 16px. Page background #f9f9f7.
- Typeface: system-ui sans everywhere. Table columns and axis ticks use
  font-variant-numeric: tabular-nums. Stat-tile values 28–32px bold.

Ink (never put text in a series color)
- Primary #0b0b0b · secondary #52514e · muted/axis #898781.
- Gridlines #e1e0d9 (hairline) · baseline/axis line #c3c2b7.
- Delta up-good #006300, down-bad #d03b3b — arrow (▲/▼) + signed percent,
  direction flipped for goodWhenDown entries.

Series colors (fixed order, assign by position, never cycle or invent hues)
1 #2a78d6 blue · 2 #008300 green · 3 #e87ba4 magenta · 4 #eda100 yellow
5 #1baf7a aqua · 6 #eb6834 orange · 7 #4a3aa7 violet · 8 #e34948 red.

Charts (hand-rolled inline SVG — no external libraries, no network access)
- ONE y-axis per chart, never two scales. Two measures → two charts.
- Lines 2px; bars flat-side at the baseline with 4px rounded data-end;
  ≥2px gap between adjacent bars/stacked segments.
- Legend whenever a chart has ≥2 series; a single-series chart is named by
  its title instead. Selective direct labels only (first/last/max — not
  every point). Axis ticks in muted ink; horizontal gridlines only.
- Numbers: compact currency ($128.4K), percents to 1 decimal.

Safety
- Build DOM nodes and use textContent for any data-derived string
  (createElementNS for SVG). No innerHTML with interpolated data.`;

export function createDashboardKnowledge(): KnowledgeSource {
  return {
    name: "dashboard-sample-catalog",
    async retrieve() {
      return [DATA_CATALOG(), DESIGN_SYSTEM];
    },
  };
}
