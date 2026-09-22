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

async function main(): Promise<void> {
  const session = await open(APP_URL);
  const { page } = session;
  let n = 1;

  try {
    // ── 1. 마운트 — 생성 UI 가 샌드박스 안에서 실제로 그려진다 ────────────────
    try {
      const canvas = await until("the canvas to mount the exhibit", session, () =>
        sandboxText(page, "#canvas").then((t) => (t.trim().length > 0 ? t : "")),
      );
      // 시드 대시보드는 카드들을 그린다. 총량 하한이 아니라 **시드가 실제로 선언한 것**을
      // 본다 — 총량은 값이 전부 빠진 화면도 통과시킨다(cycle-162 가 실측한 사각).
      if (!canvas.includes("Revenue")) {
        throw new Error(`시드 화면에 시드가 선언한 카드가 없다 — 본문: ${JSON.stringify(canvas.slice(0, 200))}`);
      }
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
      if (seed.trim().length === 0) throw new Error("시드 상태 줄이 비었다");
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
