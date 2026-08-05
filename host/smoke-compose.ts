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
import { checkRender } from "./tools/render-check.ts";

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

  // ── 5. 그런데 **호스트는 하나만 안다** (통과가 곧 결함) ───────────────────
  // 계약이 아티팩트 **하나**를 지목하고, 호스트가 화면·프리뷰·드라이버·아카이브에서
  // 전부 그 하나만 쓴다. 둘째는 위 1~4 를 전부 통과한 채로 **어디에도 나타나지 않는다.**
  n = 5;
  try {
    const res = await fetch(`${BASE}/exhibit`);
    const info = await res.json();
    if (info.primaryArtifactId !== PRIMARY) {
      throw new Error(`전제가 바뀌었다 — /exhibit 이 지목하는 것이 다르다: ${JSON.stringify(info.primaryArtifactId)}`);
    }
    // 응답 어디에도 둘째 아티팩트의 이름이 없다. 있으면 호스트가 그것을 알기
    // 시작한 것이므로 이 단언을 뒤집어야 한다.
    if (JSON.stringify(info).includes(SECOND)) {
      throw new Error(
        `전제가 바뀌었다 — /exhibit 이 둘째 화면(${SECOND})을 알린다. 호스트가 다중 아티팩트를 ` +
          `보기 시작한 것이므로 이 단언을 **뒤집을 것**: 이제 두 화면이 다 나와야 한다`,
      );
    }
    ok(
      n,
      `호스트는 화면을 **하나만** 안다 — 월드에는 ${Object.keys(exhibit.artifacts).length}개인데 ` +
        `/exhibit 은 "${info.primaryArtifactId}" 하나만 알린다. 통과가 곧 결함`,
    );
  } catch (err) {
    fail(n, "호스트는 화면을 하나만 안다 (통과가 곧 결함)", err);
  }

  // ── 6. 둘째 화면이 **통째로 깨져도** 판정이 전부 초록 (통과가 곧 결함) ────
  // 선언(`render`)에 **아티팩트 축이 없다** — 블록 하나가 전시물 전체를 대표하고,
  // 그래서 그 안의 자리·기대 invoke 는 전부 primary 의 화면에 대한 것이다. 둘째
  // 화면의 자리는 **선언할 자리가 없고**, 없는 선언은 아무것도 판정하지 않는다.
  n = 6;
  try {
    const declared = exhibit.render ?? {};
    // 대조군 — 시드 primary 는 선언대로 통과한다.
    const good = await checkRender(exhibit.artifacts[PRIMARY], exhibit.capabilities, declared);
    if (!good.ok) throw new Error(`대조군(primary 시드)이 떨어졌다 — ${good.errors.join(" | ")}`);

    // 둘째 화면을 통째로 죽인다 — mount 가 아무것도 그리지 않는다.
    const deadSecond = "export default async function mount(){ /* 아무것도 그리지 않는다 */ }";
    const brokenWorld = { ...exhibit.artifacts, [SECOND]: deadSecond };
    await post("/stage/targets", {
      target: TARGET,
      artifacts: brokenWorld,
      schema: exhibit.schema,
      data: exhibit.data,
    });

    // 그런데 이 전시물에 대해 **돌아가는 렌더 판정**은 primary 것뿐이고, 그것은 멀쩡하다.
    const stillGreen = await checkRender(brokenWorld[PRIMARY], exhibit.capabilities, declared);
    if (!stillGreen.ok) {
      throw new Error(
        `전제가 바뀌었다 — 둘째를 죽였는데 primary 판정이 떨어졌다(${stillGreen.errors.join(" | ")})`,
      );
    }
    // 그리고 선언에는 둘째를 가리킬 어휘가 없다.
    const declaredText = JSON.stringify(declared);
    if (declaredText.includes(SECOND) || declaredText.includes("artifactId")) {
      throw new Error(
        `전제가 바뀌었다 — 선언이 아티팩트를 지목하기 시작했다(${declaredText}). ` +
          `계약에 아티팩트 축이 생긴 것이므로 이 단언을 **뒤집을 것**`,
      );
    }
    // 둘째가 실제로 죽었다는 것은 직접 확인한다 — 죽지 않았으면 이 단언은 아무것도 말하지 않는다.
    const deadCheck = await checkRender(deadSecond, exhibit.capabilities, {});
    if (deadCheck.ok) throw new Error("죽인 화면이 판정을 통과했다 — 픽스처가 아무것도 만들지 않았다");

    ok(
      n,
      `둘째 화면이 통째로 깨져도 판정이 전부 초록 — 선언에 **아티팩트 축이 없어** ` +
        `그 화면을 가리킬 어휘 자체가 없다(깨진 화면 단독 판정은 "${deadCheck.errors[0]}"). 통과가 곧 결함`,
    );
  } catch (err) {
    fail(n, "둘째 화면이 통째로 깨져도 판정이 전부 초록 (통과가 곧 결함)", err);
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
