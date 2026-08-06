/**
 * gallery host server — 전시물-무관 공유 호스트 (samples/README.md 규율 1:
 * 레지스트리 패키지만 소비). dashboard-builder server.ts 의 일반화 이식본:
 * 전시물-특수 요소(시드·knowledge·scripted provider·target)는 전부
 * ExhibitDefinition(exhibit-schema.ts) 뒤로 밀려났고, 이 서버는 계약만 본다.
 *
 *   POST /agent/session  { intent, editContext?, artifacts }  → turn 1
 *   POST /agent/refine   { instruction, editContext?, baseArtifacts? } → turn N+1
 *   GET  /agent/history · GET /agent/metrics
 *   GET  /exhibit        → 로드된 전시물의 meta/target/primaryArtifactId
 *
 * The agent runs here (not in the page) because the changeset SDK is
 * Node-first (node:crypto). The browser page owns the vivarium canvas; the
 * changeset crossing this HTTP boundary as plain JSON is the wire format.
 *
 * REAL-MODEL SWAP POINT: `provider` below is the single injection site.
 * MODEL_PROVIDER=anthropic|gpustack switches to a real model provider
 * (모델/조건 다양화 축); unset (default) keeps the exhibit's deterministic
 * scripted provider.
 *
 * Usage: node host/server.ts [port] [--exhibit <name>]
 *        (EXHIBIT env var also works; default exhibit: dashboard)
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";
import { createProposalSession } from "@vivariumjs/agent";
import type { ProposalSession } from "@vivariumjs/agent";
import type { ExhibitDefinition } from "./exhibit-schema.ts";
import { createAnthropicProvider } from "./providers/anthropic.ts";
import { createGpustackProvider } from "./providers/gpustack.ts";
import { createTurnMetrics, instrumentProvider } from "./metrics.ts";

// Static root is the GALLERY directory (host/..), not host/ itself — the
// browser needs /host/* (app shell), /exhibits/* (exhibit modules), and
// /node_modules/* (registry install of @vivariumjs/runtime) under one root.
const root = normalize(join(fileURLToPath(import.meta.url), "..", ".."));

const args = process.argv.slice(2);
const exhibitFlag = args.indexOf("--exhibit");
const exhibitName = exhibitFlag >= 0 ? args[exhibitFlag + 1] : (process.env.EXHIBIT ?? "dashboard");
const portArg = args.find(
  (a, i) => (exhibitFlag < 0 || (i !== exhibitFlag && i !== exhibitFlag + 1)) && /^\d+$/.test(a),
);
const port = Number(portArg ?? 8890);

if (!/^[a-z0-9-]+$/.test(exhibitName ?? "")) {
  console.error(`invalid exhibit name: ${JSON.stringify(exhibitName)} (expected ^[a-z0-9-]+$)`);
  process.exit(1);
}

// ─── Exhibit loading (the only place the host touches exhibit files) ────────

const exhibitPath = join(root, "exhibits", exhibitName, "exhibit.ts");
const exhibit: ExhibitDefinition = (await import(pathToFileURL(exhibitPath).href)).default;
if (!exhibit?.meta?.name || !exhibit.target || !exhibit.primaryArtifactId) {
  console.error(`exhibit ${exhibitName}: default export is not a valid ExhibitDefinition`);
  process.exit(1);
}
// 지목이 빗나가면 여기서 멈춘다. 조용히 다른 아티팩트를 대신 쓰면 화면은 그럴듯하게
// 뜨고 **지목이 틀렸다는 사실만 사라진다** — 아카이버가 하던 폴백이 그것이었다.
if (!exhibit.artifacts?.[exhibit.primaryArtifactId]) {
  console.error(
    `exhibit ${exhibitName}: primaryArtifactId "${exhibit.primaryArtifactId}" is not in artifacts ` +
      `(${Object.keys(exhibit.artifacts ?? {}).join(", ") || "none"})`,
  );
  process.exit(1);
}

// Stage host proxy target (same role as integration/e2e-demo's stage proxy).
const stageUrl = process.env.STAGE_URL ?? "http://localhost:8891";

// ─── The agent side ─────────────────────────────────────────────────────────

// Single injection point (acceptance criterion: real-model swap is one line).
// Hybrid switch: MODEL_PROVIDER=anthropic|gpustack opts into a real model
// provider; unset (the default) keeps the exhibit's deterministic scripted
// provider smoke.ts depends on.
// Turn-cost instrumentation (Phase 6.e): provider calls are timed at this
// injection point, token usage comes from the Anthropic adapter when real.
const metrics = createTurnMetrics();
function resolveProvider() {
  if (process.env.MODEL_PROVIDER === "anthropic") {
    return createAnthropicProvider({ onUsage: (usage) => metrics.stashUsage(usage) });
  }
  if (process.env.MODEL_PROVIDER === "gpustack") {
    return createGpustackProvider({ onUsage: (usage) => metrics.stashUsage(usage) });
  }
  if (!exhibit.createScriptedProvider) {
    throw new Error(
      `exhibit ${exhibit.meta.name} has no scripted provider — set MODEL_PROVIDER to a real provider`,
    );
  }
  return exhibit.createScriptedProvider();
}
const provider = instrumentProvider(resolveProvider(), metrics);

let session: ProposalSession | null = null;

/** Wire shape used by this host: an array of {artifactId, content} or a record. */
function toArtifactsRecord(input: unknown): Record<string, string> {
  if (Array.isArray(input)) {
    const record: Record<string, string> = {};
    for (const item of input as Array<{ artifactId: string; content: string }>) {
      record[item.artifactId] = item.content;
    }
    return record;
  }
  return (input as Record<string, string>) ?? {};
}

