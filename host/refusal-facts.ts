/**
 * 거부 페이로드 → 사람이 읽는 블록. DOM 을 모르는 순수 모듈 — 앱(`app.ts`)이 그리고,
 * `smoke-refusal` 이 호스트가 실제로 돌려준 거부를 넣어 판정한다.
 *
 * 라이브러리는 거부에 `details` 를 싣는다. 산문 `error` 에도 같은 사실이 있지만, 그것을
 * 파싱해 보여 주는 것은 구조화된 `details` 가 없애려는 바로 그 일이다. 아는 형태는 다음 행동이 분명한
 * 문장으로, 모르는 형태는 받은 그대로 보여 준다(게이트별 필드는 추가형이다: 아는 것만 읽는다).
 *
 * 아는 형태 둘:
 * - **드리프트**(`scope: "base-state"` + `drifted`) — 제안이 딛고 선 상태가 그 사이 바뀌었다.
 * - **문서 오류 목록**(`errors: [{ path, message }]`) — Stage 의 검증 거부와 어댑터의 문서 거부
 *   (Vivarium.Stage 0.9 `DocumentRefused`)가 **같은 모양**을 쓴다. 호스트가 둘을 같게 읽으라고
 *   맞춘 모양이라 읽는 법도 하나다; 누가 판정했는지만 제목이 말한다.
 */

/** 호스트가 돌려준 거부 본문 — 스택 거부(409)와 어댑터 거부(422)의 합집합. */
export interface RefusalBody {
  reason?: unknown;
  adapterReason?: unknown;
  details?: unknown;
}

export function refusalFacts(body: RefusalBody): Array<[string, string]> {
  const details = body.details;
  if (!details || typeof details !== "object") return [];
  const d = details as { scope?: unknown; drifted?: unknown; errors?: unknown };

  if (d.scope === "base-state" && Array.isArray(d.drifted)) {
    const short = (fp: unknown) => (typeof fp === "string" ? fp.replace(/^sha256:/, "").slice(0, 12) : "—");
    const lines = d.drifted.map((entry: any) =>
      entry?.actual == null
        ? `${entry?.kind} ${entry?.ref} — 지금 대상에 없다 (작성 기준 ${short(entry?.expected)})`
        : `${entry?.kind} ${entry?.ref} — 작성 기준 ${short(entry?.expected)} → 지금 ${short(entry?.actual)}`,
    );
    return [
      ["어긋난 것 — 제안이 딛고 선 상태가 그 사이 바뀌었다", lines.join("\n")],
      ["다음 행동", "이 제안은 낡았다. 지금 상태 위에서 다시 제안하면(재기반) 된다 — 거부는 결함이 아니다."],
    ];
  }

  if (Array.isArray(d.errors) && d.errors.length > 0 && d.errors.every(isLocatedError)) {
    const byBackend = body.adapterReason === "DocumentRefused";
    const lines = d.errors.map((e) => `${e.path} — ${e.message}`);
    return [
      [
        byBackend
          ? "실행할 수 없는 자리 — 문서가 가리킨 것이 대상에 없거나 형태가 맞지 않는다"
          : "계약을 어긴 자리 — 문서가 체인지셋 형식을 지키지 않았다",
        lines.join("\n"),
      ],
      ["다음 행동", "문서의 그 자리를 고쳐 다시 제안한다. 라이브는 바뀌지 않았다 — 거부는 결함이 아니다."],
    ];
  }

  return [["게이트가 관측한 사실", JSON.stringify(details, null, 2)]];
}

function isLocatedError(e: unknown): e is { path: string; message: string } {
  const o = e as { path?: unknown; message?: unknown } | null;
  return typeof o?.path === "string" && typeof o?.message === "string";
}
