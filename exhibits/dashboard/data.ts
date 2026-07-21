/**
 * Deterministic in-memory dataset for the dashboard-builder sample
 * (Phase 6 dogfooding, mission M6 — gallery-quality dashboard).
 *
 * UI-only 원칙 (samples/README.md 규율 2): this is the sample's mock
 * "backend" — hand-authored, no randomness, no external service. It is
 * served to generated UI exclusively through the `dashboard.dataset`
 * capability granted in app.ts; the model never sees these values in its
 * prompt (knowledge.ts describes the SHAPE, the sandbox invokes for the
 * VALUES at render time — the same separation a real host would keep).
 *
 * Internal coherence: `summary` compares 2026-06 against 2026-05 and both
 * months appear verbatim in `revenueTrend`; category/product/channel revenue
 * figures are plausible slices of the June total. Currency is USD.
 */

export const DASHBOARD_DATASET = {
  meta: {
    business: "Nova Commerce",
    currency: "USD",
    period: { label: "June 2026", current: "2026-06", previous: "2026-05" },
  },
  // KPI summary — current vs previous month. deltaPct is signed percent.
  summary: [
    { id: "revenue", label: "Revenue", unit: "usd", value: 128_400, previous: 117_900, deltaPct: 8.9 },
    { id: "orders", label: "Orders", unit: "count", value: 3_420, previous: 3_180, deltaPct: 7.5 },
    { id: "aov", label: "Avg. Order Value", unit: "usd", value: 37.54, previous: 37.08, deltaPct: 1.2 },
    { id: "conversion", label: "Conversion Rate", unit: "pct", value: 3.1, previous: 2.8, deltaPct: 10.7 },
    { id: "customers", label: "Active Customers", unit: "count", value: 12_840, previous: 12_150, deltaPct: 5.7 },
    { id: "refundRate", label: "Refund Rate", unit: "pct", value: 1.4, previous: 1.7, deltaPct: -17.6, goodWhenDown: true },
  ],
  // Monthly trend, oldest → newest (12 months ending at the current period).
  revenueTrend: [
    { month: "2025-07", revenue: 84_200, orders: 2_310 },
    { month: "2025-08", revenue: 88_900, orders: 2_450 },
    { month: "2025-09", revenue: 92_600, orders: 2_540 },
    { month: "2025-10", revenue: 99_300, orders: 2_720 },
    { month: "2025-11", revenue: 121_500, orders: 3_310 },
    { month: "2025-12", revenue: 134_800, orders: 3_640 },
    { month: "2026-01", revenue: 96_400, orders: 2_650 },
    { month: "2026-02", revenue: 101_200, orders: 2_780 },
    { month: "2026-03", revenue: 108_700, orders: 2_960 },
    { month: "2026-04", revenue: 112_300, orders: 3_050 },
    { month: "2026-05", revenue: 117_900, orders: 3_180 },
    { month: "2026-06", revenue: 128_400, orders: 3_420 },
  ],
  // Category share of current-month revenue (sums to the June total).
  categorySales: [
    { category: "Electronics", revenue: 46_200, share: 36.0 },
    { category: "Home & Living", revenue: 30_800, share: 24.0 },
    { category: "Apparel", revenue: 24_400, share: 19.0 },
    { category: "Beauty", revenue: 16_700, share: 13.0 },
    { category: "Sports", revenue: 10_300, share: 8.0 },
  ],
  // Current-month top products by revenue.
  topProducts: [
    { rank: 1, name: "Aurora Wireless Earbuds", category: "Electronics", units: 412, revenue: 20_580, momGrowthPct: 14.2 },
    { rank: 2, name: "Nimbus Air Purifier", category: "Home & Living", units: 187, revenue: 14_930, momGrowthPct: 6.8 },
    { rank: 3, name: "Trail Runner Pro Shoes", category: "Sports", units: 203, revenue: 12_140, momGrowthPct: -2.4 },
    { rank: 4, name: "Silk Glow Serum", category: "Beauty", units: 486, revenue: 10_690, momGrowthPct: 22.9 },
    { rank: 5, name: "Linen Lounge Set", category: "Apparel", units: 174, revenue: 9_560, momGrowthPct: 4.1 },
  ],
  // Acquisition channels for the current month.
  channels: [
    { channel: "Organic Search", sessions: 48_200, conversionPct: 3.4, revenue: 52_100 },
    { channel: "Paid Social", sessions: 31_500, conversionPct: 2.6, revenue: 33_400 },
    { channel: "Email", sessions: 12_900, conversionPct: 4.8, revenue: 24_700 },
    { channel: "Referral", sessions: 9_100, conversionPct: 2.9, revenue: 18_200 },
  ],
} as const;
