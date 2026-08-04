/**
 * gallery consumption reproducibility gate (Phase 5.d — dashboard-builder 이식).
 *
 * Verifies that a FRESH consumer — clone, no lockfile (this sample's lockfile
 * is deliberately untracked; see README "소비 현실성") — can reach the state
 * README describes, using the npm registry alone. Born from a real defect:
 * the registry served a
 * defective 0.0.1 while source had moved to 0.0.2 (publish-freshness gap),
 * and a stale local lockfile pointed at a vanished local tarball; neither
 * was detected by any gate. A later one added the fourth axis: a published
 * package kept describing itself as pre-release long after the repository had
 * corrected that sentence. The registry page renders the published README, so
 * that page — the product's storefront — said "not released yet" while the
 * repository said otherwise, and no gate compared the two.
 *
 * Four axes:
 *   1. Registry freshness — for each @vivariumjs dependency: the registry
 *      "latest" must satisfy the declared range (else a fresh consumer
 *      cannot install at all), and publish lag (source version ahead of the
 *      registry) is surfaced as a NAMED signal: WARN by default, FAIL with
 *      --strict. Lag is normal mid-development; silence about it is not.
 *   2. Local lockfile hygiene — if a package-lock.json exists in the sample
 *      (untracked, but present on working machines), every @vivariumjs entry
 *      must be registry-resolved (https://registry.npmjs.org/...) and
 *      satisfy the declared range. Catches exactly the stale-local-state
 *      class of the originating issue without touching node_modules.
 *   3. Clean-room reproduction — in a temp dir with only package.json:
 *      `npm install --package-lock-only` (registry resolution), assert the
 *      generated lockfile carries no file:/link: resolutions, then `npm ci`
 *      (real install). This IS the fresh-consumer experience, executed.
 *   4. Published documentation drift — the README the registry serves must
 *      match the one beside the package's manifest in the repository (npm
 *      ships a package-root README whatever `files` says, so that is the file
 *      consumers actually receive). A difference is reported as a NAMED
 *      signal, DOC-LAG. Unlike the other axes it never escalates under
 *      --strict: it describes an artifact that is already published, and
 *      publishing is precisely the action that clears it — a check that
 *      blocked the fix would be inverted, and a permanently red gate is a
 *      gate nobody reads. The message says whether a pending release exists
 *      to carry the correction, because when source and registry sit at the
 *      same version the correction has nothing to ride on.
 *
 * Zero dependencies; requires network access to registry.npmjs.org.
 * Usage: node host/tools/verify-consumption.ts [--strict]
 * Exit 0 on PASS (warnings allowed; --strict escalates them, DOC-LAG excepted
 * for the reason given under axis 4), exit 1 otherwise.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STRICT = process.argv.includes("--strict");
const SAMPLE_DIR = fileURLToPath(new URL("../..", import.meta.url));
const REPO_ROOT = join(SAMPLE_DIR, "..", "..");

// Source-of-truth package.json per published package (submodule checkouts;
// absent in a consumer clone without submodules — then source lag is n/a).
const SOURCE_PATHS: Record<string, string> = {
  "@vivariumjs/changeset": join(REPO_ROOT, "vivarium-changeset", "sdk", "typescript", "package.json"),
  "@vivariumjs/runtime": join(REPO_ROOT, "vivarium", "package.json"),
  "@vivariumjs/agent": join(REPO_ROOT, "vivarium-agent", "package.json"),
};

let passCount = 0;
let warnCount = 0;
const failures: string[] = [];

function ok(desc: string): void {
  passCount++;
  console.log(`ok - ${desc}`);
}
function warn(desc: string): void {
  if (STRICT) {
    fail(`[strict] ${desc}`);
    return;
  }
  warnCount++;
  console.log(`WARN - ${desc}`);
}
/**
 * A warning about an artifact that is ALREADY published. Never escalates
 * under --strict, because the release being prepared is what resolves it:
 * blocking that release on it would block the fix.
 */
function warnPublished(desc: string): void {
  warnCount++;
  console.log(`WARN - ${desc}`);
}
function fail(desc: string): void {
  failures.push(desc);
  console.log(`FAIL - ${desc}`);
}

