/**
 * contacts 전시물 — **파괴성 축**.
 *
 * 다른 넷과 다른 점은 도메인이 아니라 **연산**이다. 갤러리가 지금까지 시험한 스키마
 * 연산은 `field.add` 하나, 데이터 연산은 `update` 하나였다 — 즉 *"변경은 검토 가능하고
 * 되돌릴 수 있다"* 가 **가장 안전한 연산에서만** 증명돼 있었다. 이 전시물의 턴은
 * 지우고·바꾸고·기존 데이터를 위반한다. 성공의 형태가 턴마다 다른 것이 요점이다:
 * 어떤 턴은 적용되고 롤백이 손실을 되돌려야 성공이고, 어떤 턴은 **거부되는 것이**
 * 성공이며, 어떤 턴은 통과하되 **기록에 남아야** 성공이다. scenario.md 참조.
 */

import type { ExhibitDefinition } from "../../host/exhibit-schema.ts";
import { createContactsKnowledge } from "./knowledge.ts";
import { createContactsScriptProvider } from "./scripted.ts";
import { MOCK_ROWS, SEED_CONTENT, SEED_DATA, SEED_SCHEMA } from "./seed.ts";

const exhibit: ExhibitDefinition = {
  meta: {
    name: "contacts",
    title: "연락처 디렉터리",
    description: "지우는 변경이 무대에 서는 전시물 — 되돌릴 수 있는 파괴·거부가 정답인 턴·미선언 영역",
    domain: "contacts",
  },
  target: "contacts",
  artifacts: { "contacts-main": SEED_CONTENT },
  primaryArtifactId: "contacts-main",
  schema: SEED_SCHEMA,
  data: SEED_DATA,
  capabilities: [
    {
      descriptor: {
        name: "contacts.list",
        description: "in-memory mock rows — returns the seeded contact list",
      },
      handler: async () => MOCK_ROWS,
    },
  ],
  render: {
    "contacts-main": {
      expectInvokes: ["contacts.list"],
      // 표의 모든 데이터 셀. 개명 run 하나가 이름 열만 비웠고 나머지 두 열이 총량을
      // 채워 모든 게이트가 초록이었다 — 그래서 열 하나가 아니라 셀 전체를 자리로 센다.
      expectFilled: [{ selector: "td", placeholder: "—" }],
    },
  },
  createKnowledge: () => [createContactsKnowledge()],
  createScriptedProvider: () => createContactsScriptProvider(),
};

export default exhibit;
