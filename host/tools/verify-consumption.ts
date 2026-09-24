/**
 * gallery consumption reproducibility gate.
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
 * The fifth axis has the same origin, one layer down: the same readme pointed
 * at documentation the package does not carry, so the link resolved to nothing
 * once installed. The registry web page hid it by rewriting relative links
 * against the repository — what broke was the consumer reading the installed
 * package, which is also what a tool or an agent reads.
 *
 * Six axes:
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
 *   3. Clean-room reproduction — in a temp dir with only package.json and an
 *      npm cache of its own (a shared cache answers with the machine's history):
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
 *   5. Documentation reach — every relative link in the readme about to be
 *      published must resolve to a file the package actually carries, as
 *      `npm pack --dry-run` reports it. This one FAILS rather than warns: it
 *      describes the repository, not the registry, so it is fixable before the
 *      release rather than a fact already in a consumer's hands. Two more
 *      claims of the same kind ride with it: a document path named in a
 *      shipped declaration file (what an editor shows on hover) must be
 *      shipped too or written as an absolute URL, and an API name the readme
 *      lists in a table must be exported from the package entry.
 *   6. .NET consumption — the host half. Freshness and PUBLISH-LAG as in
 *      axis 1; the provenance of the local restore as in axis 2 (NuGet never
 *      re-fetches a version it has cached, so a build restored once from a
 *      local feed keeps being served under the published version number —
 *      the cache's own record of each package's source is what is read); and a
 *      clean-room restore from nuget.org alone as in axis 3; and, as in axis 5,
 *      no document path in the shipped XML documentation that the package
 *      does not carry.
 *
 * Zero dependencies; requires network access to registry.npmjs.org and
 * api.nuget.org, and the dotnet SDK for axis 6.
 * Usage: node host/tools/verify-consumption.ts [--strict]
 * Exit 0 on PASS (warnings allowed; --strict escalates them, DOC-LAG excepted
 * for the reason given under axis 4), exit 1 otherwise.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
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

/**
 * Windows 의 `npm` 은 `.cmd` 이고 Node 는 셸 없는 `.cmd` 실행을 막는다(CVE-2024-27980).
 * 그렇다고 `shell: true` 에 인자 배열을 넘기면 인자가 이스케이프 없이 이어붙는다(DEP0190) —
 * 그래서 셸은 거기서만 쓰고, 명령 줄은 직접 인용해 한 문자열로 넘긴다(임시 디렉터리 경로에
 * 공백이 섞여도 쪼개지지 않게). 다른 플랫폼은 셸 없이 실행한다.
 */
const quote = (a: string) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

