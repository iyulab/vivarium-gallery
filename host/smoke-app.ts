/**
 * The app, judged on a real screen.
 *
 * Every other gate here talks to the host over HTTP and reads JSON. That covers the
 * contract and misses the thing a consumer actually gets: a proposal can be applied,
 * the ledger can be correct, and the canvas can be blank. The HANDOFF has carried
 * `host/app.ts` as an uncovered surface since cycle-175 with the note "verified by
 * running it by hand" — this is that hand, written down.
 *
 * What it drives is the loop a person walks: open the exhibit, ask for a change,
 * look at the review, approve, watch the screen change, roll it back. Each step is
 * judged on what the screen shows, not on what the host reported, and the two are
 * compared where they should agree.
 *
 * The generated UI lives in a sandboxed iframe with an opaque origin. The host
 * document cannot read into it — that is the sandbox doing its job — so these
 * assertions read it as a frame. No host-side check can substitute: that is
 * precisely the gap this gate exists to close.
 *
 * Needs a browser on the machine (Chrome, Edge, or Chromium). It drives the one
 * already installed and downloads nothing.
 */

import { click, open, sandboxText, shutdown, textOf, until } from "./tools/browser.ts";
import exhibit from "../exhibits/dashboard/exhibit.ts";

// The host serves the app under /host/, not at the root — the same URL its startup
// line prints. A gate that guesses the root gets a 404 page and blames the app.
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const APP_URL = `${BASE.replace(/\/$/, "")}/host/index.html`;
const TOTAL = 7;

let passCount = 0;
const failures: string[] = [];

function ok(n: number, desc: string): void {
  passCount++;
  console.log(`ok ${n} - ${desc}`);
}
function fail(n: number, desc: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  failures.push(`${n} - ${desc}\n    ${message.replace(/\n/g, "\n    ")}`);
  console.log(`not ok ${n} - ${desc}`);
  console.log(`  ${message.replace(/\n/g, "\n  ")}`);
}

/**
 * This gate shares its stage target with the other gates — `dashboard` is the
 * exhibit's own name, not a per-gate one — and it runs last, so it used to open
 * the app on whatever the run before it had left behind. The app is right to be
 * conditional there (it refuses to reseed over applied work), but that makes
 * *this* gate's starting screen a function of gate order: land on a target with
 * an applied change and the canvas is not the seed, which is what assertions 5
 * and 7 compare against.
 *
 * So the gate establishes its own precondition instead of inheriting one. Seeding
 * is idempotent (`POST /targets` writes the world outright), the payload is the
 * exhibit's own definition rather than a copy, and doing it here — before the app
 * loads — means the app's conditional path sees exactly the state this gate
 * intends. A gate that flickers with the order it runs in is worse than no gate.
 */
