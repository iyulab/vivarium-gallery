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
 *   4. **비어서는 안 되는 자리** — 2의 텍스트 하한은 화면 **전체**를 합산하므로,
 *      표의 열 하나가 통째로 비어도 나머지가 하한을 넘기면 통과한다. 실모델 run
 *      하나가 정확히 그 상태를 만들었다: 스키마를 개명하면서 데이터를 두고 가자
 *      이름 칸이 세 행 모두 빈 칸 표기가 됐고, 모든 게이트가 초록이었다. 총량으로는
 *      잡을 수 없으므로 전시물이 **자리**를 선언하고 여기서 그것을 읽는다.
 *   5. **마운트 이후** — 선언된 상호작용을 실제로 보내고 그 결과를 판정한다.
 *      1~3 은 전부 마운트 시점의 성질이라, 화면은 그려지지만 누르면 아무
 *      일도 일어나지 않는 UI 가 전부 통과한다. 제출 리스너 이름이 틀린
 *      아티팩트와 정상 아티팩트는 마운트 시점 값이 **완전히 동일하다**
 *      (`ok=true children=1 text=104 invoked=[] errors=[]`). 이벤트를 하나
 *      보내면 즉시 갈린다.
 *
 * jsdom 은 devDependency (레지스트리 설치 — @vivariumjs 소비 규율과 무관한
 * 호스트 도구 의존). 판정 실패는 예외가 아니라 record 반환 — 드라이버의
 * 비중단 기록 문법(D82-1)과 동일.
 */

import { JSDOM } from "jsdom";
import type {
  ExhibitCapability,
  ExhibitRenderExpectations,
  FilledExpectation,
  InteractionStep,
} from "../exhibit-schema.ts";

// 선언의 형태는 **전시물 계약**에 산다 — 무엇이 차 있어야 하고 무엇을 눌러야 하는지는
// 전시물만 알기 때문이다. 판정 도구는 그것을 소비할 뿐이다. 여기서 재수출하는 것은
// 기존 import 경로를 깨지 않기 위해서다.
export type { FilledExpectation, InteractionStep };

export interface RenderCheckOptions extends ExhibitRenderExpectations {
  /** mount 완료 대기 한도 ms (기본 5000). */
  timeoutMs?: number;
}

export interface InteractionRecord {
  selector: string;
  event: string;
  /** 이 단계에서 **새로** invoke 된 capability 이름. */
  invoked: string[];
  /** 단계 직후 root 텍스트 길이 — 무반응 UI 는 마운트 시점과 같다. */
  textLength: number;
  errors: string[];
}

export interface FilledRecord {
  selector: string;
  /** 매치된 요소 수. */
  total: number;
  /** 그중 비어 있던 수 (빈 문자열 또는 선언된 빈 칸 표기). */
  blank: number;
}

export interface RenderCheckRecord {
  ok: boolean;
  errors: string[];
  invoked: string[];
  childCount: number;
  textLength: number;
  /** 선언된 자리가 없으면 빈 배열 — 총량만 판정했다는 뜻이다. */
  filled: FilledRecord[];
  /** 선언된 상호작용이 없으면 빈 배열 — 마운트 판정만 돌았다는 뜻이다. */
  interactions: InteractionRecord[];
}

