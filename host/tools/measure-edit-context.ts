/**
 * Edit-context size, measured — how big is the thing a host hands its editing
 * agent, and which part of it grows?
 *
 * For every exhibit artifact: mount it under jsdom with the exhibit's own
 * capability handlers (the same stand-in render-check uses), assign ids with
 * the runtime's own identity layer, and build the edit context with the
 * runtime's own builder — for two selections that bracket the range: the
 * smallest element that carries text (a leaf) and the first top-level
 * element (a container, whose text hits the 500-character cap). Then report
 * the bytes of each part.
 *
 * A measurement, not a gate: it prints a table and exits 0. What to do about
 * the numbers is a design question, and the numbers are its input.
 *
 * Usage: node host/tools/measure-edit-context.ts
 */

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { assignStableIds, buildEditContext } from "@vivariumjs/runtime/internal";
import type { EditContext, ElementDescriptor } from "@vivariumjs/runtime";
import type { ExhibitDefinition } from "../exhibit-schema.ts";

const exhibitsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "exhibits");

/** Tags a user can act on — the population an "interactive only" view would keep. */
/** The short implicit-role table the runtime guest uses; null rather than a guess. */
const IMPLICIT_ROLE: Record<string, string> = {
  a: "link", button: "button", h1: "heading", h2: "heading", h3: "heading",
  h4: "heading", h5: "heading", h6: "heading", img: "img", input: "textbox",
  li: "listitem", nav: "navigation", ol: "list", option: "option", p: "paragraph",
  progress: "progressbar", section: "region", select: "combobox", table: "table",
  tbody: "rowgroup", td: "cell", textarea: "textbox", th: "columnheader",
  thead: "rowgroup", tr: "row", ul: "list",
};

const INTERACTIVE = new Set(["a", "button", "input", "select", "textarea", "summary", "label"]);

interface Row {
  artifact: string;
  elements: number;
  interactive: number;
  source: number;
  screenIds: number;
  screenPretty: number;
  leaf: { selection: number; untrusted: number; total: number };
  container: { selection: number; untrusted: number; total: number };
}

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value));

/** The runtime's describe rule (bootstrap `describeElement`): text capped at 500, attribute values at 200. */
function describe(el: Element): ElementDescriptor {
  const attributes: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === "data-viv-id") continue;
    attributes[attr.name] = attr.value.length > 200 ? attr.value.slice(0, 200) + "…" : attr.value;
  }
  const raw = el.textContent;
  const text = raw && raw.trim().length > 0 ? (raw.length > 500 ? raw.slice(0, 500) + "…" : raw) : null;
  return { id: el.getAttribute("data-viv-id")!, tag: el.tagName.toLowerCase(), text, attributes };
}

function parts(ctx: EditContext): { selection: number; untrusted: number; total: number } {
  return { selection: bytes(ctx.selection), untrusted: bytes(ctx.untrusted), total: bytes(ctx) };
}

