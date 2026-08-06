/**
 * 구성 축 게이트 — storefront 전시물 고정 (아티팩트 **둘**).
 *
 * 앞선 여섯 전시물은 전부 아티팩트가 하나였다. 그래서 *"변경은 검토 가능하고 되돌릴
 * 수 있다"* 가 **화면 하나짜리 앱에서만** 증명돼 있었다.
 *
 * 착수 전 실측이 이 게이트의 모양을 정했다: **라이브러리 층은 이미 아티팩트 N개를
 * 끝까지 다룬다.** 한 문서의 UI 패치 둘이 preview 에 둘 다 오르고, apply 가 둘을
 * 함께 뒤집고, rollback 이 둘 다 바이트 복귀한다(단언 1~4 가 그것을 잰다). 그러므로
 * 구성 축의 물음은 *"이 패밀리가 다중 화면을 다룰 수 있는가"* 가 아니다 — **다룰 수
 * 있고, 이 샘플 호스트가 그것을 못 본다.**
 *
 * 못 보는 방식이 요점이다: 실패가 아니라 **침묵**이다. 둘째 화면은 서고 바뀌고
 * 되돌아오는데 아무도 그리지 않고 아무도 판정하지 않는다. 단언 5·6 이 *통과가 곧
 * 결함* 어법으로 그 침묵을 고정한다.
 *
 * **수리는 이 게이트의 몫이 아니다** — 아티팩트마다 샌드박스를 세우는 일이고,
 * 선택·편집 맥락이 샌드박스를 건너야 하며, 선언 어휘에 아티팩트 축이 생겨야 한다.
 * 자기 RED 를 가진 사이클의 몫이며 여기가 그 RED 다.
 *
 * Prerequisite: stage-host (8891) + host/server.ts (8890, **--exhibit storefront**,
 * MODEL_PROVIDER 미설정 — 결정성은 scripted provider 에 의존).
 *
 * Usage: node host/smoke-compose.ts
 * Exit 0 + "smoke-compose: 6/6 PASS" on success; exit 1 otherwise.
 */

import exhibit from "../exhibits/storefront/exhibit.ts";
import { NOTE_TEXT } from "../exhibits/storefront/scripted.ts";
import { checkRender, renderFor, undeclaredArtifacts } from "./tools/render-check.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const TARGET = exhibit.target;
const PRIMARY = exhibit.primaryArtifactId;
const SECOND = Object.keys(exhibit.artifacts).find((id) => id !== PRIMARY)!;
const TOTAL = 6;

let passCount = 0;
const failures: string[] = [];

