/**
 * Turn-cost instrumentation (Phase 6.e — 상설 계측).
 *
 * Records, for every agent turn (/agent/session, /agent/refine), the cost
 * axes that the diff-profile promotion threshold will be judged against
 * (the changeset spec reserved a "verified diff" patch profile; promotion is
 * demand-driven and needs measurements, not impressions — the whole-artifact
 * turn-cost growth observed here was measurement #1):
 *
 *   - wall-clock latency of the whole turn
 *   - model provider calls within the turn (per-call latency, and token
 *     usage when the provider exposes it — the Anthropic adapter does;
 *     the scripted provider has no tokens, recorded as null, never 0)
 *   - produced artifact size (bytes/lines of every ui patch's newContent)
 *   - attempts (validate-retry loop count)
 *
 * App-side only: the agent library's ports are untouched. The provider is
 * wrapped at the sample's single injection point (instrumentProvider), and
 * the Anthropic adapter stashes API-reported usage into the collector for
 * the call the wrapper is timing. Exposed at GET /agent/metrics; smoke.ts
 * asserts one record per turn it drives (침묵 계측 없음).
 */

export interface ProviderCallMetric {
  latencyMs: number;
  /** API-reported usage; null when the provider doesn't expose tokens. */
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface TurnMetric {
  turn: number;
  endpoint: "session" | "refine";
  status: string;
  latencyMs: number;
  attempts: number | null;
  /** Total size of produced ui artifacts (sum over patches). Null when exhausted. */
  artifactBytes: number | null;
  artifactLines: number | null;
  providerCalls: ProviderCallMetric[];
  /** Sums over providerCalls; null when no call reported tokens. */
  inputTokens: number | null;
  outputTokens: number | null;
}

interface PendingUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TurnMetricsCollector {
  /** Provider adapters stash API-reported usage for the in-flight call. */
  stashUsage(usage: PendingUsage): void;
  /** The instrument wrapper records each timed provider call. */
  recordProviderCall(latencyMs: number): void;
  /** The server closes a turn: drains pending calls into one record. */
  completeTurn(input: { endpoint: "session" | "refine"; latencyMs: number; outcome: unknown }): TurnMetric;
  list(): TurnMetric[];
}

interface UiPatch {
  newContent?: string;
}

function artifactSizes(outcome: unknown): { bytes: number | null; lines: number | null } {
  const changeset = (outcome as { changeset?: { patches?: { ui?: UiPatch[] } } } | null)?.changeset;
  const patches = changeset?.patches?.ui;
  if (!Array.isArray(patches)) return { bytes: null, lines: null };
  let bytes = 0;
  let lines = 0;
  for (const patch of patches) {
    const content = patch.newContent ?? "";
    bytes += Buffer.byteLength(content, "utf8");
    lines += content.length === 0 ? 0 : content.split("\n").length;
  }
  return { bytes, lines };
}

export function createTurnMetrics(): TurnMetricsCollector {
  const turns: TurnMetric[] = [];
  let pendingCalls: ProviderCallMetric[] = [];
  let stashedUsage: PendingUsage | null = null;

  return {
    stashUsage(usage: PendingUsage): void {
      stashedUsage = usage;
    },
    recordProviderCall(latencyMs: number): void {
      pendingCalls.push({
        latencyMs,
        inputTokens: stashedUsage?.inputTokens ?? null,
        outputTokens: stashedUsage?.outputTokens ?? null,
      });
      stashedUsage = null;
    },
    completeTurn({ endpoint, latencyMs, outcome }): TurnMetric {
      const calls = pendingCalls;
      pendingCalls = [];
      const status = (outcome as { status?: string } | null)?.status ?? "unknown";
      const attempts = (outcome as { attempts?: number } | null)?.attempts ?? null;
      const { bytes, lines } = artifactSizes(outcome);
      const tokenCalls = calls.filter((c) => c.outputTokens !== null);
      const metric: TurnMetric = {
        turn: turns.length + 1,
        endpoint,
        status,
        latencyMs,
        attempts,
        artifactBytes: bytes,
        artifactLines: lines,
        providerCalls: calls,
        inputTokens: tokenCalls.length > 0 ? tokenCalls.reduce((s, c) => s + (c.inputTokens ?? 0), 0) : null,
        outputTokens: tokenCalls.length > 0 ? tokenCalls.reduce((s, c) => s + (c.outputTokens ?? 0), 0) : null,
      };
      turns.push(metric);
      return metric;
    },
    list(): TurnMetric[] {
      return turns.slice();
    },
  };
}

/**
 * Wrap a ModelProvider so every complete() call is timed into the
 * collector. Provider-agnostic (works for scripted and real providers);
 * token usage arrives separately via stashUsage from adapters that see it.
 */
export function instrumentProvider<T extends { name: string; complete(request: never): Promise<string> }>(
  provider: T,
  collector: TurnMetricsCollector,
): T {
  return {
    ...provider,
    async complete(request: never): Promise<string> {
      const startedAt = performance.now();
      try {
        return await provider.complete(request);
      } finally {
        collector.recordProviderCall(Math.round(performance.now() - startedAt));
      }
    },
  };
}
