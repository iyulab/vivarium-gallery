/**
 * gallery host browser app — dashboard-builder app.ts 의 전시물-무관 이식본.
 * Consumes only `@vivariumjs/runtime` (import map — registry install, no
 * submodule source import: samples/README.md 규율 1) plus this host's own
 * HTTP surface (`/agent/*`, `/stage/*` proxy, `/exhibit` — server.ts).
 *
 * 전시물 결합은 런타임에만 일어난다: GET /exhibit 로 로드된 전시물 이름을
 * 받아 `/exhibits/<name>/exhibit.ts` 를 동적 import — 시드 아티팩트와
 * capability grant 목록이 그 모듈에서 온다 (exhibit-schema.ts 계약).
 *
 * Flow (dashboard-builder 이식과 동일):
 *   1. grant exhibit capabilities, mount a canvas + preview sandbox **per
 *      artifact** — a change that touches several screens has to be visible
 *      on several screens
 *   2. seed the stage target (mirrors smoke.ts) → load live artifacts →
 *      render every canvas
 *   3. click-to-select on any canvas keeps a live edit context for the chat;
 *      the selection carries which screen it came from, since only that
 *      screen's sandbox can build the context
 *   4. chat → /agent/session (first turn) or /agent/refine (subsequent turns)
 *      → proposal → propose the (still unapproved) changeset to stage → the
 *      preview sandbox renders the branch preview
 *   5. approve: bind an approval record to the exact fingerprint, re-propose,
 *      apply → live canvas re-renders. reject: discard the local proposal.
 *   6. rollback: undo the last applied session → live canvas re-renders
 *   7. every stage transition refreshes the ledger list
 *   8. all chat turns after the first go through /agent/refine (lineage)
 */
import { mountSandbox, CapabilityRegistry } from "@vivariumjs/runtime";
import type { ElementDescriptor, EditContext } from "@vivariumjs/runtime";
import type { ExhibitDefinition } from "./exhibit-schema.ts";
import { renderChangesetReview } from "./review.ts";

// ── DOM ──────────────────────────────────────────────────────────────────
const titleEl = document.getElementById("exhibit-title") as HTMLElement;
const canvasEl = document.getElementById("canvas") as HTMLElement;
const previewEl = document.getElementById("preview") as HTMLElement;
const previewSection = document.getElementById("preview-section") as HTMLElement;
const reviewEl = document.getElementById("review") as HTMLElement;
const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const approveBtn = document.getElementById("approve-btn") as HTMLButtonElement;
const rejectBtn = document.getElementById("reject-btn") as HTMLButtonElement;
const rollbackBtn = document.getElementById("rollback-btn") as HTMLButtonElement;
const ledgerListEl = document.getElementById("ledger-list") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const selectionEl = document.getElementById("selection-info") as HTMLElement;
const clearSelectionBtn = document.getElementById("clear-selection-btn") as HTMLButtonElement;

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.className = isError ? "error" : "";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── HTTP helpers (mirrors smoke.ts shapes) ───────────────────────────────
async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`POST ${path} — HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function get(path: string): Promise<any> {
  const res = await fetch(path);
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`GET ${path} — HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// ── state ────────────────────────────────────────────────────────────────
let exhibit: ExhibitDefinition;
let target = "";
let primaryArtifactId = "";
let liveArtifacts: Record<string, string> = {};
let artifactIds: string[] = [];
let selectedIds: string[] = [];
/**
 * 선택이 일어난 화면. 편집 맥락은 **그 화면의 샌드박스**에서만 만들 수 있으므로,
 * 선택은 요소 id 만으로는 부족하고 어느 화면의 것인지를 함께 들어야 한다.
 * 화면이 하나뿐이던 동안 이 값은 언제나 primary 였고, 그래서 없어도 됐다.
 */
let selectedArtifactId = "";
let hasSession = false; // first chat turn uses /agent/session; every turn after uses /agent/refine
let pendingProposal: { fingerprint: string; changeset: any } | null = null;
let appliedSessionId: string | null = null; // last applied stage session — the rollback target
/**
 * 화면마다 샌드박스 하나. 하나를 전환하는 설계도 가능했지만, 구성 축이 시험하는
 * 명제가 *한 변경이 두 화면을 함께 바꾼다* 이므로 전환은 그 절반을 가린다 —
 * apply 가 둘을 바꾸고 rollback 이 둘을 되돌리는 것을 사람이 볼 수 없다.
 */
