/**
 * ops-console 전시물 — **규모 축**.
 *
 * 앞선 다섯과 다른 점은 도메인이 아니라 크기다. 단일 아티팩트를 유지한 채 규모만
 * 올린다 — 다중 아티팩트는 이 전시물의 산출이 그 필요를 말한 뒤의 별건이다.
 *
 * 여기서 재는 것: diff 최소성 · 롤백 바이트 일치가 규모에서도 유지되는가, 그리고
 * **판정 하한들이 규모에서 여전히 변별하는가**. 뒤엣것이 이 전시물이 세워진 이유다.
 */

import type { ExhibitDefinition } from "../../host/exhibit-schema.ts";
import { createOpsConsoleKnowledge } from "./knowledge.ts";
import { createOpsConsoleScriptProvider } from "./scripted.ts";
import {
  MOCK_DEPLOYS,
  MOCK_INCIDENTS,
  MOCK_SERVICES,
  MOCK_SUMMARY,
  SEED_CONTENT,
  SEED_DATA,
  SEED_SCHEMA,
} from "./seed.ts";

const exhibit: ExhibitDefinition = {
  meta: {
    name: "ops-console",
    title: "운영 콘솔",
    description: "규모가 무대에 서는 전시물 — 요약 카드 다섯·표 셋·소유자 롤업·필터와 정렬을 단일 아티팩트가 그린다",
    domain: "ops-console",
  },
  target: "ops-console",
  artifacts: { "ops-console-main": SEED_CONTENT },
  primaryArtifactId: "ops-console-main",
  schema: SEED_SCHEMA,
  data: SEED_DATA,
  capabilities: [
    {
      descriptor: { name: "ops.summary", description: "in-memory mock counts for the summary cards" },
      handler: async () => MOCK_SUMMARY,
    },
    {
      descriptor: { name: "ops.services", description: "in-memory mock rows — the service inventory" },
      handler: async () => MOCK_SERVICES,
    },
    {
      descriptor: { name: "ops.incidents", description: "in-memory mock rows — recorded incidents" },
      handler: async () => MOCK_INCIDENTS,
    },
    {
      descriptor: { name: "ops.deploys", description: "in-memory mock rows — deploy history" },
      handler: async () => MOCK_DEPLOYS,
    },
  ],
  render: {
    // 넷을 **전부** 선언한다. 하나만 선언하면 나머지 셋이 죽어도 통과하고, 그 사각은
    // capability 수에 비례해 커진다 — 규모 축이 만드는 대가 중 하나다.
    expectInvokes: ["ops.summary", "ops.services", "ops.incidents", "ops.deploys"],
    // 네 응답이 각각 닿는 자리를 따로 센다. 한 응답이 죽으면 그 자리 하나가 비고,
    // 나머지 셋이 화면 총량을 그대로 채운다.
    expectFilled: [
      { selector: ".ops-card-value", placeholder: "—" },
      { selector: ".ops-services .ops-cell-name", placeholder: "—" },
      { selector: ".ops-incidents .ops-cell-summary", placeholder: "—" },
      { selector: ".ops-deploys .ops-cell-version", placeholder: "—" },
      { selector: ".ops-owner-count" },
    ],
    // 필터와 정렬 헤더 — 마운트 시점에는 죽은 것과 산 것이 구별되지 않는다.
    //
    // 기대 문자열은 **변경 뒤에만 나타나는 것**이라야 한다. 정렬 표식은 눌린 열로
    // 옮겨 가므로 그 조건을 만족한다. 필터는 그렇지 않다 — 티어를 좁혀도 남는 행의
    // 텍스트는 전부 좁히기 전에도 있던 것이라, 선언 어휘로는 *무엇이 사라져야
    // 하는가*를 말할 수 없다. 그 판정은 게이트가 텍스트 총량 변화로 한다.
    interactions: [
      { selector: ".ops-tier-filter", event: "change", setValue: "tier-1" },
      { selector: ".ops-deploys .ops-head-version", event: "click", expectText: "Version ▾" },
    ],
  },
  createKnowledge: () => [createOpsConsoleKnowledge()],
  createScriptedProvider: () => createOpsConsoleScriptProvider(),
};

export default exhibit;
