/**
 * form-survey 전시물의 KnowledgeSource — capability SHAPE + 하우스 규칙.
 */

import type { KnowledgeSource } from "@vivariumjs/agent";

const DATA_CATALOG = `DATA CATALOG — capabilities granted to this survey sandbox.

1. api.invoke("survey.submit", { answers: Record<string,string> })
   → { accepted: boolean } — in-memory mock; call it ONLY from the form's
   submit handler. Never fabricate a response or skip the invoke.`;

const DESIGN_SYSTEM = `DESIGN SYSTEM — house rules for this survey form's generated UI.

Language
- ALL form copy (title, question labels, button text, status messages) is in
  English by default; an explicit localization instruction changes ONLY the
  user-visible copy, never ids/names/types.

Structure
- The artifact owns the question list (count/order/labels/required). A
  required question renders its label with a trailing " *". Question ids
  (q1, q2, …) are stable — relabeling never changes ids.

Style
- Inline styles, system-ui sans. Ink #1d2129, borders #dde1e8 (cards) /
  #c8cdd6 (inputs), accent #2a5bd7, success text #3c7a3c. Cards radius 10px
  padding 16px; single column, max width 640px, 16px gaps.

Safety
- Build DOM nodes and use textContent for any data-derived string.
  No innerHTML with interpolated data.`;

export function createSurveyKnowledge(): KnowledgeSource {
  return {
    name: "form-survey-catalog",
    async retrieve() {
      return [DATA_CATALOG, DESIGN_SYSTEM];
    },
  };
}
