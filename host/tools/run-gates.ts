/**
 * Runs the sample's regression gates end to end: brings up stage-host and one
 * gallery host per exhibit the gates need, waits for both to actually answer,
 * runs each gate, and reports.
 *
 * Why this exists rather than a list of commands in a README and a parallel
 * list in CI: the cost of these gates was never that they fail — they pass —
 * it was that running them means remembering a start order, two ports, which
 * exhibit each gate needs, and which environment variable points a gate at a
 * host other than the default. That is a thing a machine should hold.
 *
 * One definition of "the gates" lives here, so CI and a person run the same
 * set. Adding a gate below adds it to both.
 *
 * Usage:
 *   node host/tools/run-gates.ts             # every gate
 *   node host/tools/run-gates.ts --gate smoke-refusal   # one, repeatable
 *   node host/tools/run-gates.ts --list
 *
 * Exit 0 only when every gate that ran passed.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const galleryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Every gate, with the exhibit it needs. The gates seed their own target on
 * entry, so they are order-independent and re-runnable; only the exhibit the
 * host was started with matters.
 */
const GATES = [
  { name: "smoke", script: "host/smoke.ts", exhibit: "dashboard" },
  { name: "smoke-3facet", script: "host/smoke-3facet.ts", exhibit: "inventory" },
  { name: "smoke-refusal", script: "host/smoke-refusal.ts", exhibit: "inventory" },
  { name: "smoke-review", script: "host/smoke-review.ts", exhibit: "inventory" },
] as const;

const STAGE_HOST_PORT = 8891;
const FIRST_GALLERY_PORT = 8890;
const READY_TIMEOUT_MS = 120_000;

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const g of GATES) console.log(`${g.name}\t(exhibit: ${g.exhibit})`);
  process.exit(0);
}
const only = args.includes("--gate") ? args[args.indexOf("--gate") + 1] : undefined;
if (only && !GATES.some((g) => g.name === only)) {
  console.error(`unknown gate: ${only} — run with --list`);
  process.exit(2);
}
const selected = only ? GATES.filter((g) => g.name === only) : [...GATES];

const children: ChildProcess[] = [];
const logs = new Map<ChildProcess, string[]>();

function start(command: string, argv: string[], label: string): ChildProcess {
  const child = spawn(command, argv, { cwd: galleryRoot, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const tail: string[] = [];
  logs.set(child, tail);
  const keep = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) if (line) tail.push(line);
    // a background process's whole log is noise until something fails
    while (tail.length > 40) tail.shift();
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`[${label}] exited with ${code}`);
  });
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

function tailOf(child: ChildProcess) {
  return (logs.get(child) ?? []).join("\n");
}

/**
 * Fail loudly when a host never comes up. A silent proceed turns a dead host
 * into whatever error the gate happens to produce, which is a worse thing to
 * read than "the host never answered".
 */
async function waitUntilAnswering(url: string, what: string, child: ChildProcess) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = "no attempt made";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${what} exited before answering (code ${child.exitCode})\n${tailOf(child)}`);
    }
    try {
      await fetch(url, { signal: AbortSignal.timeout(2_000) });
      return;
    } catch (error) {
      lastError = (error as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `${what} did not answer ${url} within ${READY_TIMEOUT_MS / 1000}s (${lastError})\n${tailOf(child)}`);
}

async function runGate(script: string, baseUrl: string): Promise<boolean> {
  const gate = spawn(process.execPath, [script], {
    cwd: galleryRoot,
    stdio: "inherit",
    env: { ...process.env, SMOKE_BASE_URL: baseUrl },
  });
  const [code] = (await once(gate, "exit")) as [number | null, NodeJS.Signals | null];
  return code === 0;
}

const results: { name: string; passed: boolean }[] = [];

try {
  // stage-host is exhibit-agnostic — one instance serves every exhibit, and the
  // gates use different targets, so they do not collide.
  const stageHost = start("dotnet", ["run", "--project", "host/stage-host", "--", String(STAGE_HOST_PORT)], "stage-host");
  await waitUntilAnswering(`http://localhost:${STAGE_HOST_PORT}/`, "stage-host", stageHost);

  // one gallery host per exhibit, all up front: restarting between gates would
  // buy nothing (each gate re-seeds) and cost a startup per gate.
  const exhibits = [...new Set(selected.map((g) => g.exhibit))];
  const baseUrl = new Map<string, string>();
  for (const [i, exhibit] of exhibits.entries()) {
    const port = FIRST_GALLERY_PORT + i * 2;
    const host = start(process.execPath, ["host/server.ts", String(port), "--exhibit", exhibit], `host:${exhibit}`);
    const url = `http://localhost:${port}`;
    await waitUntilAnswering(`${url}/host/index.html`, `gallery host (${exhibit})`, host);
    baseUrl.set(exhibit, url);
  }

  for (const gate of selected) {
    console.log(`\n── ${gate.name} (exhibit: ${gate.exhibit}) ──`);
    results.push({ name: gate.name, passed: await runGate(gate.script, baseUrl.get(gate.exhibit)!) });
  }
} catch (error) {
  console.error(`\nrun-gates: ${(error as Error).message}`);
  stopAll();
  process.exit(1);
}

stopAll();

const failed = results.filter((r) => !r.passed);
console.log(`\nrun-gates: ${results.length - failed.length}/${results.length} gates passed`);
for (const f of failed) console.log(`  FAIL ${f.name}`);
process.exit(failed.length === 0 ? 0 : 1);
