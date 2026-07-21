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

export interface ExhibitDefinition {
  meta: ExhibitMeta;
  /** stage target 식별자. */
  target: string;
  /** 시드 아티팩트 — artifactId → plain-JS mount 모듈 소스. */
  artifacts: Record<string, string>;
  /** 캔버스·프리뷰가 렌더하는 아티팩트 (현 호스트는 단일-아티팩트 렌더). */
  primaryArtifactId: string;
  /** 브라우저 샌드박스에 grant 되는 capability 목록 (mock 데이터 — 규율 2). */
  capabilities: ExhibitCapability[];
  /** 서버 측 knowledge 포트 (선택). */
  createKnowledge?: () => KnowledgeSource[];
  /** 결정적 스모크용 scripted provider (서버 측, 선택). */
  createScriptedProvider?: () => ModelProvider;
}
