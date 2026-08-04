/**
 * 갤러리 정적 인덱스 생성기 (설계 §1) — exhibits/<name>/exhibit.ts(메타)와
 * exhibits/<name>/runs/(아카이브)를 스캔해 `index/gallery.html` 을 생성한다.
 * 산출물은 서버 없이(파일 직접 열람) 동작하는 전시 표면이다 — 각 run 의
 * final.html 이 자립형 뷰어이므로 인덱스도 정적 링크만 필요하다.
 *
 * Library + CLI 겸용 (smoke 가 buildIndex() 를 결정적으로 단언한다).
 * Usage: node index/build-index.ts [--generated-at <iso>]
 *
 * **산출물은 결정적이다** — 같은 입력이면 같은 바이트다. 이 파일은 커밋되고,
 * 게이트를 돌 때마다 재생성되므로, 생성 시각 같은 입력 무관 값을 박으면 게이트를
 * 한 번 돌 때마다 워킹트리가 더러워진다. 커밋 직전에 게이트를 돌리는 것이 이
 * 리포의 관례이니, 그때마다 무의미한 diff 를 사람이 커밋하거나 되돌려야 한다 —
 * "게이트를 돌렸더니 커밋할 것이 생겼다"는 잘못된 신호다. 입력이 같으면 바이트가
 * 같아야 한다는 것은 이 패밀리가 fingerprint·canonicalization 에서 이미 지키는
 * 규율이기도 하다.
 *
 * 배포 시각이 필요하면 `--generated-at` 으로 주입한다 — Pages 워크플로가 배포
 * 시점에 넘기며, 그 산출물은 커밋되지 않는다.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExhibitDefinition } from "../host/exhibit-schema.ts";

const galleryRoot = normalize(join(fileURLToPath(import.meta.url), "..", ".."));

interface RunEntry {
  dir: string; // runs/<name>
  label: string;
  gate: "PASS" | "FAIL" | "없음";
  hasScreenshot: boolean;
  turnCount: number | null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface BuildIndexOptions {
  /**
   * Deploy timestamp to show in the footer. Omit for the committed artifact —
   * the default output carries no clock reading, so it is byte-identical for
   * byte-identical inputs.
   */
  generatedAt?: string;
}

