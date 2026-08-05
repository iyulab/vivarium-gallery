/**
 * ExhibitDefinition — 갤러리 호스트와 전시물 사이의 유일한 계약.
 *
 * 전시물(exhibits/<name>/exhibit.ts)은 이 형태 하나를 default export 하고,
 * 호스트(server.ts·app.ts)는 이 계약만 본다. 새 전시물 추가 = 디렉터리
 * 추가이며 호스트는 변경되지 않는다.
 *
 * Isomorphic 제약: exhibit.ts는 서버(Node)와 브라우저 양쪽에서 import 된다.
 * 값 코드에는 Node 전용 API를 쓸 수 없다 — `@vivariumjs/*` 참조는 type-only
 * import 로만 (타입 스트리핑으로 소거되므로 브라우저 import map 에
 * `@vivariumjs/agent`가 없어도 동작한다).
 */

import type { KnowledgeSource, ModelProvider } from "@vivariumjs/agent";

export interface ExhibitMeta {
  /** 디렉터리 이름과 동일한 슬러그 (^[a-z0-9-]+$). */
  name: string;
  title: string;
  description: string;
  /** 도메인 축 라벨 (설계 §2) — 예: "dashboard", "landing-page". */
  domain: string;
}

export interface ExhibitCapability {
  descriptor: { name: string; description: string };
  handler: (input: unknown) => Promise<unknown>;
}

/**
 * **비어서는 안 되는 자리**의 선언.
 *
 * 마운트 판정(자식≥1 · 텍스트 하한)은 화면 **전체**의 총량을 본다. 그래서 표의
 * 열 하나가 통째로 비어도, 나머지 열의 텍스트가 하한을 넘기면 통과한다. 무엇이
 * 항상 차 있어야 하는지는 **전시물만 알고**, 그래서 선언은 전시물의 몫이다.
 */
export interface FilledExpectation {
  /** root 기준 `querySelectorAll`. 매치가 0건이면 그것 자체가 실패다. */
  selector: string;
  /**
   * 이 문자열만 담은 요소는 **비어 있는 것으로 센다** — 하우스 규칙이 빈 칸을
   * 표기로 채우면(예: "—") 텍스트 길이로는 빈 것과 찬 것이 구별되지 않는다.
   */
  placeholder?: string;
}

/** 마운트 **이후**를 판정하는 한 단계. */
export interface InteractionStep {
  /** 이벤트를 받을 요소 — root 기준 querySelector. */
  selector: string;
  /** 보낼 이벤트 이름 (기본 "click"). bubbles·cancelable 로 보낸다. */
  event?: string;
  /**
   * 이벤트를 보내기 **전에** 요소의 `value` 를 이 값으로 둔다.
   *
   * 선택 입력(select·input)은 값 없이 이벤트만 보내면 아무 일도 일어나지 않는다 —
   * 기본값 그대로의 `change` 는 산 화면과 죽은 화면에서 똑같이 아무것도 바꾸지 않고,
   * 그래서 그 판정은 통과하되 아무것도 구별하지 않는다. 값을 둘 수 없으면 선택
   * 입력으로 구동되는 화면은 **판정 대상 밖**이다.
   */
  setValue?: string;
  /** 이 단계에서 **새로** invoke 돼 있어야 할 capability. */
  expectInvokes?: string[];
  /** 이 단계 뒤 root 텍스트에 나타나야 할 문자열. */
  expectText?: string;
  /** 이벤트 처리 대기 ms (기본 200) — 비동기 handler 를 위한 여유. */
  settleMs?: number;
}

/**
 * 전시물이 **자기 시드가 옳게 그려진 모습**을 선언한다.
 *
 * 이 블록이 계약에 있는 이유: 이것이 없으면 게이트가 전시물 이름을 알아야 하고,
 * 그러면 이 파일 머리말의 불변식(*"새 전시물 추가 = 디렉터리 추가이며 호스트는
 * 변경되지 않는다"*)이 깨진다. 실제로 깨져 있었다 — 게이트 하나가 두 전시물의
 * 기대를 하드코딩하고 있었고, 자리를 가진 전시물을 더하려면 게이트를 고쳐야 했다.
 */
export interface ExhibitRenderExpectations {
  /** 시드가 마운트 중 반드시 invoke 하는 capability **전부**. */
  expectInvokes?: string[];
  /** 비어서는 안 되는 자리 — 매치된 요소가 하나라도 비면 실패. */
  expectFilled?: FilledExpectation[];
  /** 마운트 후 보낼 상호작용 (선언 순서대로). */
  interactions?: InteractionStep[];
  /**
   * root 텍스트 총량 하한. 생략하면 판정 도구의 기본(20)을 쓴다.
   * **화면이 커지면 이 값은 변별하지 못한다** — 총량은 열 하나가 통째로 비어도
   * 나머지가 하한을 넘기면 통과시키고, 그 여유는 화면 크기에 비례한다.
   */
  minTextLength?: number;
}

export interface ExhibitDefinition {
  meta: ExhibitMeta;
  /** stage target 식별자. */
  target: string;
  /** 시드 아티팩트 — artifactId → plain-JS mount 모듈 소스. */
  artifacts: Record<string, string>;
  /**
   * 시드 논리 스키마 (선택) — `{ entities: { <Entity>: { fields, constraints } } }`.
   * 생략하면 빈 스키마로 시드된다(UI 단일 facet 전시물의 기존 거동).
   */
  schema?: Record<string, unknown>;
  /**
   * 시드 데이터 (선택) — `{ <Entity>: [ row, … ] }`. 생략하면 빈 데이터.
   * schema·data 를 둘 다 시드하는 전시물이 3-facet 동반 변경의 무대가 된다.
   */
  data?: Record<string, unknown>;
  /** 캔버스·프리뷰가 렌더하는 아티팩트 (현 호스트는 단일-아티팩트 렌더). */
  primaryArtifactId: string;
  /** 브라우저 샌드박스에 grant 되는 capability 목록 (mock 데이터 — 규율 2). */
  capabilities: ExhibitCapability[];
  /** 시드가 옳게 그려진 모습의 선언 — 게이트가 전시물 이름 없이 판정하게 한다. */
  render?: ExhibitRenderExpectations;
  /** 서버 측 knowledge 포트 (선택). */
  createKnowledge?: () => KnowledgeSource[];
  /** 결정적 스모크용 scripted provider (서버 측, 선택). */
  createScriptedProvider?: () => ModelProvider;
}