const canvases = new Map<string, ReturnType<typeof mountSandbox>>();
const previews = new Map<string, ReturnType<typeof mountSandbox>>();

/**
 * 컨테이너 안에 화면마다 라벨 붙은 자리를 만든다. 라벨이 `artifactId` 인 것이
 * 요점이다 — 화면이 여럿일 때 사람이 어느 것을 보고 있는지 말할 수 없으면
 * 여럿을 보여 주는 의미가 절반으로 준다.
 */
function buildScreens(container: HTMLElement, ids: string[]): Map<string, HTMLElement> {
  container.replaceChildren();
  container.classList.toggle("multi", ids.length > 1);
  const slots = new Map<string, HTMLElement>();
  for (const id of ids) {
    const box = document.createElement("div");
    box.className = "screen";
    const label = document.createElement("div");
    label.className = "screen-label";
    label.textContent = id;
    const frame = document.createElement("div");
    frame.className = "screen-frame";
    box.append(label, frame);
    container.append(box);
    slots.set(id, frame);
  }
  return slots;
}

// ── ledger ───────────────────────────────────────────────────────────────
function renderLedger(entries: any[]): void {
  ledgerListEl.innerHTML = "";
  const sorted = [...entries].sort((a, b) => a.seq - b.seq); // newest last
  for (const e of sorted) {
    const li = document.createElement("li");
    const fp = String(e.changesetFingerprint ?? "");
    const short = fp.startsWith("sha256:") ? fp.slice(7, 19) : fp.slice(0, 12);
    li.textContent = `#${e.seq} · ${e.kind} · ${short}`;
    ledgerListEl.append(li);
  }
}

async function refreshLedger(): Promise<void> {
  const ledger = await get("/stage/ledger");
  renderLedger(Array.isArray(ledger) ? ledger.filter((e: any) => e.target === target) : []);
}

// ── canvases ─────────────────────────────────────────────────────────────
/** 살아 있는 상태를 화면 **전부**에 그린다. */
async function renderCanvases(): Promise<void> {
  for (const [id, sandbox] of canvases) {
    await sandbox.render(liveArtifacts[id] ?? "export default function mount(){}");
  }
}

// ── selection ────────────────────────────────────────────────────────────
function updateSelectionInfo(): void {
  // 화면이 여럿이면 어느 화면의 선택인지가 정보의 절반이다.
  const where = artifactIds.length > 1 && selectedArtifactId ? `${selectedArtifactId} / ` : "";
  selectionEl.textContent =
    selectedIds.length > 0 ? `선택됨: ${where}${selectedIds.join(", ")}` : "선택 없음";
  clearSelectionBtn.hidden = selectedIds.length === 0;
}

// FRICTION-20260718-selection-cannot-be-cleared: once an element is clicked
// there was no way back to "no selection". The runtime sends selection
// events only (no visual state), so clearing the app's own list is the fix.
clearSelectionBtn.addEventListener("click", () => {
  selectedIds = [];
  selectedArtifactId = "";
  updateSelectionInfo();
});

// ── proposal preview UI toggling ───────────────────────────────────────
// Note: the send button is NOT coupled to pending state — refine-on-pending
// is the proposal loop's natural flow (a new turn supersedes the pending
// draft; the session keeps the lineage).
function setPendingUi(pending: boolean): void {
  previewSection.hidden = !pending;
  approveBtn.disabled = !pending;
  rejectBtn.disabled = !pending;
}

