/**
 * 렌더 검증 (cycle-85 갭 후속 — FRICTION-20260719-wrong-capability-contract-
 * renders-empty): validated changeset 이라도 기능적으로 파손된 렌더(빈
 * 대시보드 등)를 apply 전후에 감지한다. 스키마 게이트가 못 보는 층위의
 * 앱-측 최소 판정.
 *
 * jsdom 으로 아티팩트 mount(root, api) 를 실제 실행하고 판정한다:
 *   1. 무예외 실행
 *   2. root 에 자식이 생겼는가 + 텍스트 총량 최소치
 *   3. (핵심) **기대 capability 가 실제 invoke 됐는가** — cycle-85 사례
 *      (dataset 대신 legacy metrics 호출 → 전 필드 undefined → 빈 렌더)를
 *      정확히 잡는 검사. api 는 exhibit 의 실제 handler 결과를 공급하며
 *      호출 이름을 기록한다.
 *
 * jsdom 은 devDependency (레지스트리 설치 — @vivariumjs 소비 규율과 무관한
 * 호스트 도구 의존). 판정 실패는 예외가 아니라 record 반환 — 드라이버의
 * 비중단 기록 문법(D82-1)과 동일.
 */

import { JSDOM } from "jsdom";
import type { ExhibitCapability } from "../exhibit-schema.ts";

export interface RenderCheckOptions {
  /** 이 이름들이 전부 invoke 되어야 통과 (예: ["dashboard.dataset"]). */
  expectInvokes?: string[];
  /** root.textContent 최소 길이 (기본 20). */
  minTextLength?: number;
  /** mount 완료 대기 한도 ms (기본 5000). */
  timeoutMs?: number;
}

export interface RenderCheckRecord {
  ok: boolean;
  errors: string[];
  invoked: string[];
  childCount: number;
  textLength: number;
}

export async function checkRender(
  artifactSource: string,
  capabilities: ExhibitCapability[],
  options: RenderCheckOptions = {},
): Promise<RenderCheckRecord> {
  const errors: string[] = [];
  const invoked: string[] = [];
  const minTextLength = options.minTextLength ?? 20;
  const handlers = new Map(capabilities.map((c) => [c.descriptor.name, c.handler]));

  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    runScripts: "outside-only",
  });
  const root = dom.window.document.getElementById("root")!;
  const api = {
    async invoke(name: string, payload: unknown): Promise<unknown> {
      invoked.push(name);
      const handler = handlers.get(name);
      if (!handler) throw new Error(`capability not granted: ${name}`);
      return handler(payload);
    },
  };

  // mount 는 document/window 전역을 참조하는 plain-JS 모듈 — jsdom 전역을
  // 일시 주입해 실행한다 (Node 프로세스 전역 오염은 실행 구간에 한정).
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, window: g.window, HTMLElement: g.HTMLElement, Node: g.Node };
  g.document = dom.window.document;
  g.window = dom.window;
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  try {
    const url = "data:text/javascript," + encodeURIComponent(artifactSource);
    const mod = await import(url);
    if (typeof mod.default !== "function") {
      errors.push("artifact has no default mount function");
    } else {
      await Promise.race([
        mod.default(root, api),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("mount timed out")), options.timeoutMs ?? 5000),
        ),
      ]);
    }
  } catch (err) {
    errors.push(`mount threw: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    g.document = saved.document;
    g.window = saved.window;
    g.HTMLElement = saved.HTMLElement;
    g.Node = saved.Node;
  }

  const childCount = root.children.length;
  const textLength = (root.textContent ?? "").trim().length;
  if (errors.length === 0) {
    if (childCount === 0) errors.push("root has no children after mount");
    if (textLength < minTextLength) {
      errors.push(`rendered text too short: ${textLength} < ${minTextLength}`);
    }
    for (const name of options.expectInvokes ?? []) {
      if (!invoked.includes(name)) {
        errors.push(`expected capability not invoked: ${name} (invoked: ${invoked.join(", ") || "none"})`);
      }
    }
  }

  return { ok: errors.length === 0, errors, invoked, childCount, textLength };
}
