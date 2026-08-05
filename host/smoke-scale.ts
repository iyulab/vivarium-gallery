/**
 * 규모 축 게이트 — ops-console 전시물 고정.
 *
 * 이 게이트가 묻는 것은 *"규모 전시물이 잘 그려지는가"* 가 아니라 **"기존 하한들이
 * 그 규모에서 여전히 변별하는가"** 다. 앞선 측정 하나가 그 물음을 세웠다: 값이 전부
 * 빠진 화면을 텍스트 총량 하한이 **19자에서 잡았고, 카드 하나만 늘자 29자로 통과**
 * 시켰다. 즉 그 판정의 유효 범위는 *옳음*이 아니라 **화면 크기**로 정해진다.
 *
 * 그래서 여러 단언이 **통과가 곧 결함** 어법으로 서 있다(3·5·7·8) — 하한이 못 잡는
 * 다는 사실을 통과로 고정하고, 잡기 시작하면 *전제가 바뀌었다*고 빨개진다. 그때
 * 정답은 판정을 다시 쓰는 것이지 단언을 지우는 것이 아니다.
 *
 * **잃는 하한이 0건이면 그것은 깨끗한 결과가 아니라 규모가 부족하다는 신호다.**
 * 이 게이트가 전부 초록인 것과 화면이 안전한 것은 다르다.
 *
 * Prerequisite: stage-host (8891) + host/server.ts (8890, **--exhibit ops-console**,
 * MODEL_PROVIDER 미설정 — 결정성은 scripted provider 에 의존).
 *
 * Usage: node host/smoke-scale.ts
 * Exit 0 + "smoke-scale: 9/9 PASS" on success; exit 1 otherwise.
 */

import { JSDOM } from "jsdom";
import { createUnifiedDiff } from "@vivariumjs/changeset";
import exhibit from "../exhibits/ops-console/exhibit.ts";
import { CARD_ADDED, CARD_ANCHOR } from "../exhibits/ops-console/scripted.ts";
import { renderChangesetReview } from "./review.ts";
import { checkRender } from "./tools/render-check.ts";
import { runRollbackGate } from "./tools/rollback-gate.ts";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8890";
const TARGET = exhibit.target;
const ARTIFACT_ID = exhibit.primaryArtifactId;
const SEED_CONTENT = exhibit.artifacts[ARTIFACT_ID];
const DECLARED = exhibit.render ?? {};
const TOTAL = 10;

/** 규모 하한 — 이 아래로 내려가면 이 게이트의 나머지가 아무것도 말하지 않는다. */
const FLOOR = { lines: 300, bytes: 10_000, rows: 35, entities: 3, capabilities: 4 };

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

/**
 * 값이 전부 빠진 화면을 **시드에서 파생**한다. 손으로 쓴 픽스처는 시드가 바뀌어도
 * 그대로라 게이트가 실물에서 멀어진다.
 *
 * 치환 대상은 값을 집는 두 자리다 — 셀과 카드. 한쪽만 비우면 나머지가 총량을 채워
 * 무엇이 원인인지 흐려진다. 치환이 조용히 실패하면 아래 단언들이 시드를 시드와
 * 비교하며 전부 초록이 되므로, 실패는 **게이트 전체를 죽인다**.
 */
const CELL_PICK = "        const raw = column.render ? column.render(row) : row[column.key];";
const CARD_PICK = "    const raw = summary[spec.key];";
function deriveEmptied(): string {
  const emptied = SEED_CONTENT
    .replace(CELL_PICK, "        const raw = undefined;")
    .replace(CARD_PICK, "    const raw = undefined;");
  if (emptied === SEED_CONTENT || emptied.includes(CELL_PICK) || emptied.includes(CARD_PICK)) {
    throw new Error("fixture derivation failed — the seed no longer contains the substituted text");
  }
  return emptied;
}

