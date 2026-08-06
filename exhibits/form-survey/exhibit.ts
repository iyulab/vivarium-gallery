/**
 * form-survey 전시물 — 도메인 축 신규 #3 (설계 §2 1차 범위).
 *
 * 제품 피드백 설문 폼: 질문 카드(척도/서술) + 제출. 질문 목록은 아티팩트
 * 소유 (widget-list 교훈), `survey.submit` capability 는 in-memory 제출
 * mock (UI-only 원칙 — 규율 2). 시드 본문은 seed.ts (scripted.ts 와 단일
 * 출처 공유).
 */

import type { ExhibitDefinition } from "../../host/exhibit-schema.ts";
import { createSurveyKnowledge } from "./knowledge.ts";
import { createSurveyScriptProvider } from "./scripted.ts";
import { SEED_CONTENT } from "./seed.ts";

const exhibit: ExhibitDefinition = {
  meta: {
    name: "form-survey",
    title: "제품 피드백 설문",
    description: "질문 카드·제출 흐름을 갖춘 설문 폼을 채팅으로 변형하는 전시물",
    domain: "form-survey",
  },
  target: "form-survey",
  artifacts: { "survey-main": SEED_CONTENT },
  primaryArtifactId: "survey-main",
  capabilities: [
    {
      descriptor: { name: "survey.submit", description: "in-memory mock submission — returns { accepted: true }" },
      handler: async () => ({ accepted: true }),
    },
  ],
  render: {
    "survey-main": {
      // 마운트 중에 부르는 capability 가 없다 — 이 전시물의 capability 는 제출에만 쓰인다.
      // 그래서 마운트 시점 판정만으로는 죽은 폼과 산 폼이 구별되지 않고, 아래 상호작용이
      // 그것을 가른다.
      expectInvokes: [],
      // 질문 라벨과 제출 버튼. 상태 문단(`p`)은 **마운트 시점에 비어 있는 것이 정상**
      // 이므로 자리로 세지 않는다 — 그것까지 세면 시드가 자기 게이트에 떨어진다.
      expectFilled: [{ selector: "section label" }, { selector: "button" }],
      interactions: [
        { selector: "form", event: "submit", expectInvokes: ["survey.submit"], expectText: "Thanks" },
      ],
    },
  },
  createKnowledge: () => [createSurveyKnowledge()],
  createScriptedProvider: () => createSurveyScriptProvider(),
};

export default exhibit;
