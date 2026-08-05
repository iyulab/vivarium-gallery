/**
 * dashboard 전시물 — 갤러리 전시물 #1 (dashboard-builder 이식, G1).
 *
 * dashboard-builder 샘플(M1~M8 완주 표면)을 ExhibitDefinition 계약으로
 * 재표현한 것. 시드·capability·knowledge·scripted provider 는 원본과
 * 동일해야 smoke 동등성이 성립한다. 원본이 은퇴하면 이 디렉터리가 정본.
 */

import type { ExhibitDefinition } from "../../host/exhibit-schema.ts";
import { DASHBOARD_DATASET } from "./data.ts";
import { createDashboardKnowledge } from "./knowledge.ts";
import { createDashboardScriptProvider } from "./scripted.ts";

/**
 * Plain-JS generated-code contract (vivarium/docs/getting-started.md §1):
 * artifacts default-export `mount(root, api)`. Widget-list design
 * (FRICTION-20260717-seed-capability-binds-widget-count fix): the widgets
 * array is OWNED BY THE ARTIFACT — capability-backed entries read from the
 * invoke result, new entries may carry inline data.
 */
const SEED_CONTENT = `export default async function mount(root, api) {
  const metrics = await api.invoke("dashboard.metrics", {});
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  // This widget list is owned by the artifact: each entry renders one card.
  // Capability-backed entries read from byId; new entries may use inline data.
  const widgets = [
    { label: "Revenue", value: byId.revenue?.value ?? "n/a" },
    { label: "Orders", value: byId.orders?.value ?? "n/a" },
  ];
  root.innerHTML = "";
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:12px";
  for (const w of widgets) {
    const card = document.createElement("section");
    card.style.cssText = "border:1px solid #ccc;border-radius:8px;padding:12px";
    const h = document.createElement("h3");
    h.textContent = w.label;
    const v = document.createElement("p");
    v.style.cssText = "font-size:28px;margin:4px 0";
    v.textContent = String(w.value);
    card.append(h, v);
    grid.append(card);
  }
  root.append(grid);
}`;

const exhibit: ExhibitDefinition = {
  meta: {
    name: "dashboard",
    title: "커머스 분석 대시보드",
    description: "채팅으로 대시보드 위젯 카드를 구축·변형하는 전시물 — dashboard-builder(M1~M8) 이식본",
    domain: "dashboard",
  },
  target: "dashboard",
  artifacts: { "dashboard-main": SEED_CONTENT },
  primaryArtifactId: "dashboard-main",
  capabilities: [
    {
      descriptor: { name: "dashboard.metrics", description: "read-only mock KPI metrics" },
      handler: async () => [
        { id: "revenue", label: "Revenue", value: 12800 },
        { id: "orders", label: "Orders", value: 342 },
      ],
    },
    {
      descriptor: {
        name: "dashboard.dataset",
        description: "read-only commerce analytics dataset (summary/trend/categories/products/channels)",
      },
      handler: async () => DASHBOARD_DATASET,
    },
  ],
  render: {
    expectInvokes: ["dashboard.metrics"],
    // 카드의 값 자리. 라벨(h3)은 값이 사라져도 차 있으므로 자리로 쓰지 않는다.
    expectFilled: [{ selector: "section p", placeholder: "n/a" }],
  },
  createKnowledge: () => [createDashboardKnowledge()],
  createScriptedProvider: () => createDashboardScriptProvider(),
};

export default exhibit;
