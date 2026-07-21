/**
 * landing-page 전시물의 KnowledgeSource — 데이터 카탈로그(capability SHAPE)
 * + 하우스 디자인 규칙. dashboard/knowledge.ts 와 같은 역할 분담: 값은
 * 렌더 시점 invoke, 모델은 형태만 안다.
 */

import type { KnowledgeSource } from "@vivariumjs/agent";
import { LANDING_CONTENT } from "./content.ts";

const DATA_CATALOG = () => `DATA CATALOG — capabilities granted to this landing-page sandbox.
Fetch copy ONLY via these invokes; never fabricate product claims.

1. api.invoke("landing.content", {}) → product copy:
${JSON.stringify({ ...LANDING_CONTENT, features: [LANDING_CONTENT.features[0], "…(3 features total)"] }, null, 1)}`;

const DESIGN_SYSTEM = `DESIGN SYSTEM — house rules for this landing page's generated UI.

Language
- ALL page copy is in English, regardless of the language of the user's
  instruction. The conversation language never leaks into UI text.

Structure
- The artifact owns the section list (order/presence). Section kinds render
  from the "builders" map — add a new kind by adding a builder AND appending
  its key to the sections array. Never fetch data outside api.invoke.

Style
- Inline styles only, system-ui sans. Page background #fff, ink #16181d,
  secondary #4c5464, accent #2a5bd7 (buttons/links), section alt background
  #f4f6fb. Border #e3e6ec, radius 8-10px. Max content width 960px, centered.
- Hero: 34px title, 17px tagline. Feature cards: 16px title, 14px body.

Safety
- Build DOM nodes and use textContent for any data-derived string.
  No innerHTML with interpolated data.`;

export function createLandingKnowledge(): KnowledgeSource {
  return {
    name: "landing-page-catalog",
    async retrieve() {
      return [DATA_CATALOG(), DESIGN_SYSTEM];
    },
  };
}
