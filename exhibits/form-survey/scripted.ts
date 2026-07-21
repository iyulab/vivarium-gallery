/**
 * form-survey 결정적 scripted provider — 시드 단일 출처(seed.ts)에서 문자열
 * 치환으로 파생 (본문 중복 없음). planner/generator 프로토콜은 dashboard/
 * scripted.ts 와 동일 ([[marker]] 에코).
 *
 *   turn 1 (initial): NPS 추천 의향 질문(scale) 추가
 *   turn 2+ (refine): 추가한 질문의 라벨을 짧게 교체
 */

import type { ModelProvider, ModelRequest } from "@vivariumjs/agent";
import { SEED_CONTENT } from "./seed.ts";

const ADDED_QUESTION = SEED_CONTENT.replace(
  `    { id: "q2", label: "What should we improve first?", type: "text", required: false },`,
  `    { id: "q2", label: "What should we improve first?", type: "text", required: false },
    { id: "q3", label: "How likely are you to recommend us?", type: "scale", required: true },`,
);

const REFINED = ADDED_QUESTION.replace(
  '{ id: "q3", label: "How likely are you to recommend us?", type: "scale", required: true }',
  '{ id: "q3", label: "Would you recommend us?", type: "scale", required: true }',
);

function payload(newContent: string, explanation: string): string {
  return JSON.stringify({
    uiPatches: [{ artifactId: "survey-main", newContent, explanation }],
  });
}

export function createSurveyScriptProvider(): ModelProvider {
  return {
    name: "survey-scripted",
    async complete(request: ModelRequest): Promise<string> {
      if (request.system.includes("planner")) {
        return request.user.includes("PRIOR PROPOSAL")
          ? "1. Shorten the recommendation question's label. [[refine]]"
          : "1. Add an NPS-style recommendation question. [[initial]]";
      }
      if (request.user.includes("[[refine]]")) {
        return payload(REFINED, "Shorten the added question's label.");
      }
      return payload(ADDED_QUESTION, "Add a required recommendation (NPS) scale question.");
    },
  };
}
