/**
 * inventory 전시물 — 도메인 축 신규 #4, 그리고 갤러리 최초의 **3-facet 전시물**.
 *
 * 재고 품목 표: 스키마(`Item`)·데이터(행)·UI(표의 열)가 한 화면에 함께 있다.
 * 기존 전시물 3종은 전부 UI 단일 facet 이라, "필드 추가는 스키마+데이터+UI 가
 * 함께여야 올바른 변경"이라는 중심 명제가 공개 표면에서 증명된 적이 없었다.
 * 이 전시물의 존재 이유가 그 증명이다 — scenario.md 참조.
 */

import type { ExhibitDefinition } from "../../host/exhibit-schema.ts";
import { createInventoryKnowledge } from "./knowledge.ts";
import { createInventoryScriptProvider } from "./scripted.ts";
import { MOCK_ROWS, SEED_CONTENT, SEED_DATA, SEED_SCHEMA } from "./seed.ts";

const exhibit: ExhibitDefinition = {
  meta: {
    name: "inventory",
    title: "재고 품목 표",
    description: "스키마·데이터·UI 세 facet 이 한 번의 승인으로 함께 움직이는 전시물",
    domain: "inventory",
  },
  target: "inventory",
  artifacts: { "inventory-main": SEED_CONTENT },
  primaryArtifactId: "inventory-main",
  schema: SEED_SCHEMA,
  data: SEED_DATA,
  capabilities: [
    {
      descriptor: {
        name: "inventory.list",
        description: "in-memory mock rows — returns the seeded item list",
      },
      handler: async () => MOCK_ROWS,
    },
  ],
  render: {
    "inventory-main": {
      expectInvokes: ["inventory.list"],
      // 표의 **모든 데이터 셀**. 헤더는 `th` 라 여기 걸리지 않는다 — 헤더는 데이터가
      // 사라져도 차 있으므로 그것을 자리로 세면 초록만 넓어진다.
      expectFilled: [{ selector: "td", placeholder: "—" }],
    },
  },
  createKnowledge: () => [createInventoryKnowledge()],
  createScriptedProvider: () => createInventoryScriptProvider(),
};

export default exhibit;
