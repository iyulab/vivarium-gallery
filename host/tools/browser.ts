/**
 * The sample's one browser driver.
 *
 * Every gate here judges host JSON. That is most of the contract and none of the
 * screen: a proposal can be applied, the ledger can be right, and the canvas can be
 * blank. Sessions have checked the screen by hand (cycle-175, cycle-184) and once
 * with a throwaway CDP script (cycle-193), which produced 44/51 on a harness that
 * scores 51/51 elsewhere — the failures were the driver's, not the code's. A
 * judgment that moves with whoever wrote this session's driver is not a judgment,
 * so there is one driver and it lives here.
 *
 * Deliberately thin. It opens a page, waits for things, reads text, and clicks —
 * the vocabulary the gates need and nothing else. Anything richer belongs in the
 * gate that needs it, where it can be read next to the assertion it serves.
 *
 * Uses the browser already installed on the machine (`channel: "chrome"`), so
 * nothing downloads a second one: `playwright-core` ships no binaries, which is
 * the reason it is the dependency rather than `playwright`.
 */

import { chromium, type Browser, type ConsoleMessage, type Page } from "playwright-core";

export interface HttpFailure {
  status: number;
  method: string;
  url: string;
}

export interface PageSession {
  page: Page;
  /**
   * Faults the page itself raised — uncaught exceptions and its own console errors.
   * A gate that ignores these is judging half the screen.
   *
   * Browser notices about a failed request ("Failed to load resource: … 404") are
   * NOT here. They arrive as prose whose only real content is a status code, and a
   * gate matching on that sentence would be reading English to learn a number it can
   * have as a number. Those go to `httpFailures`, where a gate can say what it
   * actually means — a 404 answering "does this exist yet?" is an answer, a 500 is not.
   */
  readonly faults: string[];
  /** Every response with a 4xx/5xx status, in order. */
  readonly httpFailures: HttpFailure[];
  close(): Promise<void>;
}

/** The channels to try, in order. First one that launches wins. */
const CHANNELS = ["chrome", "msedge", "chromium"] as const;

let shared: Browser | null = null;

async function browser(): Promise<Browser> {
  if (shared) return shared;
  const failures: string[] = [];
  for (const channel of CHANNELS) {
    try {
      shared = await chromium.launch({ channel, headless: true });
      return shared;
    } catch (e) {
      failures.push(`${channel}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  throw new Error(
    "no browser to drive — install Chrome, Edge, or Chromium.\n" + failures.map((f) => `  ${f}`).join("\n"),
  );
}

/**
 * Open `url` and collect what the page says about itself.
 *
 * Console errors and uncaught exceptions are collected rather than thrown on: a
 * gate decides whether a given fault is the thing under test or a defect, and a
 * driver that threw would take that decision away from it.
 */
export async function open(url: string): Promise<PageSession> {
  const b = await browser();
  // The app is one tall column. At the default 1280x720 the approve button sits
  // below the fold — and a click aimed there on the gate's first run dispatched
  // nothing while the app was working perfectly, which is the driver deciding the
  // verdict all over again (the reason this file exists). A viewport that holds the
  // whole app removes the class of question rather than answering it once.
  const context = await b.newContext({ viewport: { width: 1440, height: 1600 } });
  const page = await context.newPage();
  const faults: string[] = [];
  const httpFailures: HttpFailure[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    // The browser's own resource notice — the status is captured structurally below.
    if (m.text().startsWith("Failed to load resource")) return;
    faults.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => faults.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) httpFailures.push({ status: r.status(), method: r.request().method(), url: r.url() });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return {
    page,
    faults,
    httpFailures,
    close: async () => {
      await context.close();
    },
  };
}

/** Shut the shared browser down. A gate calls this once, at the end. */
export async function shutdown(): Promise<void> {
  if (shared) {
    await shared.close();
    shared = null;
  }
}

/**
 * Wait until `read` returns something truthy, then return it.
 *
 * The failure carries `label` and the last value seen, because "timed out" alone
 * sends the reader back to the browser to find out what the page was showing.
 */
export async function until<T>(
  label: string,
  session: PageSession,
  read: (page: Page) => Promise<T>,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  for (;;) {
    // A read that throws has not observed anything yet — it is not a value. Keeping the
    // error only for the timeout message is what stops it being returned as the answer
    // (the sentinel used to be compared against a string it never equalled, so every
    // thrown read "succeeded" with its own error text).
    let observed = false;
    try {
      last = await read(session.page);
      observed = true;
    } catch (e) {
      last = `<read threw: ${(e as Error).message}>`;
    }
    if (observed && last) return last as T;
    if (Date.now() > deadline) {
      const faults = session.faults.length > 0 ? `\n  page faults:\n${session.faults.map((f) => `    ${f}`).join("\n")}` : "";
      throw new Error(`timed out waiting for ${label} (${timeoutMs}ms) — last value: ${JSON.stringify(last)}${faults}`);
    }
    await session.page.waitForTimeout(100);
  }
}

/**
 * Click, after making sure the thing is actually there to be clicked.
 *
 * Scrolling first is not belt-and-braces: a click aimed at coordinates the page has
 * since moved is the failure that reads as "the app did nothing", and it is
 * indistinguishable from the real defect unless you go looking.
 */
export async function click(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await el.click();
}

/** Visible text of an element, or "" when it is absent. */
export const textOf = (page: Page, selector: string): Promise<string> =>
  page.locator(selector).first().innerText().catch(() => "");

/**
 * Text the generated UI is actually showing.
 *
 * The runtime mounts into a sandboxed iframe with an opaque origin, so this reads
 * it as a frame rather than through the host document — the host cannot see into
 * it, which is the point of the sandbox and the reason no host-side assertion can
 * stand in for this one.
 */
export async function sandboxText(page: Page, hostSelector: string): Promise<string> {
  const frame = page.frameLocator(`${hostSelector} iframe`);
  return frame.locator("body").innerText().catch(() => "");
}