async function resetToSeed(): Promise<void> {
  // What was inherited is worth saying out loud rather than just overwriting. The
  // coupling this reset removes is invisible otherwise — "the gate passed" reads the
  // same whether it started from the seed or from someone else's applied change.
  const before = await fetch(`${BASE.replace(/\/$/, "")}/stage/targets/${exhibit.target}/artifacts`);
  if (before.ok) {
    const live = (await before.json())?.artifacts ?? {};
    const ids = Object.keys(exhibit.artifacts);
    const same =
      ids.length === Object.keys(live).length && ids.every((id) => live[id] === exhibit.artifacts[id]);
    console.log(
      same
        ? `# 시작 상태: 타깃 '${exhibit.target}' 이 시드와 같다 (초기화는 무변경)`
        : `# 시작 상태: 타깃 '${exhibit.target}' 이 시드와 다르다 — 앞선 게이트가 남긴 것을 물려받았다. 초기화한다`,
    );
  }
  const res = await fetch(`${BASE.replace(/\/$/, "")}/stage/targets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target: exhibit.target,
      artifacts: exhibit.artifacts,
      ...(exhibit.schema ? { schema: exhibit.schema } : {}),
      ...(exhibit.data ? { data: exhibit.data } : {}),
    }),
  });
  if (!res.ok) throw new Error(`시드 초기화 실패 — POST /stage/targets ${res.status} ${await res.text()}`);
}

async function main(): Promise<void> {
  await resetToSeed();
  const session = await open(APP_URL);
  const { page } = session;
  let n = 1;

  try {
    // ── 1. 마운트 — 생성 UI 가 샌드박스 안에서 실제로 그려진다 ────────────────
    try {
      // 기다리는 대상은 «아무 글자»가 아니라 **시드가 선언한 것**이다. 게스트 모듈이
      // 마운트되기 전의 프레임은 전시물이 아닌 글자를 잠깐 담을 수 있고(실측: 샌드박스
      // 부트스트랩 소스), «비어 있지 않음»까지만 기다리면 그것이 캔버스로 판정됐다.
      // 총량 하한이 아닌 것도 같은 이유다 — 총량은 값이 전부 빠진 화면도 통과시킨다(cycle-162).
      let seen = "";
      await until("the canvas to mount the seed's Revenue card", session, () =>
        sandboxText(page, "#canvas").then((t) => {
          seen = t;
          return t.includes("Revenue") ? t : "";
        }),
      ).catch((e: Error) => {
        throw new Error(`시드 화면에 시드가 선언한 카드가 없다 — 본문: ${JSON.stringify(seen.slice(0, 200))} (${e.message})`);
      });
      if (session.faults.length > 0) {
        throw new Error(`마운트 중 페이지 결함: ${session.faults.join(" | ")}`);
      }
      ok(n, "생성 UI 가 샌드박스 iframe 안에서 그려진다 — 호스트 JSON 이 아니라 화면이 증거다");
    } catch (err) {
      fail(n, "생성 UI 가 샌드박스 iframe 안에서 그려진다 — 호스트 JSON 이 아니라 화면이 증거다", err);
    }

    // ── 2. 시드 상태 표지 ────────────────────────────────────────────────────
    n = 2;
    try {
      const seed = await until("the seed-state line", session, () => textOf(page, "#seed-state-text"));
      // 이 게이트가 시작 상태를 확정했으므로(위 resetToSeed) 호스트가 무엇을 말해야
      // 하는지도 확정돼 있다. "비어 있지 않다"는 세 분기를 전부 통과시켰고, 그중 둘은
      // 이 게이트의 나머지 단언이 기대하는 화면이 아니다.
      if (!seed.includes("시드 상태입니다")) {
        throw new Error(
          `시드로 초기화한 타깃인데 호스트가 시드 상태라고 말하지 않는다 — 본문: ${JSON.stringify(seed.trim().slice(0, 120))}`,
        );
      }
      ok(n, `호스트가 시드 상태를 화면에 말한다 — "${seed.trim().slice(0, 60)}"`);
    } catch (err) {
      fail(n, "호스트가 시드 상태를 화면에 말한다", err);
    }

    // ── 3. 제안 — 한 턴이 검토 화면을 세운다 ────────────────────────────────
    n = 3;
    try {
      await page.fill("#chat-input", "대시보드에 지표 카드를 하나 추가해 줘");
      await click(page, "#send-btn");
      // 앱 자신이 «준비됐다»고 말할 때까지 기다린다. 중간 산출물(검토 칸의 텍스트,
      // 프리뷰의 첫 렌더)을 기다리면 턴이 끝나기 전에 깨어나고, 그 뒤의 클릭은
      // 앱이 아직 세우지 않은 상태를 누르게 된다 — 이 게이트의 첫 판이 그렇게 흔들렸다.
      // 상태 줄은 앱이 공개적으로 내는 신호이므로, 그것을 기다리는 것이 곧 계약을 쓰는 것이다.
      await until(
        "the app to say the preview is ready",
        session,
        () => textOf(page, "#status").then((t) => (t.includes("프리뷰 준비됨") ? t : "")),
        60_000,
      );
      const review = await textOf(page, "#review");
      // 검토 화면은 **무엇이 바뀌는지**를 말해야 한다(스펙 §5.2 의 review-representable).
      if (!/New Metric/.test(review)) {
        throw new Error(`검토 화면이 바뀌는 내용을 보이지 않는다 — ${JSON.stringify(review.slice(0, 300))}`);
      }
      if (await page.isDisabled("#approve-btn")) {
        throw new Error("제안이 섰는데 승인 버튼이 비활성이다");
      }
      ok(n, "한 턴이 검토 화면을 세우고 **무엇이 바뀌는지** 보인다 — 승인이 열린다");
    } catch (err) {
      fail(n, "한 턴이 검토 화면을 세우고 **무엇이 바뀌는지** 보인다 — 승인이 열린다", err);
    }

    // ── 4. 프리뷰 — 승인 전에 브랜치 화면을 본다 ────────────────────────────
    n = 4;
    try {
      const preview = await until("the preview frame", session, () => sandboxText(page, "#preview"));
      if (!preview.includes("New Metric")) {
        throw new Error(`프리뷰에 새 카드가 없다 — ${JSON.stringify(preview.slice(0, 200))}`);
      }
      // 프리뷰가 선 동안 **라이브는 그대로**여야 한다(fault-model F1 — 스테이징은 라이브를 건드리지 않는다).
      const live = await sandboxText(page, "#canvas");
      if (live.includes("New Metric")) {
        throw new Error("프리뷰만 서야 하는데 라이브 캔버스가 이미 바뀌었다");
      }
      ok(n, "프리뷰가 브랜치를 그리고 **라이브 캔버스는 그대로다** (스테이징은 라이브를 건드리지 않는다)");
    } catch (err) {
      fail(n, "프리뷰가 브랜치를 그리고 **라이브 캔버스는 그대로다** (스테이징은 라이브를 건드리지 않는다)", err);
    }

    // ── 5. 승인 — 라이브 화면이 실제로 바뀐다 ───────────────────────────────
    n = 5;
    try {
      await click(page, "#approve-btn");
      const live = await until(
        "the live canvas to show the approved change",
        session,
        () => sandboxText(page, "#canvas").then((t) => (t.includes("New Metric") ? t : "")),
        60_000,
      );
      if (!live.includes("Revenue")) {
        throw new Error(`적용이 기존 카드를 잃었다 — ${JSON.stringify(live.slice(0, 200))}`);
      }
      ok(n, "승인 뒤 **라이브 화면**이 바뀐다 — 더한 것이 보이고 있던 것이 남는다");
    } catch (err) {
      fail(n, "승인 뒤 **라이브 화면**이 바뀐다 — 더한 것이 보이고 있던 것이 남는다", err);
    }

    // ── 6. 원장 — 화면이 방금 일어난 일을 적는다 ────────────────────────────
    n = 6;
    try {
      const ledger = await until("the ledger to record the apply", session, () =>
        textOf(page, "#ledger-list").then((t) => (/apply/i.test(t) ? t : "")),
      );
      ok(n, `원장 화면이 apply 를 적는다 — "${ledger.trim().split("\n")[0].slice(0, 60)}"`);
    } catch (err) {
      fail(n, "원장 화면이 apply 를 적는다", err);
    }

    // ── 7. 롤백 — 화면이 되돌아온다 ─────────────────────────────────────────
    n = 7;
    try {
      if (await page.isDisabled("#rollback-btn")) throw new Error("적용 뒤인데 롤백 버튼이 비활성이다");
      await click(page, "#rollback-btn");
      const live = await until(
        "the live canvas to return to the seed",
        session,
        () => sandboxText(page, "#canvas").then((t) => (t.includes("New Metric") ? "" : t)),
        60_000,
      );
      if (!live.includes("Revenue")) {
        throw new Error(`롤백이 시드 화면을 되돌리지 못했다 — ${JSON.stringify(live.slice(0, 200))}`);
      }
      ok(n, "롤백 뒤 **화면이 시드로 되돌아온다** — 더한 카드는 사라지고 시드는 남는다");
    } catch (err) {
      fail(n, "롤백 뒤 **화면이 시드로 되돌아온다** — 더한 카드는 사라지고 시드는 남는다", err);
    }

    // 페이지가 조용히 터지고 있었다면 위 단언들이 초록이어도 그것은 결함이다.
    if (session.faults.length > 0) {
      failures.push(`page faults (전 구간): ${session.faults.join(" | ")}`);
      console.log(`  page faults: ${session.faults.join(" | ")}`);
    }
    // 5xx 는 어떤 자리에서도 답이 아니다. 404 는 답이다 — 앱은 매 로드마다 "이 타깃이
    // 이미 있는가"를 묻고, 없음은 정상 대답이다. 그 질문이 500 으로 돌아오던 것을
    // 이 게이트가 처음 잡았고(stage-host 가 어댑터 throw 를 Kestrel 까지 흘렸다),
    // 그래서 여기 단언이 상태 코드로 서 있다.
    const serverErrors = session.httpFailures.filter((f) => f.status >= 500);
    if (serverErrors.length > 0) {
      const rendered = serverErrors.map((f) => `${f.status} ${f.method} ${f.url}`).join(" | ");
      failures.push(`5xx 응답: ${rendered}`);
      console.log(`  5xx 응답: ${rendered}`);
    }
  } finally {
    await session.close();
    await shutdown();
  }

  console.log(
    failures.length === 0
      ? `smoke-app: ${passCount}/${TOTAL} PASS`
      : `smoke-app: ${passCount}/${TOTAL} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
