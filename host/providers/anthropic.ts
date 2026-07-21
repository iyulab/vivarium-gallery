/**
 * Real ModelProvider backed by the Anthropic Messages API (raw fetch —
 * this sample stays registry-only/zero-dep, so no SDK dependency).
 *
 * Reproduces integration/e2e-demo/real-provider.ts's shape as a sample-local
 * file: the harness (ProposalSession / validate-retry loop) cannot tell this
 * apart from the scripted provider — everything it guarantees (validation
 * gate, retry loop, lineage) is enforced by the harness, not by model
 * behavior. `ModelProvider`/`ModelRequest` are imported type-only from the
 * published `@vivariumjs/agent` package — never from submodule sources
 * (samples/README.md 규율 1: 레지스트리 패키지만 소비).
 *
 * Credentials come from the environment (ANTHROPIC_API_KEY) — the harness
 * never owns credentials or transports (agent ports contract).
 */

import type { ModelProvider, ModelRequest } from "@vivariumjs/agent";

export interface AnthropicProviderOptions {
  /** Model ID. Default: claude-opus-4-8. */
  model?: string;
  /** API key. Default: process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Hard cap on output tokens per call (thinking + text). */
  maxTokens?: number;
  /** Per-call wall-clock timeout in milliseconds. */
  timeoutMs?: number;
  /**
   * Called with the API-reported token usage of each successful call
   * (Phase 6.e turn-cost instrumentation). Optional — the provider works
   * identically without it.
   */
  onUsage?(usage: { inputTokens: number; outputTokens: number }): void;
}

export function createAnthropicProvider(options: AnthropicProviderOptions = {}): ModelProvider {
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const maxTokens = options.maxTokens ?? 16000;
  const timeoutMs = options.timeoutMs ?? 300_000;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — run the server with `node --env-file=.env.local ...` or export the key",
    );
  }

  return {
    name: `anthropic:${model}`,
    async complete(request: ModelRequest): Promise<string> {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          thinking: { type: "adaptive" },
          system: request.system,
          messages: [{ role: "user", content: request.user }],
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`anthropic api ${response.status}: ${body.slice(0, 500)}`);
      }
      const message = (await response.json()) as {
        stop_reason: string;
        content: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      if (message.usage) {
        options.onUsage?.({
          inputTokens: message.usage.input_tokens ?? 0,
          outputTokens: message.usage.output_tokens ?? 0,
        });
      }
      if (message.stop_reason === "refusal") {
        // Surfaced as a provider error; the harness validate-retry loop
        // treats it like any other unusable output (changeset or nothing).
        throw new Error("anthropic api refused the request (stop_reason: refusal)");
      }
      return message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
    },
  };
}
