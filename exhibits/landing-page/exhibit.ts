/**
 * landing-page 전시물 — 도메인 축 신규 #2 (설계 §2 1차 범위).
 *
 * 제품 랜딩 페이지: 히어로·기능 그리드·CTA. 섹션 목록은 아티팩트 소유
 * (dashboard의 widget-list 교훈 일반화 — FRICTION-20260717-seed-capability-
 * binds-widget-count): capability 는 카피/데이터만 공급하고, 구조(섹션
 * 수·순서)는 아티팩트가 소유해 순수 의도 지시("섹션 추가/순서 변경")가
 * 자연스러운 편집 경로를 갖는다. 시드 본문은 seed.ts (scripted.ts 와
 * 단일 출처 공유).
 */

import type { ExhibitDefinition } from "../../host/exhibit-schema.ts";
import { LANDING_CONTENT } from "./content.ts";
import { createLandingKnowledge } from "./knowledge.ts";
import { createLandingScriptProvider } from "./scripted.ts";
import { SEED_CONTENT } from "./seed.ts";

const exhibit: ExhibitDefinition = {
  meta: {
    name: "landing-page",
    title: "제품 랜딩 페이지",
    description: "히어로·기능 그리드·CTA로 구성된 랜딩 페이지를 채팅으로 변형하는 전시물",
    domain: "landing-page",
  },
  target: "landing-page",
  artifacts: { "landing-main": SEED_CONTENT },
  primaryArtifactId: "landing-main",
  capabilities: [
    {
      descriptor: { name: "landing.content", description: "read-only mock product copy (name/tagline/features/cta)" },
      handler: async () => LANDING_CONTENT,
    },
  ],
  render: {
    "landing-main": {
      expectInvokes: ["landing.content"],
      // 이 전시물은 화면 전체가 카피다 — 제목·본문·CTA 가 전부 capability 응답에서
      // 온다. 그래서 자리 선언이 셋으로 갈린다: 응답의 어느 키가 빠지든 하나가 잡는다.
      expectFilled: [
        { selector: "section h1, section h3" },
        { selector: "section p" },
        { selector: "button" },
      ],
    },
  },
  createKnowledge: () => [createLandingKnowledge()],
  createScriptedProvider: () => createLandingScriptProvider(),
};

export default exhibit;