/** 한 줄 단위 변경량 — diff 최소성의 거친 지표(리포의 기존 어법과 같다). */
function countChangedLines(before: string, after: string): number {
  const a = before.split("\n");
  const b = after.split("\n");
  const kept = new Set(a);
  let changed = 0;
  for (const line of b) if (!kept.has(line)) changed++;
  const arrived = new Set(b);
  for (const line of a) if (!arrived.has(line)) changed++;
  return changed;
}

async function main(): Promise<void> {
  let n = 0;
  const emptied = deriveEmptied();

  // ── 1. 규모 전제 ──────────────────────────────────────────────────────────
  // 규모가 줄면 아래 단언들이 아무것도 말하지 않는다. 그래서 크기를 먼저 못박는다.
  n = 1;
  try {
    const lines = SEED_CONTENT.split("\n").length;
    const bytes = Buffer.byteLength(SEED_CONTENT);
    const rows = Object.values(exhibit.data as Record<string, unknown[]>)
      .reduce((sum, list) => sum + list.length, 0);
    const entities = Object.keys((exhibit.schema as { entities: Record<string, unknown> }).entities).length;
    const caps = exhibit.capabilities.length;
    if (
      lines < FLOOR.lines || bytes < FLOOR.bytes || rows < FLOOR.rows ||
      entities < FLOOR.entities || caps < FLOOR.capabilities
    ) {
      throw new Error(
        `규모가 전제를 밑돈다 — lines=${lines}(≥${FLOOR.lines}) bytes=${bytes}(≥${FLOOR.bytes}) ` +
          `rows=${rows}(≥${FLOOR.rows}) entities=${entities}(≥${FLOOR.entities}) capabilities=${caps}(≥${FLOOR.capabilities})`,
      );
    }
    ok(n, `규모 전제 — ${lines}줄 · ${bytes}B · 행 ${rows} · 엔티티 ${entities} · capability ${caps} (실모델 최대 산출 286줄 위)`);
  } catch (err) {
    fail(n, "규모 전제 — 아래 단언들이 성립하는 크기인가", err);
  }

  // ── 2. 대조군 — 시드가 자기 선언으로 통과한다 ─────────────────────────────
  // 대조군이 떨어지면 아래 실패들은 이 판정이 무엇에나 빨간불을 켠다는 뜻일 뿐이다.
  n = 2;
  let seedTextLength = 0;
  try {
    const good = await checkRender(SEED_CONTENT, exhibit.capabilities, DECLARED);
    if (!good.ok) throw new Error(`대조군(시드)이 떨어졌다 — ${good.errors.join(" | ")}`);
    if (good.filled.length === 0 || good.filled.some((f) => f.total === 0 || f.blank > 0)) {
      throw new Error(`대조군 판독이 예상과 다르다: ${JSON.stringify(good.filled)}`);
    }
    seedTextLength = good.textLength;
    ok(n, `대조군 — 시드가 선언대로 통과한다 (text=${good.textLength}, 자리 ${good.filled.length}종 · capability ${good.invoked.length}회)`);
  } catch (err) {
    fail(n, "대조군 — 시드가 선언대로 통과한다", err);
  }

  // ── 3. 총량 하한이 규모에서 변별하지 못한다 (통과가 곧 결함) ──────────────
  n = 3;
  let emptiedTextLength = 0;
  try {
    const mountOnly = await checkRender(emptied, exhibit.capabilities, {
      expectInvokes: DECLARED.expectInvokes,
    });
    emptiedTextLength = mountOnly.textLength;
    if (!mountOnly.ok) {
      throw new Error(
        `전제가 바뀌었다 — 값이 전부 빠졌는데 총량 판정이 잡았다(${mountOnly.errors.join(" | ")}). ` +
          `잡는다면 이 단언이 말하려는 것이 없으므로 판정을 다시 쓸 것`,
      );
    }
    ok(
      n,
      `총량 하한이 규모에서 변별하지 못한다 — 값이 전부 빠진 화면이 text=${mountOnly.textLength} 로 ` +
        `기본 하한(20)을 통과한다 (작은 전시물에서는 같은 실패가 19자였다). 통과가 곧 결함`,
    );
  } catch (err) {
    fail(n, "총량 하한이 규모에서 변별하지 못한다 (통과가 곧 결함)", err);
  }

  // ── 4. 튜닝한 총량 하한은 값 실종과 **데이터 감소**를 구별하지 못한다 ─────
  //
  // 이 단언은 **가정이 뒤집힌 자리**다. 세운 가정은 *"규모에서는 라벨과 빈 칸 표기가
  // 남아 총량을 채우므로 하한을 올려도 못 잡는다"* 였다. 실측은 반대였다 — 규모에서
  // 값이 차지하는 비중이 커서, 값이 빠지면 텍스트가 오히려 **더 크게** 준다(작은
  // 전시물에서는 21→19 로 90% 가 남았고 여기서는 24% 만 남는다). 즉 하한을 시드에
  // 맞춰 올리면 값 실종은 잡힌다.
  //
  // 그래서 묻는 것을 바꿨다: 그 하한이 **무엇을 함께 떨어뜨리는가**. 답은 정상이지만
  // 행이 적은 화면이다. 총량은 *"값이 사라졌다"* 와 *"데이터가 원래 적다"* 를 구별할
  // 수단이 없고, 규모 전시물에서는 후자가 흔한 정상 상태다(필터 하나면 그 상태가 된다).
  n = 4;
  try {
    if (seedTextLength === 0 || emptiedTextLength === 0) {
      throw new Error("앞 단언이 측정을 남기지 못했다 — 2·3 을 먼저 볼 것");
    }
    const ratio = emptiedTextLength / seedTextLength;
    const floor = Math.round((emptiedTextLength + seedTextLength) / 2);

    // ① 튜닝한 하한은 값 실종을 잡는다.
    const caughtEmptied = await checkRender(emptied, exhibit.capabilities, {
      expectInvokes: DECLARED.expectInvokes,
      minTextLength: floor,
    });
    if (caughtEmptied.ok) {
      throw new Error(
        `전제가 바뀌었다 — 시드와 실종의 중간(${floor})에 둔 하한이 값 실종을 잡지 못한다: ` +
          `text=${caughtEmptied.textLength}`,
      );
    }

    // ② 같은 하한이 **정상인데 행이 적은** 화면도 떨어뜨린다. 행을 1/3 로 줄인
    //    응답을 준다 — 값은 전부 제자리에 있고, 화면은 옳다.
    const fewerRows = exhibit.capabilities.map((c) => ({
      descriptor: c.descriptor,
      handler: async (input: unknown) => {
        const value = await c.handler(input);
        return Array.isArray(value) ? value.slice(0, Math.ceil(value.length / 3)) : value;
      },
    }));
    const legitButSmaller = await checkRender(SEED_CONTENT, fewerRows, {
      ...DECLARED,
      minTextLength: floor,
    });
    const onlyFloorComplained =
      legitButSmaller.errors.length > 0 &&
      legitButSmaller.errors.every((e) => e.startsWith("rendered text too short"));
    if (!onlyFloorComplained) {
      throw new Error(
        `전제가 바뀌었다 — 행이 적은 정상 화면이 총량 말고 다른 이유로 떨어지거나(${legitButSmaller.errors.join(" | ")}) ` +
          `아예 떨어지지 않는다(text=${legitButSmaller.textLength}, 하한 ${floor})`,
      );
    }

    ok(
      n,
      `튜닝한 총량 하한은 값 실종과 데이터 감소를 구별하지 못한다 — 하한 ${floor} 은 ` +
        `값 실종(text=${emptiedTextLength}, 시드의 ${(ratio * 100).toFixed(1)}%)을 잡지만 ` +
        `행이 1/3 인 **정상** 화면(text=${legitButSmaller.textLength}, 자리 전부 참)도 함께 떨어뜨린다`,
    );
  } catch (err) {
    fail(n, "튜닝한 총량 하한은 값 실종과 데이터 감소를 구별하지 못한다", err);
  }

  // ── 5. 자식 수 판정이 규모에서 변별하지 못한다 (통과가 곧 결함) ───────────
  // 표 하나가 통째로 사라져도 root 의 자식은 그대로 1(페이지 컨테이너)이다.
  n = 5;
  try {
    const ANCHOR = "  // ── Incidents ─";
    const gutted = SEED_CONTENT.replace(
      ANCHOR,
      "  if (false)\n" + ANCHOR,
    );
    if (gutted === SEED_CONTENT) {
      throw new Error("fixture derivation failed — the seed no longer contains the substituted text");
    }
    const r = await checkRender(gutted, exhibit.capabilities, {
      expectInvokes: DECLARED.expectInvokes,
    });
    if (!r.ok || r.childCount !== 1) {
      throw new Error(
        `전제가 바뀌었다 — 표 하나가 통째로 사라진 화면을 마운트 판정이 잡거나 자식 수가 달라졌다: ` +
          `ok=${r.ok} children=${r.childCount} errors=${r.errors.join(" | ")}`,
      );
    }
    ok(
      n,
      `자식 수 판정이 규모에서 변별하지 못한다 — 표 하나가 사라져도 children=${r.childCount}, ` +
        `text=${r.textLength} 로 통과. 통과가 곧 결함`,
    );
  } catch (err) {
    fail(n, "자식 수 판정이 규모에서 변별하지 못한다 (통과가 곧 결함)", err);
  }

  // ── 6. 자리 선언은 규모에서도 잡는다 ──────────────────────────────────────
  n = 6;
  try {
    const r = await checkRender(emptied, exhibit.capabilities, DECLARED);
    if (r.ok) {
      throw new Error("자리 선언이 값 실종을 잡지 못했다 — 선언된 셀렉터가 실물과 어긋났을 수 있다");
    }
    const blanked = r.filled.filter((f) => f.blank > 0);
    const declaredCount = (DECLARED.expectFilled ?? []).length;
    if (blanked.length === 0) {
      throw new Error(`빈 자리를 하나도 보고하지 않았다: ${JSON.stringify(r.filled)}`);
    }
    ok(
      n,
      `자리 선언은 규모에서도 잡는다 — 선언 ${declaredCount}종 중 ${blanked.length}종에서 빈 자리를 보고한다 ` +
        `(${blanked.map((f) => `${f.blank}/${f.total}`).join(" · ")})`,
    );
  } catch (err) {
    fail(n, "자리 선언은 규모에서도 잡는다", err);
  }

  // ── 7. 자리 선언도 **선언한 자리만** 잡는다 (통과가 곧 결함) ──────────────
  // 판정의 크기는 선언의 커버리지다. 선언되지 않은 열을 비우면 아무 게이트도 말하지
  // 않는다 — 규모가 커질수록 선언되지 않은 자리가 많아지므로 이것이 규모의 대가다.
  //
  // 이 단언이 고정하는 것은 정확히 이것이다: **선언이 `owner` 열을 덮지 않는다.**
  // 덮게 되면 빨개지고, 그때 정답은 이 단언을 지우는 것이 아니라 어느 열이 아직
  // 덮이지 않았는지로 다시 쓰는 것이다.
  n = 7;
  try {
    const UNDECLARED = '    { key: "owner", label: "Owner" },';
    const ownerless = SEED_CONTENT.replace(UNDECLARED, '    { key: "ownerr", label: "Owner" },');
    if (ownerless === SEED_CONTENT) {
      throw new Error("fixture derivation failed — the seed no longer contains the substituted text");
    }
    const r = await checkRender(ownerless, exhibit.capabilities, DECLARED);
    if (!r.ok) {
      throw new Error(
        `전제가 바뀌었다 — 선언되지 않은 열을 비웠는데 판정이 잡았다(${r.errors.join(" | ")}). ` +
          `그 열이 이제 선언에 덮인 것이므로, 아직 덮이지 않은 열로 이 단언을 다시 쓸 것`,
      );
    }
    ok(n, "자리 선언도 선언한 자리만 잡는다 — 선언 밖 열(owner)이 12행 전부 비어도 통과한다. 통과가 곧 결함");
  } catch (err) {
    fail(n, "자리 선언도 선언한 자리만 잡는다 (통과가 곧 결함)", err);
  }

  // ── 8. 좁히는 상호작용은 선언 어휘로 판정되지 않는다 (통과가 곧 결함) ─────
  // 선언은 *"무엇이 나타나야 하는가"* 만 말할 수 있다. 정렬은 표식이 눌린 열로 옮겨
  // 가므로 그 어휘로 판정되지만, 필터는 좁혀도 **남는 텍스트가 전부 이미 있던 것**
  // 이라 나타날 것이 없다. 그래서 죽은 필터가 선언만으로는 통과한다 — 판정은
  // 게이트가 기록된 텍스트 길이 변화로 한다.
  n = 8;
  try {
    const live = await checkRender(SEED_CONTENT, exhibit.capabilities, DECLARED);
    const liveFilterStep = live.interactions[0];
    if (!liveFilterStep || liveFilterStep.textLength >= live.textLength) {
      throw new Error(
        `산 필터가 화면을 좁히지 않았다 — mount=${live.textLength} step=${liveFilterStep?.textLength}. ` +
          `좁히지 않으면 아래 반증이 아무것도 구별하지 않는다`,
      );
    }

    const LISTENER = 'filterSelect.addEventListener("change", paintServices);';
    const deadFilter = SEED_CONTENT.replace(LISTENER, "");
    if (deadFilter === SEED_CONTENT) {
      throw new Error("fixture derivation failed — the seed no longer contains the substituted text");
    }
    const dead = await checkRender(deadFilter, exhibit.capabilities, DECLARED);
    if (!dead.ok) {
      throw new Error(
        `전제가 바뀌었다 — 죽은 필터를 선언 어휘가 잡았다(${dead.errors.join(" | ")}). ` +
          `잡는다면 선언이 사라짐을 말할 수 있게 된 것이므로 이 단언을 다시 쓸 것`,
      );
    }
    if (dead.interactions[0]?.textLength !== dead.textLength) {
      throw new Error(`죽은 필터인데 텍스트가 변했다: ${JSON.stringify(dead.interactions[0])}`);
    }
    ok(
      n,
      `좁히는 상호작용은 선언 어휘로 판정되지 않는다 — 산 필터는 text ${live.textLength}→${liveFilterStep.textLength}, ` +
        `죽은 필터는 ${dead.textLength} 그대로인데 **선언만으로는 통과한다**. 통과가 곧 결함`,
    );
  } catch (err) {
    fail(n, "좁히는 상호작용은 선언 어휘로 판정되지 않는다 (통과가 곧 결함)", err);
  }

  // ── 9. 규모에서 국소 diff · 롤백 바이트 일치 ──────────────────────────────
  // 앞의 여덟은 렌더 판정이고 이것 하나가 스택 전체를 탄다. 작은 전시물에서는
  // "전체 재작성"과 "국소 변경"의 줄 수가 비슷해 diff 최소성이 사실상 구별되지
  // 않았고, "되돌릴 수 있다"도 수 KB 에서만 검정돼 있었다.
  n = 9;
  try {
    await seed();
    const seeded = await world();
    if (seeded.artifacts?.[ARTIFACT_ID] !== SEED_CONTENT) {
      throw new Error("seeded artifact content mismatch");
    }

    const turn = await post("/agent/session", {
      intent: "롤백된 배포 수를 요약 카드로 보여줘",
      editContext: null,
      artifacts: [{ artifactId: ARTIFACT_ID, content: SEED_CONTENT }],
    });
    if (!turn.proposal) {
      throw new Error(`no proposal — outcome=${JSON.stringify(turn.outcome?.status)}`);
    }

    const approved = structuredClone(turn.proposal.changeset);
    approved.approvals = [
      {
        fingerprint: turn.proposal.fingerprint,
        approvedBy: "smoke-scale-reviewer",
        approvedAt: new Date().toISOString(),
      },
    ];
    const proposed = await post(`/stage/targets/${TARGET}/changesets`, approved);
    const preview = String(proposed.preview?.[ARTIFACT_ID] ?? "");
    if (!preview.includes(CARD_ADDED.trim())) {
      throw new Error("preview lacks the added card — the turn did not do what this assertion measures");
    }

    const seedLines = SEED_CONTENT.split("\n").length;
    const changed = countChangedLines(SEED_CONTENT, preview);
    const budget = Math.ceil(seedLines * 0.05);
    if (changed > budget) {
      throw new Error(
        `국소 변경이 국소 diff 로 나오지 않았다 — ${changed}/${seedLines}줄 (예산 ${budget}). ` +
          `규모에서 diff 최소성이 유지되지 않는다는 뜻이므로 발견으로 기록할 것`,
      );
    }

    const applied = await post(`/stage/sessions/${proposed.sessionId}/apply`, {
      approvedBy: "smoke-scale-reviewer",
    });
    if (applied.state !== "Applied") throw new Error(`expected Applied, got ${JSON.stringify(applied)}`);
    const afterApply = await world();
    if (afterApply.artifacts?.[ARTIFACT_ID] === SEED_CONTENT) {
      throw new Error("apply 가 아무것도 바꾸지 않았다 — 이 단언이 롤백을 시험하지 않는다");
    }

    const record = await runRollbackGate({
      base: BASE,
      target: TARGET,
      sessionId: proposed.sessionId,
      fingerprint: turn.proposal.fingerprint,
      approvedChangeset: approved,
      checkpointArtifacts: exhibit.artifacts,
      checkpointFacetFingerprints: seeded.fingerprints,
    });
    if (!record.passed) {
      throw new Error(`롤백 게이트 실패 — ${JSON.stringify(record.detail)}`);
    }
    ok(
      n,
      `규모에서 국소 diff · 롤백 바이트 일치 — 카드 한 장 추가가 ${changed}/${seedLines}줄(예산 ${budget})이고 ` +
        `${Buffer.byteLength(SEED_CONTENT)}B 가 전부 복귀했다`,
    );
  } catch (err) {
    fail(n, "규모에서 국소 diff · 롤백 바이트 일치", err);
  }

  // ── 10. 검토 화면의 머리말이 **크기를 말하지 않는다** (통과가 곧 결함) ────
  //
  // BD-05 조각 2 의 판정이다. 물음은 *"규모 아티팩트의 변경을 담은 검토 화면이 승인
  // 가능한가"* 였고, 순진한 가설(*"규모면 diff 가 전량이라 못 읽는다"*)은 **틀렸다** —
  // `createUnifiedDiff` 가 실제 diff 알고리즘이라 국소 변경은 아티팩트 크기와 무관하게
  // 9줄이다. 최소성은 검토 표면에서도 규모를 견딘다.
  //
  // 무너지는 자리는 다른 데였다: **머리말이 facet 의 개수만 세고 크기를 세지 않는다.**
  // 그래서 한 줄짜리 변경과 통째 재생성이 화면에서 **글자 그대로 같은 요약**을 받는다.
  // 작은 전시물에서는 최악이 한 화면이라 무해했고, 규모에서는 그 한 줄이 24 KB 를 덮는다.
  // 접힘·요약 장치도 없어 diff 는 전량 렌더된다.
  n = 10;
  try {
    const render = (next: string): { head: string; nodes: number; folds: number; text: number } => {
      const dom = new JSDOM("<!doctype html><div id='r'></div>");
      const doc = dom.window.document;
      const root = doc.getElementById("r") as unknown as HTMLElement;
      renderChangesetReview(
        root,
        {
          intent: "이 화면을 손봐 줘",
          fingerprint: "sha256:0000000000000000",
          patches: {
            schema: [],
            data: [],
            ui: [
              {
                profile: "whole-artifact@0",
                artifactId: ARTIFACT_ID,
                baseFingerprint: "sha256:0",
                newContent: next,
                reviewDiff: createUnifiedDiff(SEED_CONTENT, next),
                explanation: "설명 한 줄",
              },
            ],
          },
        },
        { doc: doc as unknown as Document },
      );
      return {
        head: root.querySelector(".review-facets")?.textContent ?? "",
        nodes: root.querySelectorAll(".review-diff span").length,
        folds: root.querySelectorAll("details, .review-fold, .review-summary").length,
        text: (root.textContent ?? "").length,
      };
    };

    const oneLine = SEED_CONTENT.replace(CARD_ANCHOR, `${CARD_ANCHOR}\n${CARD_ADDED}`);
    if (oneLine === SEED_CONTENT) {
      throw new Error("fixture derivation failed — the seed no longer contains the substituted text");
    }
    // 통째 재생성은 **합성 상한**이다(모든 줄이 다르다). 모델-현실적 값은 아래 restyled
    // 쪽이며, 앞선 측정이 실모델의 국소 변경을 changedLines≈32 로 기록했다.
    const rewritten = SEED_CONTENT.split("\n").map((l) => `${l} `).join("\n");
    const restyled = SEED_CONTENT.replaceAll("padding:6px 8px", "padding:8px 10px").replaceAll("#dde1e8", "#d0d4dc");
    if (restyled === SEED_CONTENT) {
      throw new Error("fixture derivation failed — the seed no longer contains the substituted text");
    }

    const small = render(oneLine);
    const mid = render(restyled);
    const whole = render(rewritten);

    // 대조군 먼저 — 세 화면이 실제로 다른 크기여야 이 단언이 무언가를 말한다.
    if (!(small.text < mid.text && mid.text < whole.text) || whole.text < small.text * 20) {
      throw new Error(
        `전제가 바뀌었다 — 세 변경의 검토 화면 크기가 벌어지지 않는다: ` +
          `${small.text} / ${mid.text} / ${whole.text}자`,
      );
    }
    if (small.head !== whole.head || small.head !== mid.head) {
      throw new Error(
        `전제가 바뀌었다 — 머리말이 크기를 말하기 시작했다(${JSON.stringify([small.head, mid.head, whole.head])}). ` +
          `그것이 수리가 착지한 것이므로 이 단언을 **뒤집을 것**: 이제 머리말이 크기별로 달라야 한다`,
      );
    }
    if (whole.folds !== 0) {
      throw new Error(
        `전제가 바뀌었다 — 접힘·요약 장치가 생겼다(${whole.folds}개). 그것이 수리가 착지한 것이므로 ` +
          `이 단언을 **뒤집을 것**: 이제 큰 diff 는 접혀야 한다`,
      );
    }
    ok(
      n,
      `검토 화면의 머리말이 크기를 말하지 않는다 — 1줄 변경(${small.text}자) · 스타일 전반` +
        `(${mid.text}자) · 통째 재생성(${whole.text}자, 합성 상한)이 전부 "${whole.head}" 로 같고, ` +
        `${whole.nodes}줄 diff 에 접힘이 ${whole.folds}개다. 통과가 곧 결함`,
    );
  } catch (err) {
    fail(n, "검토 화면의 머리말이 크기를 말하지 않는다 (통과가 곧 결함)", err);
  }

  await seed();

  console.log(
    failures.length === 0
      ? `smoke-scale: ${passCount}/${TOTAL} PASS`
      : `smoke-scale: ${passCount}/${TOTAL} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