async function handleAgent(pathname: string, body: Record<string, unknown>): Promise<unknown> {
  if (pathname === "/agent/session") {
    session = createProposalSession({
      provider,
      // Knowledge port (fixed principle 4): the exhibit's catalog/rules,
      // recorded in every proposal's provenance.
      knowledge: exhibit.createKnowledge?.() ?? [],
      sessionId: `gallery:${exhibit.meta.name}`,
    });
    const startedAt = performance.now();
    const result = await session.propose({
      intent: String(body.intent),
      editContext: (body.editContext as never) ?? null,
      artifacts: toArtifactsRecord(body.artifacts),
    });
    metrics.completeTurn({
      endpoint: "session",
      latencyMs: Math.round(performance.now() - startedAt),
      outcome: result.outcome,
    });
    return { ...result, history: session.history() };
  }
  if (pathname === "/agent/metrics") {
    // Turn-cost record (Phase 6.e): one entry per agent turn — latency,
    // provider calls (tokens when the API reports them), artifact size.
    return { turns: metrics.list() };
  }
  if (pathname === "/agent/history") {
    // Lineage visibility (M6 follow-up): the session's state-machine
    // transcript — one record per turn, fingerprints included — so mission
    // runs can verify the refine chain without scraping turn responses.
    return session ? { session: session.describe(), history: session.history() } : { session: null, history: [] };
  }
  if (pathname === "/agent/refine") {
    if (!session) throw new Error("no session — POST /agent/session first");
    const overrides: { editContext?: never; baseArtifacts?: Record<string, string> } = {};
    if (body.editContext !== undefined) overrides.editContext = body.editContext as never;
    if (body.baseArtifacts !== undefined) {
      overrides.baseArtifacts = toArtifactsRecord(body.baseArtifacts);
    }
    const startedAt = performance.now();
    const result = await session.refine(
      String(body.instruction),
      Object.keys(overrides).length > 0 ? overrides : undefined,
    );
    metrics.completeTurn({
      endpoint: "refine",
      latencyMs: Math.round(performance.now() - startedAt),
      outcome: result.outcome,
    });
    return { ...result, history: session.history() };
  }
  throw new Error(`unknown agent endpoint: ${pathname}`);
}

// ─── Static serving with type stripping (dev harness only) ──────────────────

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/** run 아카이브의 스크린샷 등 바이너리는 바이트 그대로 서빙해야 한다. */
const binaryExts = new Set([".png", ".jpg"]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);

  if (url.pathname.startsWith("/stage/")) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const upstream = await fetch(stageUrl + url.pathname.slice("/stage".length), {
        method: req.method,
        headers: { "content-type": "application/json" },
        body: req.method === "GET" ? undefined : Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(upstream.status, { "content-type": "application/json; charset=utf-8" });
      res.end(await upstream.text());
    } catch (err) {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: `stage host unreachable at ${stageUrl}: ${String(err)}` }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/exhibit") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        name: exhibit.meta.name,
        meta: exhibit.meta,
        target: exhibit.target,
        primaryArtifactId: exhibit.primaryArtifactId,
        // 화면 **전부**. 하나만 알리던 동안 앱은 하나만 그렸고, 둘째 화면은
        // 승인·apply·rollback 을 전부 통과한 채 어디에도 나타나지 않았다.
        // primary 를 머리에 두어 순서가 선언과 같다.
        artifactIds: [
          exhibit.primaryArtifactId,
          ...Object.keys(exhibit.artifacts).filter((id) => id !== exhibit.primaryArtifactId),
        ],
      }),
    );
    return;
  }

  if (req.method === "GET" && (url.pathname === "/agent/history" || url.pathname === "/agent/metrics")) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(await handleAgent(url.pathname, {})));
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/agent/")) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const result = await handleAgent(url.pathname, body);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }));
    }
    return;
  }

  // Static files under the gallery root (host/, exhibits/, node_modules/ —
  // the browser import map loads @vivariumjs/runtime's dist ESM straight
  // from the registry install).
  try {
    const path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root + sep) && path !== root) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const ext = path.slice(path.lastIndexOf("."));
    if (binaryExts.has(ext)) {
      res.writeHead(200, { "content-type": contentTypes[ext] });
      res.end(await readFile(path));
      return;
    }
    let file = await readFile(path, "utf8");
    if (ext === ".ts" && !path.includes(`${sep}node_modules${sep}`)) {
      file = stripTypeScriptTypes(file, { mode: "strip" });
    }
    res.writeHead(200, { "content-type": contentTypes[ext] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(port, () => {
  console.log(`gallery [${exhibit.meta.name}]: http://localhost:${port}/host/index.html`);
});