function npm(args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  const opts = { cwd, encoding: "utf8" as const, timeout: 300_000 };
  const r = process.platform === "win32"
    ? spawnSync(["npm", ...args].map(quote).join(" "), { ...opts, shell: true })
    : spawnSync("npm", args, opts);
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
  // Its own npm cache too: the machine's cache keeps registry answers for a
  // while (packument max-age), so a shared one reports the machine's history.
  const cache = ["--cache", join(tempDir, ".npm-cache")];
  const lockGen = npm(["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", ...cache], tempDir);
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
    const ci = npm(["ci", "--ignore-scripts", "--no-audit", "--no-fund", ...cache], tempDir);
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

// ── Axis 5: documentation reach ────────────────────────────────────────────
console.log("# axis 5 — documentation reach");

/** Markdown link targets, minus the ones that never leave the document. */
function relativeLinkTargets(markdown: string): string[] {
  const targets = new Set<string>();
  for (const m of markdown.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = m[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) continue;
    const path = raw.split("#")[0];
    if (path !== "") targets.add(path);
  }
  return [...targets];
}

for (const [name] of vivariumDeps) {
  const srcPath = SOURCE_PATHS[name];
  if (!srcPath || !existsSync(srcPath)) {
    console.log(`info - ${name}: source checkout absent, doc reach check n/a`);
    continue;
  }
  const pkgDir = dirname(srcPath);
  const repoReadme = join(pkgDir, "README.md");
  if (!existsSync(repoReadme)) continue; // axis 4 already reported this

  // npm itself is the authority on what ships — `files` plus the entries npm
  // always adds. Scripts are skipped: this asks what is packed, not how it is built.
  const packed = npm(["pack", "--dry-run", "--json", "--ignore-scripts"], pkgDir);
  let shipped: string[];
  try {
    const manifest = JSON.parse(packed.stdout.trim()) as Array<{ files?: Array<{ path?: string }> }>;
    shipped = (manifest[0]?.files ?? []).map((f) => (f.path ?? "").replace(/\\/g, "/"));
    if (shipped.length === 0) throw new Error("empty file list");
  } catch {
    fail(`${name}: cannot determine which files the package ships (npm pack --dry-run exit ${packed.status})`);
    continue;
  }

  const unreachable = relativeLinkTargets(readFileSync(repoReadme, "utf8")).filter((target) => {
    const normalized = target.replace(/\\/g, "/").replace(/^\.\//, "");
    if (normalized.startsWith("../")) return true; // leaves the package outright
    const asDir = normalized.endsWith("/") ? normalized : `${normalized}/`;
    return !shipped.some((f) => f === normalized || f.startsWith(asDir));
  });

  if (unreachable.length === 0) {
    ok(`${name}: every relative README link resolves inside the published package`);
  } else {
    fail(
      `${name}: README links to ${unreachable.length} path(s) the package does not carry — ` +
        `${unreachable.join(", ")}; a consumer reading the installed package follows them to nothing`,
    );
  }

  // The declaration files are read more than the readme: an editor shows their
  // comments on hover, and a tool or an agent reads them to learn the API. A
  // document path written there has to be reachable from the installed package
  // too — shipped, or written as an absolute URL.
  const dangling: string[] = [];
  for (const file of shipped.filter((f) => f.endsWith(".d.ts"))) {
    const path = join(pkgDir, file);
    if (!existsSync(path)) continue;
    for (const ref of documentReferences(readFileSync(path, "utf8"))) {
      const target = join(dirname(file), ref).replace(/\\/g, "/");
      const fromRoot = ref.replace(/^\.\//, "");
      if (!shipped.includes(target) && !shipped.includes(fromRoot)) dangling.push(`${file} → ${ref}`);
    }
  }
  if (dangling.length === 0) {
    ok(`${name}: every document path named in a shipped declaration file resolves inside the package`);
  } else {
    fail(
      `${name}: ${dangling.length} document path(s) in shipped declaration files point outside the package — ` +
        `${dangling.join(", ")}; write them as absolute URLs or ship the document`,
    );
  }

  // A readme table that lists API names is a claim that they are exported.
  const entry = entryDeclaration(pkgDir);
  const listed = tableIdentifiers(readFileSync(repoReadme, "utf8"));
  if (listed.length === 0) continue;
  if (!entry || !existsSync(entry)) {
    fail(`${name}: README lists ${listed.length} API name(s) but the entry declaration file is not built — cannot check them`);
    continue;
  }
  const exported = declaredExports(entry);
  const missing = listed.filter((id) => !exported.has(id));
  if (missing.length === 0) {
    ok(`${name}: all ${listed.length} API name(s) the README lists are exported from the package entry`);
  } else {
    fail(`${name}: README lists ${missing.length} API name(s) the package entry does not export — ${missing.join(", ")}`);
  }
}

/**
 * Relative document paths (`*.md`) mentioned in a declaration file. A path that
 * is part of a URL is skipped: the lookbehind refuses a path whose first segment
 * follows `/`, `:` or a word character.
 */
function documentReferences(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(/(?<![\w/:.-])((?:\.{1,2}\/)*[\w.-]+(?:\/[\w.-]+)*\.md)\b/g)) refs.add(m[1]);
  return [...refs];
}

/** Plain identifiers in code spans inside markdown table rows. */
function tableIdentifiers(markdown: string): string[] {
  const ids = new Set<string>();
  for (const line of markdown.split("\n")) {
    if (!line.trimStart().startsWith("|")) continue;
    for (const m of line.matchAll(/`([A-Za-z_$][\w$]*)`/g)) ids.add(m[1]);
  }
  return [...ids];
}

function entryDeclaration(pkgDir: string): string | null {
  const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const root = manifest.exports?.["."];
  const types = typeof root === "object" && root !== null ? root.types : manifest.types;
  return typeof types === "string" ? join(pkgDir, types) : null;
}

/**
 * Names a declaration file exports, following `export … from` and `export *`.
 * Reads the regular form tsc emits — enough for the declaration files this gate
 * sees; a construct it does not know reads as "not exported", which fails loudly
 * rather than passing silently.
 */
function declaredExports(file: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(file) || !existsSync(file)) return names;
  seen.add(file);
  const text = readFileSync(file, "utf8");
  const resolve = (spec: string) => join(dirname(file), spec.replace(/\.(?:ts|js)$/, ".d.ts"));
  for (const m of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?(?:function|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(/export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/g)) names.add(m[1]);
  for (const m of text.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
    for (const n of declaredExports(resolve(m[1]), seen)) names.add(n);
  }
  return names;
}

// ── Axis 6: .NET consumption ───────────────────────────────────────────────
// The host half of the sample consumes NuGet packages, and the five axes above
// see none of them. Three checks, each the NuGet counterpart of one npm axis:
// freshness (axis 1), where the local restore actually came from (axis 2), and
// a clean-room restore from the registry alone (axis 3).
//
// The provenance check exists because NuGet never re-fetches a version its
// global cache already holds. A package restored once from a local feed —
// typically a build made just before publishing — keeps being served under the
// published version number, so local gates can run bits the registry never
// shipped while every version string says otherwise. The cache records where
// each package came from (`.nupkg.metadata` → `source`); that is what is read.
console.log("# axis 6 — .NET consumption");
const NUGET_REGISTRY = "https://api.nuget.org/v3/index.json";
const STAGE_HOST = join(SAMPLE_DIR, "host", "stage-host");
const NUGET_SOURCE_PATHS: Record<string, string> = {
  "Vivarium.Stage": join(REPO_ROOT, "vivarium-stage", "src", "Vivarium.Stage", "Vivarium.Stage.csproj"),
  "Vivarium.Changeset": join(REPO_ROOT, "vivarium-changeset", "sdk", "dotnet", "Vivarium.Changeset", "Vivarium.Changeset.csproj"),
};

function csprojVersion(path: string): string | null {
  const m = /<Version>([^<]+)<\/Version>/.exec(readFileSync(path, "utf8"));
  return m ? m[1].trim() : null;
}

async function nugetLatest(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.nuget.org/v3-flatcontainer/${id.toLowerCase()}/index.json`);
    if (!res.ok) return null;
    const { versions } = (await res.json()) as { versions: string[] };
    const stable = versions.filter((v) => parseTriple(v) !== null);
    return stable.sort((a, b) => cmpTriple(parseTriple(a)!, parseTriple(b)!)).pop() ?? null;
  } catch {
    return null;
  }
}

const stageCsproj = readFileSync(join(STAGE_HOST, "StageHost.csproj"), "utf8");
const nugetRefs = [...stageCsproj.matchAll(/<PackageReference\s+Include="(Vivarium\.[^"]+)"\s+Version="([^"]+)"/g)]
  .map((m) => [m[1], m[2]] as const);
if (nugetRefs.length === 0) fail("stage-host: no Vivarium.* PackageReference found — nothing to verify");

// 6a — freshness, as axis 1: the pinned version must be the registry latest,
// and source ahead of the registry is PUBLISH-LAG.
for (const [id, pinned] of nugetRefs) {
  const latest = await nugetLatest(id);
  if (latest === null) {
    fail(`${id}: cannot resolve NuGet registry latest`);
    continue;
  }
  if (pinned === latest) ok(`${id}: stage-host pins ${pinned}, the registry latest`);
  else if (parseTriple(pinned) && cmpTriple(parseTriple(pinned)!, parseTriple(latest)!) > 0) {
    fail(`${id}: stage-host pins ${pinned}, which the registry does not have (latest ${latest}) — fresh consumer cannot restore`);
  } else {
    fail(`${id}: RANGE-LAG — stage-host pins ${pinned}, registry latest is ${latest}; bump the pin`);
  }
}
for (const [id, srcPath] of Object.entries(NUGET_SOURCE_PATHS)) {
  if (!existsSync(srcPath)) {
    console.log(`info - ${id}: source checkout absent, lag check n/a`);
    continue;
  }
  const src = csprojVersion(srcPath);
  const latest = await nugetLatest(id);
  if (src === null || latest === null || parseTriple(src) === null) {
    fail(`${id}: cannot compare source and registry versions (source ${src ?? "?"}, registry ${latest ?? "?"})`);
  } else if (cmpTriple(parseTriple(src)!, parseTriple(latest)!) > 0) {
    warn(`${id}: PUBLISH-LAG — source ${src} ahead of registry ${latest} (fresh consumers get ${latest})`);
  } else {
    ok(`${id}: no publish lag (source ${src}, registry ${latest})`);
  }

  // The XML documentation file ships in the package and is what an IDE shows on
  // hover — the NuGet counterpart of axis 5's declaration-file check. What it
  // says is exactly the `///` comments, so the source is read; the package
  // carries no document besides its readme.
  const shippedDocs = /<PackageReadmeFile>([^<]+)<\/PackageReadmeFile>/.exec(readFileSync(srcPath, "utf8"))?.[1].trim();
  const dangling: string[] = [];
  for (const file of sourceFiles(dirname(srcPath), ".cs")) {
    const xmlDoc = readFileSync(file, "utf8").split("\n").filter((l) => l.trimStart().startsWith("///")).join("\n");
    for (const ref of documentReferences(xmlDoc)) {
      if (ref !== shippedDocs) dangling.push(`${relative(dirname(srcPath), file).replace(/\\/g, "/")} → ${ref}`);
    }
  }
  if (dangling.length === 0) ok(`${id}: every document path named in the shipped XML documentation resolves inside the package`);
  else {
    fail(
      `${id}: ${dangling.length} document path(s) in XML documentation point outside the package — ` +
        `${dangling.join(", ")}; write them as absolute URLs`,
    );
  }
}

function sourceFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "bin" && entry.name !== "obj") out.push(...sourceFiles(join(dir, entry.name), ext));
    } else if (entry.name.endsWith(ext)) out.push(join(dir, entry.name));
  }
  return out;
}