function ok(n: number, desc: string): void {
  passCount++;
  console.log(`ok ${n} - ${desc}`);
}
function fail(n: number, desc: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  failures.push(`${n} - ${desc}: ${message}`);
  console.log(`FAIL ${n} - ${desc}\n  detail: ${message}`);
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text.slice(0, 300) };
  }
  if (res.status >= 300) throw new Error(`POST ${path} — HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}
async function world(): Promise<any> {
  const res = await fetch(`${BASE}/stage/targets/${TARGET}/artifacts`);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET world — HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
async function seed(): Promise<void> {
  await post("/stage/targets", {
    target: TARGET,
    artifacts: exhibit.artifacts,
    schema: exhibit.schema,
    data: exhibit.data,
  });
}

async function main(): Promise<void> {
  let n = 0;

  // ── 1. 전제 — 이 전시물은 아티팩트가 둘이고, 두 화면이 서로 다르다 ────────
  n = 1;
  try {
    const ids = Object.keys(exhibit.artifacts);
    if (ids.length < 2) throw new Error(`아티팩트가 ${ids.length}개다 — 구성 축이 성립하지 않는다`);
    if (exhibit.artifacts[PRIMARY] === exhibit.artifacts[SECOND]) {
      throw new Error("두 아티팩트의 내용이 같다 — 하나를 잃어도 표가 나지 않는다");
    }
    await seed();
    const seeded = await world();
    const missing = ids.filter((id) => seeded.artifacts?.[id] !== exhibit.artifacts[id]);
    if (missing.length > 0) throw new Error(`시드가 착지하지 않은 아티팩트: ${missing.join(", ")}`);
    const fps = ids.filter((id) => typeof seeded.fingerprints?.[id] !== "string");
    if (fps.length > 0) throw new Error(`facet fingerprint 가 없는 아티팩트: ${fps.join(", ")}`);
    ok(n, `아티팩트 ${ids.length}개가 전부 서고 각자 fingerprint 를 갖는다 (${ids.join(" · ")})`);
  } catch (err) {
    fail(n, "아티팩트 둘이 전부 서고 각자 fingerprint 를 갖는다", err);
  }

  // ── 2. 한 턴이 **두 화면을 함께** 바꾸는 제안을 낸다 ──────────────────────
  // 화면이 하나뿐이면 저작할 수조차 없는 종류의 변경이다.
  n = 2;
  let proposal: any;
  try {
    const turn = await post("/agent/session", {
      intent: "두 화면에 같은 배송 안내를 넣어줘",
      editContext: null,
      artifacts: Object.entries(exhibit.artifacts).map(([artifactId, content]) => ({ artifactId, content })),
    });
    if (!turn.proposal) throw new Error(`no proposal — outcome=${JSON.stringify(turn.outcome?.status)}`);
    const ui = turn.proposal.changeset.patches.ui ?? [];
    const touched = new Set(ui.map((p: any) => p.artifactId));
    if (touched.size !== 2) {
      throw new Error(`한 문서가 두 아티팩트를 담지 않았다 — ${JSON.stringify([...touched])}`);
    }
    proposal = turn.proposal;
    ok(n, `한 제안이 아티팩트 ${touched.size}개를 담는다 — UI 패치 ${ui.length}건, fingerprint 하나로 봉인`);
  } catch (err) {
    fail(n, "한 제안이 두 아티팩트를 함께 담는다", err);
  }

  // ── 3. apply 가 **둘을 함께** 뒤집는다 ────────────────────────────────────
  n = 3;
  let sessionId = "";
  try {
    const approved = structuredClone(proposal.changeset);
    approved.approvals = [
      { fingerprint: proposal.fingerprint, approvedBy: "smoke-compose-reviewer", approvedAt: new Date().toISOString() },
    ];
    const proposed = await post(`/stage/targets/${TARGET}/changesets`, approved);
    sessionId = proposed.sessionId;
    const previewed = Object.keys(proposed.preview ?? {});
    if (!previewed.includes(PRIMARY) || !previewed.includes(SECOND)) {
      throw new Error(`preview 가 두 화면을 담지 않았다 — ${JSON.stringify(previewed)}`);
    }
    const applied = await post(`/stage/sessions/${sessionId}/apply`, { approvedBy: "smoke-compose-reviewer" });
    if (applied.state !== "Applied") throw new Error(`expected Applied, got ${JSON.stringify(applied)}`);
    const after = await world();
    const without = [PRIMARY, SECOND].filter((id) => !String(after.artifacts?.[id] ?? "").includes(NOTE_TEXT));
    if (without.length > 0) throw new Error(`변경이 착지하지 않은 화면: ${without.join(", ")}`);
    ok(n, "승인 하나로 apply → 두 화면이 **함께** 바뀐다 (preview 도 둘 다 담았다)");
  } catch (err) {
    fail(n, "승인 하나로 apply → 두 화면이 함께 바뀐다", err);
  }

  // ── 4. rollback 이 **둘 다** 바이트 복귀한다 ──────────────────────────────
  n = 4;
  try {
    await post(`/stage/sessions/${sessionId}/rollback`, {});
    const back = await world();
    const drifted = [PRIMARY, SECOND].filter((id) => back.artifacts?.[id] !== exhibit.artifacts[id]);
    if (drifted.length > 0) throw new Error(`바이트 복귀하지 않은 화면: ${drifted.join(", ")}`);
    ok(
      n,
      `rollback 이 두 화면을 **둘 다** 바이트 복귀시킨다 ` +
        `(${Object.values(exhibit.artifacts).reduce((s, a) => s + Buffer.byteLength(a), 0)}B)`,
    );
  } catch (err) {
    fail(n, "rollback 이 두 화면을 둘 다 바이트 복귀시킨다", err);
  }

  // ── 5. 호스트가 화면을 **전부** 안다 (cycle-173 에서 뒤집힘) ─────────────
  // 옛 단언: `/exhibit` 이 하나만 알리고 앱이 하나만 그렸다. 둘째 화면은 위 1~4 를
  // 전부 통과한 채 **어디에도 나타나지 않았다**. 이제 응답이 화면 전부를 알리고,
  // primary 는 "유일한 화면"이 아니라 **첫 화면**이다.
  n = 5;
  try {
    const res = await fetch(`${BASE}/exhibit`);
    const info = await res.json();
    const announced: string[] = info.artifactIds ?? [];
    const world = Object.keys(exhibit.artifacts);
    const missing = world.filter((id) => !announced.includes(id));
    if (missing.length > 0) {
      throw new Error(`월드에 ${world.length}개인데 /exhibit 이 알리지 않는 화면이 있다: ${missing.join(", ")}`);
    }
    if (announced[0] !== PRIMARY) {
      throw new Error(`첫 화면이 primary 가 아니다 — 선언 순서와 알림 순서가 어긋난다: ${announced.join(", ")}`);
    }
    if (info.primaryArtifactId !== PRIMARY) {
      throw new Error(`전제가 바뀌었다 — /exhibit 이 지목하는 것이 다르다: ${JSON.stringify(info.primaryArtifactId)}`);
    }
    ok(
      n,
      `호스트가 화면을 **전부** 안다 — /exhibit 이 ${announced.length}개를 알리고(${announced.join(", ")}) ` +
        `primary("${PRIMARY}")가 첫 화면이다`,
    );
  } catch (err) {
    fail(n, "호스트가 화면을 전부 안다", err);
  }

  // ── 6. 둘째 화면이 깨지면 **판정이 그것을 말한다** (cycle-173 에서 뒤집힘) ──
  // 옛 단언: 선언(`render`) 블록 하나가 전시물 전체를 대표해서, 둘째 화면의 자리는
  // **선언할 자리가 없었다**. 이제 선언이 `artifactId` 로 키를 갖고, 화면마다 하나씩
  // 선다. 그리고 선언되지 않은 화면이 몇인지도 함께 센다 — 판정이 **없는** 것과
  // 판정이 **통과한** 것은 다르고, 둘을 같은 초록으로 보이게 두지 않는다.
  n = 6;
  try {
    const uncovered = undeclaredArtifacts(exhibit);
    if (uncovered.length > 0) {
      throw new Error(
        `선언이 없는 화면이 있다(${uncovered.join(", ")}) — 이 전시물은 구성 축의 무대이므로 ` +
          `모든 화면이 선언을 가져야 한다`,
      );
    }

    // 대조군 — 시드가 화면마다 자기 선언대로 통과한다.
    for (const id of Object.keys(exhibit.artifacts)) {
      const good = await checkRender(exhibit.artifacts[id], exhibit.capabilities, renderFor(exhibit, id));
      if (!good.ok) throw new Error(`대조군(${id} 시드)이 떨어졌다 — ${good.errors.join(" | ")}`);
    }

    // 둘째 화면을 통째로 죽인다 — mount 가 아무것도 그리지 않는다.
    const deadSecond = "export default async function mount(){ /* 아무것도 그리지 않는다 */ }";
    const brokenWorld = { ...exhibit.artifacts, [SECOND]: deadSecond };
    await post("/stage/targets", {
      target: TARGET,
      artifacts: brokenWorld,
      schema: exhibit.schema,
      data: exhibit.data,
    });

    // primary 는 여전히 멀쩡하다 — 즉 primary 판정만으로는 아무것도 알 수 없다.
    const primaryStill = await checkRender(brokenWorld[PRIMARY], exhibit.capabilities, renderFor(exhibit, PRIMARY));
    if (!primaryStill.ok) {
      throw new Error(`전제가 바뀌었다 — 둘째를 죽였는데 primary 판정이 떨어졌다(${primaryStill.errors.join(" | ")})`);
    }

    // 그런데 이제 **둘째의 선언이 있고**, 그것이 죽은 화면을 잡는다.
    const secondCheck = await checkRender(brokenWorld[SECOND], exhibit.capabilities, renderFor(exhibit, SECOND));
    if (secondCheck.ok) {
      throw new Error(
        `둘째 화면을 통째로 죽였는데 그 화면의 선언이 통과했다 — 선언이 자리를 가리키지 못한다`,
      );
    }

    ok(
      n,
      `둘째 화면이 깨지면 **그 화면의 선언이 말한다** — primary 는 여전히 초록인데 ` +
        `"${SECOND}" 판정이 떨어진다("${secondCheck.errors[0]}"). 선언 ${Object.keys(exhibit.render ?? {}).length}개가 ` +
        `화면 ${Object.keys(exhibit.artifacts).length}개를 전부 덮는다`,
    );
  } catch (err) {
    fail(n, "둘째 화면이 깨지면 판정이 그것을 말한다", err);
  }

  await seed();

  console.log(
    failures.length === 0
      ? `smoke-compose: ${passCount}/${TOTAL} PASS`
      : `smoke-compose: ${passCount}/${TOTAL} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
