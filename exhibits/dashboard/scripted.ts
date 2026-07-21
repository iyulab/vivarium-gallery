/**
 * Deterministic scripted "model" for the dashboard-builder sample. Plays the
 * ModelProvider port a real LLM would occupy (vivarium-agent/docs/getting-started.md
 * §1) — the harness cannot tell the difference, which is the point.
 *
 * Two calls per turn:
 *  - planner (`request.system.includes("planner")`): a one-line plan. The
 *    planner prompt carries a `PRIOR PROPOSAL` section only on refine turns
 *    (plan-then-generate.ts buildPlanPrompt), so that's the deterministic
 *    signal used to tell turn 1 from a refine — no input-content sniffing.
 *  - generator: reads the plan's `[[marker]]` back out of its own prompt
 *    (the plan text is echoed into `PLAN:` ahead of `ARTIFACTS:`) and emits
 *    the matching uiPatches JSON.
 *
 * Fixed, input-independent responses — at least 2 turns:
 *   1. initial proposal — appends one widget entry to the artifact-owned
 *      widget list (same idiom as the seed in artifacts.ts).
 *   2. refine — renames that widget's label (deterministic variation).
 */

import type { ModelProvider, ModelRequest } from "@vivariumjs/agent";

const ADDED_CARD_CONTENT = `export default async function mount(root, api) {
  const metrics = await api.invoke("dashboard.metrics", {});
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  // This widget list is owned by the artifact: each entry renders one card.
  // Capability-backed entries read from byId; new entries may use inline data.
  const widgets = [
    { label: "Revenue", value: byId.revenue?.value ?? "n/a" },
    { label: "Orders", value: byId.orders?.value ?? "n/a" },
    { label: "New Metric", value: 0 },
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

// Refine turn: rename the added widget's label (deterministic variation of the same artifact).
const REFINED_CONTENT = ADDED_CARD_CONTENT.replace(
  '{ label: "New Metric", value: 0 }',
  '{ label: "Active Users", value: 0 }',
);

// Second refine (agent 0.0.3 no-op 게이트 이후): base 가 이미 "Active Users"
// 상태면 다시 다른 변형을 내야 한다 — 동일 콘텐츠 재출력은 게이트가
// 정확히 거부하므로(그게 0.0.3 의 목적), scripted 도 항상 실변경을 낸다.
const THIRD_CONTENT = ADDED_CARD_CONTENT.replace(
  '{ label: "New Metric", value: 0 }',
  '{ label: "Weekly Active Users", value: 0 }',
);

function payload(newContent: string, explanation: string): string {
  return JSON.stringify({
    uiPatches: [{ artifactId: "dashboard-main", newContent, explanation }],
  });
}

export function createDashboardScriptProvider(): ModelProvider {
  return {
    name: "dashboard-scripted",
    async complete(request: ModelRequest): Promise<string> {
      if (request.system.includes("planner")) {
        return request.user.includes("PRIOR PROPOSAL")
          ? "1. Rename the newly added metric card's label. [[refine]]"
          : "1. Add a new metric card to the dashboard. [[initial]]";
      }
      // generator call — the plan (with its marker) is echoed in the prompt
      if (request.user.includes("[[refine]]")) {
        // Base-aware determinism: the generate prompt echoes ARTIFACTS, so
        // "already renamed once" is detectable without any hidden state.
        if (request.user.includes('"Active Users"')) {
          return payload(THIRD_CONTENT, "Rename the card's label to Weekly Active Users.");
        }
        return payload(REFINED_CONTENT, "Rename the added card's label to Active Users.");
      }
      return payload(ADDED_CARD_CONTENT, "Add a new metric card to the dashboard.");
    },
  };
}