// 6b — provenance of the local restore, as axis 2.
const assetsPath = join(STAGE_HOST, "obj", "project.assets.json");
if (!existsSync(assetsPath)) {
  console.log("info - stage-host not restored locally (fresh checkout state), provenance check skipped");
} else {
  const assets = JSON.parse(readFileSync(assetsPath, "utf8")) as {
    packageFolders?: Record<string, unknown>;
    libraries?: Record<string, { type?: string }>;
  };
  const folders = Object.keys(assets.packageFolders ?? {});
  const restored = Object.entries(assets.libraries ?? {})
    .filter(([key, lib]) => lib.type === "package" && key.startsWith("Vivarium."))
    .map(([key]) => key.split("/") as [string, string]);
  let clean = true;
  for (const [id, version] of restored) {
    const metaPath = folders
      .map((f) => join(f, id.toLowerCase(), version, ".nupkg.metadata"))
      .find((p) => existsSync(p));
    if (metaPath === undefined) {
      fail(`${id} ${version}: restored, but no .nupkg.metadata in any package folder — provenance unknown`);
      clean = false;
      continue;
    }
    const source = (JSON.parse(readFileSync(metaPath, "utf8")) as { source?: string }).source ?? "";
    if (source !== NUGET_REGISTRY) {
      fail(
        `${id} ${version}: the local restore came from "${source}", not the registry — local gates run a build ` +
          `nuget.org did not serve. Delete ${dirname(metaPath)} and restore again (the sample's NuGet.Config limits sources to nuget.org)`,
      );
      clean = false;
    }
  }
  if (clean) ok(`stage-host local restore: all ${restored.length} Vivarium.* packages came from the registry`);
}

