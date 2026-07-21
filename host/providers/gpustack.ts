/**
 * Real ModelProvider backed by a GPUStack (OpenAI-compatible) endpoint —
 * 모델/조건 다양화 축(설계 §2)의 로컬 모델 provider. anthropic.ts와 동일한
 * 형태(raw fetch, 자격증명은 환경에서만, onUsage 콜백)를 유지한다.
 *
 * 2026-07-19 벤치 실증: qwen3.6-35b-a3b로 agent 하니스 2턴(A/build 122.5s,
 * B/surgical 249.9s) 모두 첫 시도 validated — 이 파일은 그 벤치 스크립트의
 * provider를 host 표면으로 승격한 것.
 *
 * qwen3 계열 <think> 블록 제거는 여기(프로바이더)에서 수행한다 — transport/
 * format 정규화는 provider 소관이고 하니스는 관여하지 않는다.
 */

import type { ModelProvider, ModelRequest } from "@vivariumjs/agent";

export interface GpustackProviderOptions {
  /** Endpoint base URL. Default: process.env.GPUSTACK_ENDPOINT. */
  endpoint?: string;
  /** Model ID. Default: process.env.GPUSTACK_MODEL. */
  model?: string;
  /** API key. Default: process.env.GPUSTACK_API_KEY. */
  apiKey?: string;
  /** Hard cap on output tokens per call. */
  maxTokens?: number;
  /** Per-call wall-clock timeout in milliseconds (로컬 모델은 느릴 수 있음). */
  timeoutMs?: number;
  /** Called with the API-reported token usage of each successful call. */
  onUsage?(usage: { inputTokens: number; outputTokens: number }): void;
}

export function createGpustackProvider(options: GpustackProviderOptions = {}): ModelProvider {
  const endpoint = options.endpoint ?? process.env.GPUSTACK_ENDPOINT;
  const model = options.model ?? process.env.GPUSTACK_MODEL;
  const apiKey = options.apiKey ?? process.env.GPUSTACK_API_KEY;
  const maxTokens = options.maxTokens ?? 16000;
  const timeoutMs = options.timeoutMs ?? 600_000;
  if (!endpoint || !model || !apiKey) {
    throw new Error(
      "GPUSTACK_ENDPOINT / GPUSTACK_MODEL / GPUSTACK_API_KEY not set — run with `node --env-file=.env.local ...`",
    );
  }

  return {
    name: `gpustack:${model}`,
    async complete(request: ModelRequest): Promise<string> {
      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`gpustack api ${response.status}: ${body.slice(0, 500)}`);
      }
      const message = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      if (message.usage) {
        options.onUsage?.({
          inputTokens: message.usage.prompt_tokens ?? 0,
          outputTokens: message.usage.completion_tokens ?? 0,
        });
      }
      const text = message.choices?.[0]?.message?.content ?? "";
      // qwen3-family thinking normalization (provider owns format concerns).
      return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    },
  };
}