// ── refusal surfacing: show WHY when a turn yields no proposal ───────────
// The server response carries the model's plan-stage reasoning and the
// validator's retry errors (outcome.plan / outcome.retries) — surface them
// instead of discarding (Nielsen #9: help users diagnose errors).
const refusalEl = document.getElementById("refusal-detail") as HTMLElement;
function renderRefusal(outcome: any): void {
  refusalEl.replaceChildren();
  if (!outcome) {
    refusalEl.hidden = true;
    return;
  }
  // Model-derived text is untrusted — always textContent, never markup.
  const section = (title: string, body: string): void => {
    const h = document.createElement("h3");
    h.textContent = title;
    const pre = document.createElement("pre");
    pre.textContent = body;
    refusalEl.append(h, pre);
  };
  if (typeof outcome.plan === "string" && outcome.plan.trim() !== "") {
    section("모델이 정리한 사유", outcome.plan);
  }
  const retries = Array.isArray(outcome.retries) ? outcome.retries : [];
  if (retries.length > 0) {
    const lines = retries
      .map((r: any) => `시도 ${r.attempt}: ${(r.errors ?? []).join(" · ")}`)
      .join("\n");
    section(`검증 게이트 흔적 (${outcome.attempts ?? retries.length}회 시도)`, lines);
  }
  refusalEl.hidden = refusalEl.childElementCount === 0;
}

// ── init: load exhibit → grant capabilities → mount sandboxes → seed ──────
async function init(): Promise<void> {
  setStatus("초기화 중…");

  // Runtime exhibit binding: which exhibit the server loaded, then its module.
  const info = await get("/exhibit");
  exhibit = (await import(`/exhibits/${info.name}/exhibit.ts`)).default;
  target = info.target;
  primaryArtifactId = info.primaryArtifactId;
  artifactIds = Array.isArray(info.artifactIds) && info.artifactIds.length > 0
    ? info.artifactIds
    : [info.primaryArtifactId];
  titleEl.textContent = `${exhibit.meta.title} — vivarium gallery`;
  document.title = `${exhibit.meta.name} — vivarium gallery`;

  const registry = new CapabilityRegistry();
  for (const cap of exhibit.capabilities) {
    registry.grant(cap.descriptor, cap.handler);
  }
  const canvasSlots = buildScreens(canvasEl, artifactIds);
  const previewSlots = buildScreens(previewEl, artifactIds);
  for (const id of artifactIds) {
    canvases.set(
      id,
      mountSandbox(canvasSlots.get(id)!, { registry, context: { app: `gallery:${exhibit.meta.name}:${id}` } }),
    );
    previews.set(
      id,
      mountSandbox(previewSlots.get(id)!, {
        registry,
        context: { app: `gallery:${exhibit.meta.name}:${id}-preview` },
      }),
    );
  }
  await Promise.all([...canvases.values(), ...previews.values()].map((s) => s.whenReady()));

  // POST /stage/targets always succeeds and (re)seeds the target — the
  // in-memory adapter's SeedTarget is unconditional. That is what this app
  // wants (every visit starts from the exhibit's declared state), but it is
  // NOT idempotent, which an earlier note here claimed: if the target already
  // carries applied changes, opening this page discards them. So a run driven
  // through the CLI cannot be viewed here afterwards — the act of looking
  // destroys what you came to look at. Capture the result before opening it,
  // or drive the run through this page in the first place.
  await post("/stage/targets", {
    target,
    artifacts: exhibit.artifacts,
    ...(exhibit.schema ? { schema: exhibit.schema } : {}),
    ...(exhibit.data ? { data: exhibit.data } : {}),
  });
  const seeded = await get(`/stage/targets/${target}/artifacts`);
  liveArtifacts = seeded.artifacts;
  await renderCanvases();

  for (const [id, sandbox] of canvases) {
    await sandbox.setSelectionMode(true);
    sandbox.onSelectionChanged((element: ElementDescriptor) => {
      // 선택은 한 화면 안의 일이다 — 다른 화면을 클릭하면 그 화면으로 옮겨 간다.
      selectedArtifactId = id;
      selectedIds = [element.id];
      updateSelectionInfo();
    });
  }
  updateSelectionInfo();

  setPendingUi(false);
  await refreshLedger();
  setStatus("준비 완료");
}