// 6c — clean-room restore, as axis 3: the project file alone, an empty package
// cache, an empty HTTP cache, and the registry as the only source. The HTTP
// cache is NuGet's machine-wide copy of registry answers; sharing it, this
// "fresh consumer" was told a version published minutes ago did not exist
// while nuget.org already served it — a machine's history, not a consumer's.
const netRoom = mkdtempSync(join(tmpdir(), "vivarium-consumption-net-"));
try {
  writeFileSync(join(netRoom, "StageHost.csproj"), stageCsproj);
  writeFileSync(
    join(netRoom, "NuGet.Config"),
    `<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n  <packageSources>\n    <clear />\n` +
      `    <add key="nuget.org" value="${NUGET_REGISTRY}" protocolVersion="3" />\n  </packageSources>\n</configuration>\n`,
  );
  const r = spawnSync("dotnet", ["restore", "StageHost.csproj"], {
    cwd: netRoom,
    encoding: "utf8",
    timeout: 300_000,
    env: { ...process.env, NUGET_PACKAGES: join(netRoom, "packages"), NUGET_HTTP_CACHE_PATH: join(netRoom, "http-cache") },
  });
  if (r.status === 0) ok("clean-room: stage-host restores from the NuGet registry alone");
  else fail(`clean-room: dotnet restore failed (exit ${r.status}): ${`${r.stdout}${r.stderr}`.slice(-300)}`);
} finally {
  rmSync(netRoom, { recursive: true, force: true });
}

// ── summary ────────────────────────────────────────────────────────────────
const verdict = failures.length === 0 ? "PASS" : "FAIL";
console.log(
  `verify-consumption: ${verdict} — ${passCount} ok, ${warnCount} warn, ${failures.length} fail${STRICT ? " (strict)" : ""}`,
);
process.exit(failures.length === 0 ? 0 : 1);