function npm(args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("npm", args, { cwd, shell: true, encoding: "utf8", timeout: 300_000 });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function cmpTriple(a: number[], b: number[]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function parseTriple(v: string): number[] | null {
  const t = v.split(".").map(Number);
  return t.length === 3 && t.every((n) => Number.isInteger(n) && n >= 0) ? t : null;
}

/** Caret/exact range check. Returns null for range shapes we don't model. */
function satisfies(range: string, version: string): boolean | null {
  const v = parseTriple(version);
  if (v === null) return null;
  if (range.startsWith("^")) {
    const base = parseTriple(range.slice(1));
    if (base === null) return null;
    if (cmpTriple(v, base) < 0) return false;
    if (base[0] > 0) return v[0] === base[0];
    if (base[1] > 0) return v[0] === 0 && v[1] === base[1];
    return v[0] === 0 && v[1] === 0 && v[2] === base[2];
  }
  const exact = parseTriple(range);
  return exact === null ? null : cmpTriple(v, exact) === 0;
}

const pkg = JSON.parse(readFileSync(join(SAMPLE_DIR, "package.json"), "utf8"));
const deps: Record<string, string> = pkg.dependencies ?? {};
const vivariumDeps = Object.entries(deps).filter(([name]) => name.startsWith("@vivariumjs/"));
if (vivariumDeps.length === 0) {
  fail("no @vivariumjs dependencies found in sample package.json");
}

// ── Axis 1: registry freshness ─────────────────────────────────────────────
console.log("# axis 1 — registry freshness");
/** Registry "latest" per package, resolved once here and reused by axis 4. */
const registryLatest = new Map<string, string>();
for (const [name, range] of vivariumDeps) {
  const view = npm(["view", name, "version"], SAMPLE_DIR);
  const latest = view.stdout.trim();
  if (view.status !== 0 || parseTriple(latest) === null) {
    fail(`${name}: cannot resolve registry latest (npm view exit ${view.status})`);
    continue;
  }
  registryLatest.set(name, latest);
  const sat = satisfies(range, latest);
  if (sat === null) {
    warn(`${name}: range "${range}" shape not modeled — freshness check skipped`);
  } else if (sat) {
    ok(`${name}: registry latest ${latest} satisfies declared "${range}"`);
  } else {
    // Two distinct defects: if the range's floor is above latest, no
    // published version can satisfy it (install fails outright, ETARGET);
    // otherwise an older version installs, but the sample no longer
    // reproduces the current family state (range lags the registry).
    const floor = parseTriple(range.startsWith("^") ? range.slice(1) : range);
    const latestTriple = parseTriple(latest);
    if (floor !== null && latestTriple !== null && cmpTriple(floor, latestTriple) > 0) {
      fail(`${name}: no published version satisfies "${range}" (latest ${latest}) — fresh consumer cannot install`);
    } else {
      fail(`${name}: RANGE-LAG — registry latest ${latest} outside declared "${range}"; fresh consumers get an older release — bump the sample's range`);
    }
  }

  const srcPath = SOURCE_PATHS[name];
  if (srcPath && existsSync(srcPath)) {
    const srcVersion = JSON.parse(readFileSync(srcPath, "utf8")).version as string;
    const src = parseTriple(srcVersion);
    if (src !== null && cmpTriple(src, parseTriple(latest) ?? src) > 0) {
      warn(`${name}: PUBLISH-LAG — source ${srcVersion} ahead of registry ${latest} (fresh consumers get ${latest})`);
    } else {
      ok(`${name}: no publish lag (source ${srcVersion}, registry ${latest})`);
    }
  } else {
    console.log(`info - ${name}: source checkout absent, lag check n/a`);
  }
}

// ── Axis 2: local lockfile hygiene ─────────────────────────────────────────
console.log("# axis 2 — local lockfile hygiene");
const localLock = join(SAMPLE_DIR, "package-lock.json");
if (!existsSync(localLock)) {
  console.log("info - no local package-lock.json (fresh checkout state), axis skipped");
} else {
  const lock = JSON.parse(readFileSync(localLock, "utf8"));
  const packages: Record<string, { version?: string; resolved?: string }> = lock.packages ?? {};
  let clean = true;
  for (const [name, range] of vivariumDeps) {
    const entry = packages[`node_modules/${name}`];
    if (!entry) {
      fail(`lockfile: ${name} missing from package-lock.json`);
      clean = false;
      continue;
    }
    if (!entry.resolved?.startsWith("https://registry.npmjs.org/")) {
      fail(`lockfile: ${name} resolved to "${entry.resolved}" — not the registry (stale local state)`);
      clean = false;
    }
    if (entry.version && satisfies(range, entry.version) === false) {
      fail(`lockfile: ${name}@${entry.version} does not satisfy declared "${range}" (npm ci would EUSAGE)`);
      clean = false;
    }
  }
  if (clean) ok(`local lockfile: all ${vivariumDeps.length} @vivariumjs entries registry-resolved and range-consistent`);
}

// ── Axis 3: clean-room reproduction ────────────────────────────────────────
console.log("# axis 3 — clean-room npm ci reproduction");
const tempDir = mkdtempSync(join(tmpdir(), "vivarium-consumption-"));
try {
  writeFileSync(join(tempDir, "package.json"), JSON.stringify(pkg, null, 2));
  const lockGen = npm(["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], tempDir);
  if (lockGen.status !== 0) {
    fail(`clean-room: lockfile generation failed (exit ${lockGen.status}): ${lockGen.stderr.slice(0, 300)}`);
  } else {
    ok("clean-room: lockfile generated from registry resolution alone");
    const genLock = JSON.parse(readFileSync(join(tempDir, "package-lock.json"), "utf8"));
    const bad = Object.entries(genLock.packages ?? {}).filter(([, e]) => {
      const resolved = (e as { resolved?: string }).resolved;
      return resolved !== undefined && !resolved.startsWith("https://");
    });
    if (bad.length === 0) {
      ok("clean-room: generated lockfile has zero file:/link:/local resolutions");
    } else {
      fail(`clean-room: non-registry resolutions found: ${bad.map(([k]) => k).join(", ")}`);
    }
    const ci = npm(["ci", "--ignore-scripts", "--no-audit", "--no-fund"], tempDir);
    if (ci.status === 0) {
      ok("clean-room: npm ci succeeded (fresh-consumer install reproduces)");
    } else {
      fail(`clean-room: npm ci failed (exit ${ci.status}): ${ci.stderr.slice(0, 300)}`);
    }
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

// ── Axis 4: published documentation drift ──────────────────────────────────
console.log("# axis 4 — published documentation drift");

/** Checkout artifacts, not authored content: line endings and a trailing newline. */
function normalizeDoc(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\s+$/, "");
}

for (const [name] of vivariumDeps) {
  const srcPath = SOURCE_PATHS[name];
  if (!srcPath || !existsSync(srcPath)) {
    console.log(`info - ${name}: source checkout absent, doc drift check n/a`);
    continue;
  }
  // npm publishes the README sitting beside the manifest regardless of
  // `files`, so the manifest's directory locates the file consumers receive —
  // which is not necessarily the repository root when a repository holds
  // several packages.
  const repoReadme = join(dirname(srcPath), "README.md");
  if (!existsSync(repoReadme)) {
    fail(`${name}: no README.md beside the package manifest — nothing to compare the published one against`);
    continue;
  }
  const view = npm(["view", name, "readme", "--json"], SAMPLE_DIR);
  if (view.status !== 0) {
    fail(`${name}: cannot read the published README (npm view exit ${view.status})`);
    continue;
  }
  let published: string;
  try {
    const parsed: unknown = JSON.parse(view.stdout.trim() || "null");
    if (typeof parsed !== "string" || parsed.trim() === "") {
      warnPublished(`${name}: DOC-LAG — the registry serves no README for this package; its page has nothing to show`);
      continue;
    }
    published = parsed;
  } catch {
    fail(`${name}: published README is not readable as JSON from the registry metadata`);
    continue;
  }

  const pubLines = normalizeDoc(published).split("\n");
  const repoLines = normalizeDoc(readFileSync(repoReadme, "utf8")).split("\n");
  const height = Math.max(pubLines.length, repoLines.length);
  let differing = 0;
  let firstDiff = -1;
  for (let i = 0; i < height; i++) {
    if (pubLines[i] !== repoLines[i]) {
      differing++;
      if (firstDiff < 0) firstDiff = i + 1;
    }
  }
  if (differing === 0) {
    ok(`${name}: published README matches the repository`);
    continue;
  }
  // Whether a pending release exists decides what the reader should do: with
  // one, the correction ships on its own; without one, it has no carrier and
  // the divergence persists until someone decides to release documentation.
  const latest = registryLatest.get(name);
  const srcVersion = JSON.parse(readFileSync(srcPath, "utf8")).version as string;
  const carrier =
    latest === undefined
      ? "registry version unresolved, carrier unknown"
      : latest === srcVersion
        ? `source and registry are both ${latest} — no pending release carries the correction`
        : `source ${srcVersion} is ahead of registry ${latest} — the pending release carries the correction`;
  warnPublished(
    `${name}: DOC-LAG — published README differs from the repository (${differing} of ${height} lines, first at line ${firstDiff}); ${carrier}`,
  );
}

// ── summary ────────────────────────────────────────────────────────────────
const verdict = failures.length === 0 ? "PASS" : "FAIL";
console.log(
  `verify-consumption: ${verdict} — ${passCount} ok, ${warnCount} warn, ${failures.length} fail${STRICT ? " (strict)" : ""}`,
);
process.exit(failures.length === 0 ? 0 : 1);