async function measure(artifactId: string, source: string, exhibit: ExhibitDefinition): Promise<Row | string> {
  const handlers = new Map(exhibit.capabilities.map((c) => [c.descriptor.name, c.handler]));
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`);
  const root = dom.window.document.getElementById("root")!;
  const api = {
    invoke: async (name: string, payload: unknown) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`capability not granted: ${name}`);
      return handler(payload);
    },
    on: () => () => {},
    onUnmount: () => {},
    events: [],
    capabilities: exhibit.capabilities.map((c) => c.descriptor),
    context: null,
  };
  const g = globalThis as Record<string, unknown>;
  const injected = ["document", "window", "HTMLElement", "Node", "Event", "CustomEvent", "FormData"] as const;
  const saved: Record<string, unknown> = {};
  for (const key of injected) {
    saved[key] = g[key];
    g[key] = (dom.window as unknown as Record<string, unknown>)[key];
  }
  try {
    const mod = await import("data:text/javascript," + encodeURIComponent(source));
    await mod.default(root, api);
    await new Promise((resolve) => setTimeout(resolve, 20));
  } catch (err) {
    return `${artifactId}: mount failed — ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    for (const key of injected) g[key] = saved[key];
  }

  const ids = assignStableIds(root as unknown as Parameters<typeof assignStableIds>[0]);
  const elements = Array.from(root.querySelectorAll("[data-viv-id]"));
  const withText = elements.filter((el) => (el.textContent ?? "").trim().length > 0);
  if (withText.length === 0) return `${artifactId}: rendered no text`;
  const leaf = withText.reduce((a, b) => ((a.textContent ?? "").length <= (b.textContent ?? "").length ? a : b));
  const container = elements[0];
  // The sandbox computes the neighbourhood from the live DOM (edit context 0.2);
  // this tool mounts in jsdom without a sandbox, so it reproduces the same rule
  // here. Keeping it beside the measurement is deliberate — if the runtime's
  // definition of "neighbourhood" moves and this does not, the numbers below stop
  // describing the thing they claim to measure, and nothing else would say so.
  const neighbourhood = (el: Element) => {
    const relation = new Map<Element, "selected" | "ancestor" | "sibling" | "child">();
    const mark = (target: Element | null, rel: "selected" | "ancestor" | "sibling" | "child") => {
      if (!target || target === root || !root.contains(target)) return;
      if (!target.hasAttribute("data-viv-id")) return;
      if (!relation.has(target)) relation.set(target, rel);
    };
    mark(el, "selected");
    for (let a = el.parentElement; a && a !== root; a = a.parentElement) mark(a, "ancestor");
    if (el.parentElement) for (const sib of Array.from(el.parentElement.children)) if (sib !== el) mark(sib, "sibling");
    for (const child of Array.from(el.children)) mark(child, "child");
    return Array.from(root.querySelectorAll("[data-viv-id]"))
      .filter((e) => relation.has(e))
      .map((e) => ({
        id: e.getAttribute("data-viv-id")!,
        tag: e.tagName.toLowerCase(),
        relation: relation.get(e)!,
        role: e.getAttribute("role") ?? IMPLICIT_ROLE[e.tagName.toLowerCase()] ?? null,
      }));
  };
  const context = (el: Element) =>
    buildEditContext({
      profile: null,
      selection: [describe(el)],
      screen: neighbourhood(el),
      source: { language: "js", code: source },
    });
  const leafCtx = context(leaf);
  return {
    artifact: artifactId,
    elements: ids.length,
    interactive: elements.filter((el) => INTERACTIVE.has(el.tagName.toLowerCase())).length,
    source: bytes(leafCtx.source),
    screenIds: bytes(leafCtx.screen),
    // How the one consumer in this family embeds it: vivarium-agent's planner prompt
    // pretty-prints the structural part with a 2-space indent.
    screenPretty: Buffer.byteLength(JSON.stringify(leafCtx.screen, null, 2)),
    leaf: parts(leafCtx),
    container: parts(context(container)),
  };
}

const rows: Row[] = [];
const problems: string[] = [];
for (const name of readdirSync(exhibitsDir).sort()) {
  const exhibit = (await import(pathToFileURL(join(exhibitsDir, name, "exhibit.ts")).href)).default as ExhibitDefinition;
  for (const [artifactId, source] of Object.entries(exhibit.artifacts)) {
    const result = await measure(artifactId, source, exhibit);
    if (typeof result === "string") problems.push(result);
    else rows.push(result);
  }
}

const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
console.log("| artifact | elements (interactive) | total leaf / container | source | screen (neighbourhood) | screen, 2-space JSON | untrusted leaf / container |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  console.log(
    `| ${r.artifact} | ${r.elements} (${r.interactive}) | ${r.leaf.total} / ${r.container.total} | ` +
      `${r.source} (${pct(r.source, r.leaf.total)}) | ${r.screenIds} (${pct(r.screenIds, r.leaf.total)}) | ${r.screenPretty} | ` +
      `${r.leaf.untrusted} / ${r.container.untrusted} |`,
  );
}
for (const p of problems) console.log(`not measured: ${p}`);
