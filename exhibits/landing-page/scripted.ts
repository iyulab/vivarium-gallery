/**
 * landing-page 결정적 scripted provider — MODEL_PROVIDER 미설정 시 기본
 * (브라우저 데모·게이트 사전조건의 결정성). dashboard/scripted.ts 와 같은
 * planner/generator 프로토콜([[marker]] 에코)을 따르되, 변형은 시드
 * 단일 출처(seed.ts)에서 문자열 치환으로 파생한다 — 본문 중복 없음.
 *
 *   turn 1 (initial): CTA 버튼 카피 교체 (surgical 성격의 최소 변형)
 *   turn 2+ (refine): 히어로 배경을 하우스 alt 배경에서 흰색으로 (theme 최소 변형)
 */

import type { ModelProvider, ModelRequest } from "@vivariumjs/agent";
import { SEED_CONTENT } from "./seed.ts";

const CTA_CHANGED = SEED_CONTENT.replace('b.textContent = content.cta;', 'b.textContent = "Get Started Today";');
const REFINED = CTA_CHANGED.replace("background:#f4f6fb", "background:#ffffff");

function payload(newContent: string, explanation: string): string {
  return JSON.stringify({
    uiPatches: [{ artifactId: "landing-main", newContent, explanation }],
  });
}

export function createLandingScriptProvider(): ModelProvider {
  return {
    name: "landing-scripted",
    async complete(request: ModelRequest): Promise<string> {
      if (request.system.includes("planner")) {
        return request.user.includes("PRIOR PROPOSAL")
          ? "1. Lighten the hero background to white. [[refine]]"
          : "1. Replace the CTA button copy. [[initial]]";
      }
      if (request.user.includes("[[refine]]")) {
        return payload(REFINED, "Lighten the hero background to plain white.");
      }
      return payload(CTA_CHANGED, "Replace the CTA copy with a stronger call to action.");
    },
  };
}