export async function buildIndex(options: BuildIndexOptions = {}): Promise<string> {
  const exhibitsDir = join(galleryRoot, "exhibits");
  const names = readdirSync(exhibitsDir).filter((n) => {
    try {
      return statSync(join(exhibitsDir, n)).isDirectory() && existsSync(join(exhibitsDir, n, "exhibit.ts"));
    } catch {
      return false;
    }
  });

  const sections: string[] = [];
  for (const name of names.sort()) {
    const exhibit: ExhibitDefinition = (
      await import(pathToFileURL(join(exhibitsDir, name, "exhibit.ts")).href)
    ).default;

    const runsDir = join(exhibitsDir, name, "runs");
    const runs: RunEntry[] = [];
    if (existsSync(runsDir)) {
      for (const runName of readdirSync(runsDir).sort().reverse()) {
        const runPath = join(runsDir, runName);
        if (!statSync(runPath).isDirectory()) continue;
        let gate: RunEntry["gate"] = "없음";
        if (existsSync(join(runPath, "rollback.json"))) {
          try {
            gate = JSON.parse(readFileSync(join(runPath, "rollback.json"), "utf8")).passed ? "PASS" : "FAIL";
          } catch {
            gate = "FAIL";
          }
        }
        let turnCount: number | null = null;
        if (existsSync(join(runPath, "turns.json"))) {
          try {
            turnCount = JSON.parse(readFileSync(join(runPath, "turns.json"), "utf8")).metrics?.turns?.length ?? null;
          } catch {
            turnCount = null;
          }
        }
        runs.push({
          dir: runName,
          label: runName,
          gate,
          hasScreenshot: existsSync(join(runPath, "screenshot.png")),
          turnCount,
        });
      }
    }

    const runCards = runs.length === 0
      ? `<p class="empty">아직 아카이브된 run 이 없습니다.</p>`
      : runs
          .map((r) => {
            const base = `../exhibits/${name}/runs/${r.dir}`;
            const badgeClass = r.gate === "PASS" ? "pass" : r.gate === "FAIL" ? "fail" : "none";
            const shot = r.hasScreenshot
              ? `<a href="${base}/final.html"><img src="${base}/screenshot.png" alt="${escapeHtml(r.label)} screenshot" loading="lazy" /></a>`
              : "";
            return `<article class="run">
  ${shot}
  <div class="run-meta">
    <b>${escapeHtml(r.label)}</b>
    <span class="badge ${badgeClass}">롤백 게이트 ${r.gate}</span>
    <span>${r.turnCount === null ? "" : `${r.turnCount}턴`}</span>
    <nav><a href="${base}/final.html">최종 결과</a> · <a href="${base}/RUN.md">RUN.md</a> · <a href="${base}/turns.json">turns</a></nav>
  </div>
</article>`;
          })
          .join("\n");

    sections.push(`<section class="exhibit">
  <h2>${escapeHtml(exhibit.meta.title)} <code>${escapeHtml(name)}</code></h2>
  <p>${escapeHtml(exhibit.meta.description)} — <a href="../exhibits/${name}/scenario.md">scenario.md</a></p>
  <div class="runs">${runCards}</div>
</section>`);
  }

  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>vivarium gallery</title>
  <link rel="icon" href="data:," />
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 2rem 1.5rem; background: #f6f7f9; color: #1c1f24; max-width: 1080px; margin-inline: auto; }
    h1 { font-size: 1.4rem; margin: 0 0 0.3rem; }
    .sub { color: #57606e; font-size: 0.9rem; margin: 0 0 1.5rem; }
    .exhibit { background: #fff; border: 1px solid #d8dbe0; border-radius: 10px; padding: 1rem 1.2rem; margin-bottom: 1.2rem; }
    .exhibit h2 { font-size: 1.05rem; margin: 0 0 0.3rem; }
    .exhibit h2 code { font-size: 0.75rem; color: #57606e; font-weight: 400; }
    .exhibit > p { font-size: 0.85rem; color: #454c58; margin: 0 0 0.8rem; }
    .runs { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.8rem; }
    .run { border: 1px solid #e3e6ec; border-radius: 8px; overflow: hidden; }
    .run img { display: block; width: 100%; aspect-ratio: 16/10; object-fit: cover; object-position: top; border-bottom: 1px solid #e3e6ec; }
    .run-meta { padding: 0.6rem 0.7rem; font-size: 0.78rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .badge { align-self: flex-start; border-radius: 999px; padding: 0.05rem 0.5rem; font-weight: 600; }
    .badge.pass { background: #e2f3e2; color: #1c6b1c; }
    .badge.fail { background: #fbe4e4; color: #b02a2a; }
    .badge.none { background: #eceef1; color: #57606e; }
    .run-meta nav a { color: #2a5bd7; text-decoration: none; }
    .empty { font-size: 0.8rem; color: #8a919c; }
    footer { font-size: 0.75rem; color: #8a919c; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <h1>vivarium gallery</h1>
  <p class="sub">채팅 지시로 런타임 UI 를 변경·롤백한 실행들의 아카이브 — 각 run 의 최종 결과는 서버·키 없이 열람 가능한 자립형 페이지입니다.</p>
${sections.join("\n")}
  <footer>생성: build-index.ts${options.generatedAt ? ` · ${escapeHtml(options.generatedAt)}` : ""}</footer>
</body>
</html>
`;
  const outPath = join(galleryRoot, "index", "gallery.html");
  writeFileSync(outPath, html);
  return outPath;
}

// ── CLI ──────────────────────────────────────────────────────────────────
const entry = process.argv[1]?.replace(/\\/g, "/").split("/").pop();
if (entry && import.meta.url.endsWith(entry)) {
  const at = process.argv.indexOf("--generated-at");
  const generatedAt = at === -1 ? undefined : process.argv[at + 1];
  console.log(`generated: ${await buildIndex({ generatedAt })}`);
}
