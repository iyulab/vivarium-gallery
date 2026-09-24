/**
 * run 재검증 — 아카이브된 run 의 주장을 **보관된 문서만으로** 다시 확인한다.
 * 서버·모델·키가 필요 없다: 받는 것은 `documents.json` 과 `turns.json`, 쓰는 것은
 * 레지스트리의 `@vivariumjs/changeset` 뿐이다.
 *
 * 확인하는 것:
 *   1. 턴마다 보관된 changeset 이 스펙대로 유효하고(validate) 지문이 내용과 맞는다.
 *   2. 계보(`turns.json`)가 턴에 적은 지문 = 그 턴의 문서 지문 — 계보가 이 문서를 말한다.
 *   3. stage 에 보낸 문서마다 유효 · 지문 일치 · 어느 턴의 문서와 같은 지문
 *      (에이전트가 만든 것이 보내졌다) · 승인 레코드마다 그 지문을 정확히 가리킨다.
 *
 * 문서를 보관하기 전에 아카이브된 run 은 **실패가 아니라 «재검증 불가»** 다 —
 * 굳은 과거는 막지 않고 적는다(아카이브가 되돌릴 수 있는 마지막 순간이었고, 그 뒤로는
 * 그 문서를 아무도 다시 만들 수 없다).
 *
 * Usage: node host/tools/reverify-run.ts [<run-dir> ...]   (생략: 모든 전시물의 모든 run)
 * Exit 0 when every run that can be re-verified is; 1 otherwise.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { validate, verifyFingerprint } from "@vivariumjs/changeset";

const galleryRoot = normalize(join(fileURLToPath(import.meta.url), "..", "..", ".."));

export type RunVerdict =
  | { run: string; status: "verified"; checks: number }
  | { run: string; status: "unverifiable"; reason: string }
  | { run: string; status: "failed"; problems: string[] };

type Doc = Record<string, unknown>;

export function reverifyRun(runDir: string): RunVerdict {
  const run = relative(galleryRoot, runDir).replace(/\\/g, "/");
  const documentsPath = join(runDir, "documents.json");
  if (!existsSync(documentsPath)) {
    return { run, status: "unverifiable", reason: "archived before runs kept their documents — only the recorded verdicts remain" };
  }
  const documents = JSON.parse(readFileSync(documentsPath, "utf8")) as {
    turns?: Array<{ turn: number; changeset: Doc | null }>;
    stageSubmissions?: Array<{ target: string; changeset: unknown; status: number }>;
  };
  const turnsPath = join(runDir, "turns.json");
  const lineage = existsSync(turnsPath)
    ? ((JSON.parse(readFileSync(turnsPath, "utf8")).history?.history ?? []) as Array<{ turn: number; status: string; fingerprint: string | null }>)
    : [];

  const problems: string[] = [];
  let checks = 0;
  const judgeDoc = (where: string, doc: unknown): string | null => {
    if (typeof doc !== "object" || doc === null) {
      problems.push(`${where}: not a changeset document`);
      return null;
    }
    const result = validate(doc);
    checks++;
    if (!result.valid) problems.push(`${where}: invalid — ${result.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
    checks++;
    if (!verifyFingerprint(doc as Doc)) problems.push(`${where}: fingerprint does not match the contents`);
    const fp = (doc as Doc).fingerprint;
    return typeof fp === "string" ? fp : null;
  };

  const turnFingerprints = new Set<string>();
  for (const t of documents.turns ?? []) {
    if (t.changeset === null) continue; // exhausted turn: nothing was produced
    const fp = judgeDoc(`turn ${t.turn}`, t.changeset);
    if (fp) turnFingerprints.add(fp);
  }
  for (const record of lineage.filter((r) => r.status === "validated")) {
    checks++;
    if (!record.fingerprint || !turnFingerprints.has(record.fingerprint)) {
      problems.push(`lineage turn ${record.turn}: names ${record.fingerprint}, which no kept document carries`);
    }
  }
  (documents.stageSubmissions ?? []).forEach((s, i) => {
    const where = `stage submission ${i + 1} (${s.target}, HTTP ${s.status})`;
    const fp = judgeDoc(where, s.changeset);
    if (!fp) return;
    checks++;
    if (!turnFingerprints.has(fp)) problems.push(`${where}: ${fp} is no turn's document — something other than the agent's output was sent`);
    const approvals = ((s.changeset as Doc).approvals ?? []) as Array<{ fingerprint?: unknown }>;
    approvals.forEach((a, j) => {
      checks++;
      if (a.fingerprint !== fp) problems.push(`${where}: approval ${j + 1} names ${String(a.fingerprint)}, not the document it rides on`);
    });
  });

  return problems.length === 0 ? { run, status: "verified", checks } : { run, status: "failed", problems };
}

function allRuns(): string[] {
  const exhibits = join(galleryRoot, "exhibits");
  const out: string[] = [];
  for (const exhibit of readdirSync(exhibits, { withFileTypes: true })) {
    const runs = join(exhibits, exhibit.name, "runs");
    if (!exhibit.isDirectory() || !existsSync(runs)) continue;
    for (const run of readdirSync(runs, { withFileTypes: true })) if (run.isDirectory()) out.push(join(runs, run.name));
  }
  return out.sort();
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  const targets = process.argv.slice(2).map((p) => normalize(join(process.cwd(), p)));
  const verdicts = (targets.length > 0 ? targets : allRuns()).map(reverifyRun);
  for (const v of verdicts) {
    if (v.status === "verified") console.log(`ok   - ${v.run}: re-verified from its kept documents (${v.checks} checks)`);
    else if (v.status === "unverifiable") console.log(`info - ${v.run}: cannot be re-verified — ${v.reason}`);
    else {
      console.log(`FAIL - ${v.run}`);
      for (const p of v.problems) console.log(`       ${p}`);
    }
  }
  const failed = verdicts.filter((v) => v.status === "failed").length;
  const unverifiable = verdicts.filter((v) => v.status === "unverifiable").length;
  console.log(
    `\nreverify-run: ${verdicts.length - failed - unverifiable} verified, ${unverifiable} cannot be re-verified, ${failed} failed`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}
