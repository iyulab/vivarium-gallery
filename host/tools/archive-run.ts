/**
 * run 아카이버 (설계 §3) — 실행 1회의 산출물 세트를
 * `exhibits/<name>/runs/<yyyymmdd>-<label>/` 에 남긴다. 이것이 파일시스템에
 * 남아 전시 효과를 갖는 "전시물"의 실체다.
 *
 *   turns.json     — /agent/history(계보) + /agent/metrics(턴 비용) 원장
 *   artifacts/     — 최종 라이브 아티팩트 원본 (.js mount 모듈)
 *   final.html     — **자립형 뷰어**: 아티팩트 소스 + capability 스냅샷을
 *                    인라인 — API 키·서버 없이 브라우저로 열람 가능
 *   rollback.json  — 롤백 공통 게이트 기록 (rollback-gate.ts 산출물 복사)
 *   RUN.md         — 실행 요약 (전시물·모델·턴 비용 표·게이트 판정)
 *   screenshot.png — 실행 주체가 별도 캡처해 같은 디렉터리에 두는 관례
 *
 * capability 스냅샷: exhibit 모듈을 서버 측에서 import 해 각 handler를
 * 아카이브 시점에 1회 invoke 한 결과의 JSON. mount 계약(root, api.invoke)
 * 만으로 재생하므로 @vivariumjs/runtime 도 불필요하다 — 전시물은 스냅샷
 * 데이터로 렌더되는 정적 표본이지, 라이브 시스템의 대체가 아니다.
 *
 * Usage: node archive-run.ts --exhibit <name> --label <model-label>
 *          [--base http://localhost:8890] [--rollback <rollback.json>]
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExhibitDefinition } from "../exhibit-schema.ts";

const galleryRoot = normalize(join(fileURLToPath(import.meta.url), "..", "..", ".."));

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const exhibitName = arg("--exhibit");
const label = arg("--label");
const base = arg("--base") ?? "http://localhost:8890";
const rollbackPath = arg("--rollback");
if (!exhibitName || !label || !/^[a-z0-9-]+$/.test(exhibitName)) {
  console.error("Usage: node archive-run.ts --exhibit <name> --label <model-label> [--base url] [--rollback <rollback.json>]");
  process.exit(2);
}

const exhibit: ExhibitDefinition = (
  await import(pathToFileURL(join(galleryRoot, "exhibits", exhibitName, "exhibit.ts")).href)
).default;

async function get(path: string): Promise<any> {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`GET ${path} — HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── 수집 ─────────────────────────────────────────────────────────────────
const [history, metrics, live] = await Promise.all([
  get("/agent/history"),
  get("/agent/metrics"),
  get(`/stage/targets/${exhibit.target}/artifacts`),
]);
const artifacts: Record<string, string> = live.artifacts;

// capability 스냅샷 — 아카이브 시점 1회 invoke.
const capSnapshot: Record<string, unknown> = {};
for (const cap of exhibit.capabilities) {
  capSnapshot[cap.descriptor.name] = await cap.handler({});
}

// ── 디렉터리 ─────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const runDir = join(galleryRoot, "exhibits", exhibitName, "runs", `${stamp}-${label}`);
mkdirSync(join(runDir, "artifacts"), { recursive: true });

// ── turns.json ───────────────────────────────────────────────────────────
writeFileSync(join(runDir, "turns.json"), JSON.stringify({ history, metrics }, null, 2));

// ── artifacts/ ───────────────────────────────────────────────────────────
for (const [artifactId, content] of Object.entries(artifacts)) {
  writeFileSync(join(runDir, "artifacts", `${artifactId}.js`), content);
}

// ── rollback.json ────────────────────────────────────────────────────────
if (rollbackPath && existsSync(rollbackPath)) {
  copyFileSync(rollbackPath, join(runDir, "rollback.json"));
}

// ── final.html — 자립형 뷰어 ─────────────────────────────────────────────
// JSON 문자열의 `<` 를 < 로 이스케이프해 </script> 조기 종결을 차단.
const inline = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");
const primary = artifacts[exhibit.primaryArtifactId] ?? Object.values(artifacts)[0] ?? "";
const finalHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${exhibit.meta.name} · ${stamp}-${label} — vivarium gallery run</title>
  <link rel="icon" href="data:," />
  <style>
    body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 0; background: #f6f7f9; color: #1c1f24; }
    header { padding: 0.8rem 1rem; font-size: 0.85rem; border-bottom: 1px solid #d8dbe0; background: #fff; }
    header b { font-size: 1rem; }
    header .note { color: #666; }
    #root { padding: 0.5rem; }
    #error { color: #d64545; padding: 1rem; white-space: pre-wrap; }
  </style>
</head>
<body>
  <header>
    <b>${exhibit.meta.title}</b> — run ${stamp}-${label}
    <div class="note">자립형 아카이브 뷰어 · capability 값은 아카이브 시점 스냅샷 · ${exhibit.meta.description}</div>
  </header>
  <div id="root"></div>
  <div id="error" hidden></div>
  <script type="module">
    const ARTIFACT_SOURCE = ${inline(primary)};
    const CAP_SNAPSHOT = ${inline(capSnapshot)};
    const api = {
      invoke: async (name) => {
        if (!(name in CAP_SNAPSHOT)) throw new Error("capability not in snapshot: " + name);
        return structuredClone(CAP_SNAPSHOT[name]);
      },
    };
    try {
      // data: URL import — blob: 과 달리 file:// 로 연 자립형 페이지에서도 동작.
      const url = "data:text/javascript," + encodeURIComponent(ARTIFACT_SOURCE);
      const { default: mount } = await import(url);
      await mount(document.getElementById("root"), api);
    } catch (err) {
      const el = document.getElementById("error");
      el.hidden = false;
      el.textContent = "render failed: " + (err?.stack ?? err);
    }
  </script>
</body>
</html>
`;
writeFileSync(join(runDir, "final.html"), finalHtml);

// ── RUN.md ───────────────────────────────────────────────────────────────
const turnRows = (metrics.turns ?? [])
  .map((t: any) => {
    const tokens = t.outputTokens === null ? "n/a" : `${t.inputTokens}/${t.outputTokens}`;
    return `| ${t.turn} | ${t.endpoint} | ${t.status} | ${(t.latencyMs / 1000).toFixed(1)}s | ${t.attempts ?? "—"} | ${tokens} | ${t.artifactBytes ?? "—"}B |`;
  })
  .join("\n");
const rollbackNote = rollbackPath && existsSync(rollbackPath)
  ? (() => {
      const r = JSON.parse(readFileSync(rollbackPath, "utf8"));
      return `**${r.passed ? "PASS" : "FAIL"}** — rolledBack=${r.checks.rolledBack} byteIdentical=${r.checks.byteIdentical} lineage=${r.checks.lineageConsistent} reapplied=${r.checks.reapplied} (${r.verifiedAt})`;
    })()
  : "기록 없음 (게이트 미수행 — 완주 아님)";

writeFileSync(
  join(runDir, "RUN.md"),
  `# run ${stamp}-${label} — ${exhibit.meta.name}

- 전시물: ${exhibit.meta.title} (${exhibit.meta.domain})
- 모델/조건: ${label}
- 아카이브 시각: ${new Date().toISOString()}
- 세션: ${history.session ? JSON.stringify(history.session) : "없음"}

## 턴 비용 (GET /agent/metrics)

| 턴 | endpoint | status | 지연 | attempts | tokens(in/out) | artifact |
| --- | --- | --- | --- | --- | --- | --- |
${turnRows || "| — | — | — | — | — | — | — |"}

## 롤백 공통 게이트

${rollbackNote}

## 파일

- \`final.html\` — 자립형 뷰어 (서버·키 불필요)
- \`artifacts/\` — 최종 아티팩트 원본
- \`turns.json\` — 계보 + 턴 비용 원장
- \`rollback.json\` — 게이트 기록
- \`screenshot.png\` — 실행 주체가 캡처 (없으면 미캡처)
`,
);

console.log(`archived: ${runDir}`);