export async function checkRender(
  artifactSource: string,
  capabilities: ExhibitCapability[],
  options: RenderCheckOptions = {},
): Promise<RenderCheckRecord> {
  const errors: string[] = [];
  const invoked: string[] = [];
  const interactions: InteractionRecord[] = [];
  const filled: FilledRecord[] = [];
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
  // 상호작용 단계도 같은 전역 아래에서 돌아야 한다 — 이벤트 handler 는
  // mount 본문보다 넓은 표면(FormData·Event 등)을 쓴다.
  const g = globalThis as Record<string, unknown>;
  const injected = ["document", "window", "HTMLElement", "Node", "Event", "CustomEvent", "FormData"] as const;
  const saved: Record<string, unknown> = {};
  for (const key of injected) {
    saved[key] = g[key];
    g[key] = (dom.window as unknown as Record<string, unknown>)[key];
  }

  // 아티팩트의 async 이벤트 handler 가 거부되면 그 거부에는 핸들러가 없다
  // (dispatchEvent 는 promise 를 돌려주지 않는다). 잡아 두지 않으면 프로세스
  // 경고로만 흘러가 게이트가 못 본다 — 실제로 capability 이름이 틀린
  // 아티팩트가 정확히 이 경로로 조용해진다.
  const rejections: string[] = [];
  const onRejection = (reason: unknown): void => {
    rejections.push(reason instanceof Error ? reason.message : String(reason));
  };
  process.on("unhandledRejection", onRejection);

  let childCount = 0;
  let textLength = 0;

  try {
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
    }

    childCount = root.children.length;
    textLength = (root.textContent ?? "").trim().length;
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

      // 총량이 아니라 **자리**를 본다. 위 텍스트 하한은 화면 전체를 합산하므로
      // 열 하나가 통째로 비어도 나머지가 하한을 넘기면 통과한다.
      for (const want of options.expectFilled ?? []) {
        const nodes = Array.from(root.querySelectorAll(want.selector));
        if (nodes.length === 0) {
          // 매치 0건을 통과로 두면 셀렉터가 낡는 순간 판정이 조용히 사라진다.
          errors.push(`expectFilled matched nothing: ${want.selector}`);
          filled.push({ selector: want.selector, total: 0, blank: 0 });
          continue;
        }
        const blank = nodes.filter((node) => {
          const text = (node.textContent ?? "").trim();
          return text === "" || (want.placeholder !== undefined && text === want.placeholder);
        });
        filled.push({ selector: want.selector, total: nodes.length, blank: blank.length });
        if (blank.length > 0) {
          errors.push(
            `region rendered empty: ${blank.length}/${nodes.length} matching ${want.selector} are blank` +
              (want.placeholder === undefined ? "" : ` or ${JSON.stringify(want.placeholder)}`),
          );
        }
      }
    }

    // ── 마운트 이후 ───────────────────────────────────────────────────────
    // 마운트가 이미 깨졌으면 상호작용은 판정 대상이 아니다 — 돌려도 같은
    // 결함을 두 번째 이유로 다시 보고할 뿐이다.
    if (errors.length === 0) {
      for (const step of options.interactions ?? []) {
        const eventName = step.event ?? "click";
        const stepErrors: string[] = [];
        const invokedBefore = invoked.length;
        const rejectionsBefore = rejections.length;

        const target = root.querySelector(step.selector);
        if (!target) {
          stepErrors.push(`no element matches selector: ${step.selector}`);
        } else {
          if (step.setValue !== undefined) {
            // 값을 둘 수 없으면 기본값 그대로의 이벤트가 되고, 그것은 산 화면과 죽은
            // 화면에서 똑같이 아무것도 바꾸지 않는다 — 통과하되 구별하지 않는 판정.
            const valued = target as unknown as { value?: unknown };
            if (!("value" in valued)) {
              stepErrors.push(`setValue given but element has no value: ${step.selector}`);
            } else {
              valued.value = step.setValue;
              if (String(valued.value) !== step.setValue) {
                // select 는 없는 옵션을 받으면 조용히 빈 값이 된다. 그 상태로 계속
                // 가면 "필터가 죽었다"와 "선언이 낡았다"가 같은 실패로 보인다.
                stepErrors.push(
                  `setValue did not take on ${step.selector}: wanted ${JSON.stringify(step.setValue)}, ` +
                    `got ${JSON.stringify(String(valued.value))}`,
                );
              }
            }
          }
          try {
            target.dispatchEvent(new dom.window.Event(eventName, { bubbles: true, cancelable: true }));
          } catch (err) {
            stepErrors.push(`dispatch threw: ${err instanceof Error ? err.message : String(err)}`);
          }
          await new Promise((resolve) => setTimeout(resolve, step.settleMs ?? 200));
        }

        const stepInvoked = invoked.slice(invokedBefore);
        const stepText = (root.textContent ?? "").trim();
        for (const name of step.expectInvokes ?? []) {
          if (!stepInvoked.includes(name)) {
            stepErrors.push(
              `expected capability not invoked by ${eventName} on ${step.selector}: ${name} ` +
                `(invoked: ${stepInvoked.join(", ") || "none"})`,
            );
          }
        }
        if (step.expectText !== undefined && !stepText.includes(step.expectText)) {
          stepErrors.push(
            `expected text absent after ${eventName} on ${step.selector}: ${JSON.stringify(step.expectText)}`,
          );
        }
        for (const reason of rejections.slice(rejectionsBefore)) {
          stepErrors.push(`unhandled rejection during ${eventName} on ${step.selector}: ${reason}`);
        }

        interactions.push({
          selector: step.selector,
          event: eventName,
          invoked: stepInvoked,
          textLength: stepText.length,
          errors: stepErrors,
        });
        errors.push(...stepErrors);
      }
    }
  } finally {
    // 주입한 전역과 프로세스 리스너는 어떤 경로로 빠져나가든 되돌린다 —
    // 판정 도구가 자기 실행 환경을 남겨 두면 다음 판정이 그 위에서 돈다.
    process.off("unhandledRejection", onRejection);
    for (const key of injected) g[key] = saved[key];
  }

  return { ok: errors.length === 0, errors, invoked, childCount, textLength, filled, interactions };
}
