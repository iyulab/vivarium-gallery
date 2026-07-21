/**
 * landing-page 전시물의 결정적 mock 카피 (UI-only 원칙 — samples/README.md
 * 규율 2). `landing.content` capability 로만 노출되고, 모델 프롬프트에는
 * knowledge.ts 가 SHAPE 만 기술한다 (dashboard의 data.ts와 동일 분리).
 */

export const LANDING_CONTENT = {
  name: "Lumen Notes",
  tagline: "Capture ideas the moment they spark — organized for you, automatically.",
  features: [
    { id: "capture", title: "Instant Capture", body: "One keystroke from anywhere. Your thought is saved before it fades." },
    { id: "organize", title: "Auto Organize", body: "Notes cluster themselves by topic — no folders to maintain." },
    { id: "recall", title: "Total Recall", body: "Search by meaning, not keywords. Find the note you half-remember." },
  ],
  cta: "Start Free Trial",
};