// ── chat: turn 1 → /agent/session, every turn after → /agent/refine ──────
async function sendChat(): Promise<void> {
  const text = chatInput.value.trim();
  if (!text) return;
  sendBtn.disabled = true;
  try {
    setStatus("에이전트 요청 중…");
    const editContext: EditContext | null =
      selectedIds.length > 0 && canvases.has(selectedArtifactId)
        ? await canvases.get(selectedArtifactId)!.createEditContext(selectedIds)
        : null;

    let turn: any;
    if (!hasSession) {
      const artifacts = Object.entries(liveArtifacts).map(([artifactId, content]) => ({ artifactId, content }));
      turn = await post("/agent/session", { intent: text, editContext, artifacts });
      hasSession = true;
    } else {
      // Re-base every refine to what this app knows is LIVE (updated on
      // apply/rollback, untouched by reject) — emitted changesets must
      // declare the live state as their base to pass the stage drift gate.
      const body: Record<string, unknown> = { instruction: text, baseArtifacts: liveArtifacts };
      if (editContext) body.editContext = editContext;
      turn = await post("/agent/refine", body);
    }

    if (!turn.proposal) {
      setStatus(`제안 없음 (outcome: ${turn.outcome?.status ?? "unknown"})`, true);
      renderRefusal(turn.outcome);
      // An exhausted turn never advances the session — a previously pending
      // proposal (if any) is still the latest validated one, keep it usable.
      setPendingUi(pendingProposal !== null);
      return;
    }

    renderRefusal(null);
    pendingProposal = turn.proposal;
    // Propose the still-UNAPPROVED changeset to stage — branch + preview
    // only, no live effect (approval happens on the approve button).
    const propose = await post(`/stage/targets/${target}/changesets`, pendingProposal!.changeset);
    // 프리뷰도 화면 전부다 — 제안이 둘을 바꾸면 둘 다 미리 보인다.
    for (const [id, sandbox] of previews) {
      await sandbox.render(propose.preview[id] ?? liveArtifacts[id] ?? "export default function mount(){}");
    }
    // 결과(프리뷰) 옆에 **무엇이 왜 바뀌는가**를 함께 둔다 — changeset 이 이미 담고
    // 있는 것을 렌더할 뿐이며, 승인은 이 화면을 보고 내리는 판단이다 (T3).
    renderChangesetReview(reviewEl, pendingProposal!.changeset);
    setPendingUi(true);
    chatInput.value = "";
    setStatus("프리뷰 준비됨 — 승인 또는 거부하세요");
    await refreshLedger();
  } catch (err) {
    setStatus(`오류: ${errorMessage(err)}`, true);
    setPendingUi(pendingProposal !== null);
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener("click", () => {
  void sendChat();
});

// ── approve: bind approval to the exact fingerprint, re-propose, apply ───
approveBtn.addEventListener("click", () => {
  void (async () => {
    if (!pendingProposal) return;
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
    try {
      setStatus("승인 처리 중…");
      const approved = structuredClone(pendingProposal.changeset);
      approved.approvals = [
        {
          fingerprint: pendingProposal.fingerprint,
          approvedBy: "gallery-ui",
          approvedAt: new Date().toISOString(),
        },
      ];
      const propose = await post(`/stage/targets/${target}/changesets`, approved);
      const apply = await post(`/stage/sessions/${propose.sessionId}/apply`, {
        actor: "gallery-ui",
        evidence: { observed: "preview rendered" },
      });
      liveArtifacts = apply.artifacts;
      appliedSessionId = propose.sessionId;
      await renderCanvases();
      rollbackBtn.disabled = false;
      pendingProposal = null;
      setPendingUi(false);
      setStatus("승인 및 적용 완료");
      await refreshLedger();
    } catch (err) {
      setStatus(`승인 실패: ${errorMessage(err)}`, true);
      setPendingUi(true);
    }
  })();
});

// ── reject: discard the local proposal — nothing was ever applied ────────
rejectBtn.addEventListener("click", () => {
  pendingProposal = null;
  setPendingUi(false);
  setStatus("제안을 거부했습니다");
});

// ── rollback: undo the last applied session → live canvas re-renders ─────
rollbackBtn.addEventListener("click", () => {
  void (async () => {
    if (!appliedSessionId) return;
    rollbackBtn.disabled = true;
    try {
      setStatus("롤백 처리 중…");
      const rollback = await post(`/stage/sessions/${appliedSessionId}/rollback`, { actor: "gallery-ui" });
      liveArtifacts = rollback.artifacts;
      await renderCanvases();
      appliedSessionId = null;
      setStatus("롤백 완료");
      await refreshLedger();
    } catch (err) {
      setStatus(`롤백 실패: ${errorMessage(err)}`, true);
      rollbackBtn.disabled = false;
    }
  })();
});

init().catch((err) => {
  setStatus(`초기화 실패: ${errorMessage(err)}`, true);
});
