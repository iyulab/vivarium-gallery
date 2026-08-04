# run 20260804-claude-opus-4-8 — contacts

- 전시물: 연락처 디렉터리 (contacts)
- 모델/조건: claude-opus-4-8
- 아카이브 시각: 2026-08-04T10:59:02.704Z
- 세션: {"sessionId":"gallery:contacts","turns":2,"provider":"anthropic:claude-opus-4-8","strategy":"plan-then-generate@0","knowledgeSources":["contacts-catalog"]}

## 턴 비용 (GET /agent/metrics)

| 턴 | endpoint | status | 지연 | attempts | tokens(in/out) | artifact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | session | exhausted | 38.8s | 3 | 6105/3021 | —B |
| 2 | refine | validated | 14.6s | 1 | 2871/867 | 0B |

## 롤백 공통 게이트

**PASS** — rolledBack=true byteIdentical=true lineage=true reapplied=true (2026-08-04T10:58:15.329Z)

## 파일

- `final.html` — 자립형 뷰어 (서버·키 불필요)
- `artifacts/` — 최종 아티팩트 원본
- `turns.json` — 계보 + 턴 비용 원장
- `rollback.json` — 게이트 기록
- `screenshot.png` — 실행 화면 캡처 (아카이브 필수 입력)

## 판정 — **미완주 (1/2)**

지우지 않는다. 미완주 run 도 결과다.

### 턴 1 (팩스 폐기, 3-facet 파괴) — **NO-PROPOSAL, 3/3 시도 소진**

모델은 **지우기를 거부한 것이 아니다.** 세 시도 모두 폐기를 저작하려 했고,
**데이터 facet 의 형태**에서 떨어졌다. 직접 관측한 검증기 오류(같은 조건 3회 반복):

- 데이터 패치 래퍼를 빠뜨리고 연산을 패치 자리에 그대로 놓는다
  (`$.patches.data[0].operations: required array` + `op`/`entity`/`set` 이 `unknown member`).
- 존재하지 않는 데이터 연산을 발명한다 — `unknown data operation: remove`.
  스펙의 데이터 어휘는 `insert`/`update`/`delete` 뿐이고, *"이 필드의 값을 비운다"* 를
  직접 말하는 연산이 없다. 우회는 `update … set { field: null }` 하나다.
- 재시도가 **수렴하지 않는다** — 세 시도가 각각 **다른** 틀린 형태를 냈다
  (`ops` → `remove` → `artifactId`).

**이것은 이미 측정되고 이미 고쳐진 갭의 BEFORE 팔이다.** 이 샘플이 소비하는 것은
게시본 `@vivariumjs/agent 0.1.1` 이고, 소스 0.2.0 의 generator 프롬프트는 데이터 패치
래퍼(`{ "id", "explanation", "operations"[] }`)와 연산 어휘(`insert`/`update`/`delete`)를
**명시한다** — 즉 떨어진 두 지점 모두 소스에서 이미 다뤄져 있다. 새 결함이 아니라,
**그 갭이 파괴성 축에서도 같은 모양으로 나타난다는 확인**이다(앞선 측정은 더하는 축에서
이뤄졌다).

### 턴 2 (`name` → `fullName` 개명) — **validated · applied · 모든 게이트 통과 · 화면은 비었다**

`facets={schema:1, data:0, ui:1}` — 모델은 스키마와 UI 를 옮기고 **데이터를 옮기지
않았다**. 결과 상태:

| facet | 결과 |
| --- | --- |
| 스키마 | `fullName` (`name` 없음) |
| 데이터 | 행은 여전히 `name` 키 — `fullName` **없음** |
| UI | 열 key 가 `fullName` |

화면은 `row["fullName"]` 을 읽고 `undefined` 를 얻어 **세 행의 이름 칸이 전부 `—`**
가 된다(`screenshot.png`). 그런데 **검증 통과 · apply 성공 · 드리프트 게이트 통과 ·
`render-check` 통과(`ok children=1 text=96`) · 롤백 공통 게이트 4/4 PASS** 다.

이것은 **결함이 아니라 선언된 대가**다 — 라이브러리는 facet 정합성을 집행하지 않으며,
동반 변경은 저작자가 한 문서에 담아야 한다. 스키마 연산은 스키마 facet 만 움직이므로,
승인된 문서가 *"이 값들도 함께 옮긴다"* 고 말하지 않으면 값은 옮겨지지 않는다.
여기서 **실모델·실화면으로** 확인된 것은 그 대가가 축에 따라 **질적으로 다르다**는
것이다: 더하는 축에서 비정합은 "빈 칸"이지만, 개명에서는 **보이던 것이 사라진다**.

> **게이트가 못 보는 것이 무엇인지도 이 run 이 말한다.** `render-check` 는 마운트
> 성공·자식≥1·텍스트≥20자를 본다. 이름 셋이 사라져도 텍스트는 96자 남아 통과한다.
> 열 하나가 통째로 비는 것은 **지금 어떤 게이트도 판정하지 않는다.**

### 재현성

같은 spec 을 세 번 돌렸다: 턴 1 은 **3/3 소진**(재현됨), 턴 2 는 **2/3 validated**
(한 번은 소진). 파괴성 축은 더하는 축보다 저작 성공률이 낮다.

한 번은 검증을 통과한 changeset 이 `POST /changesets` 에서 **HTTP 500** 을 냈고
**재현되지 않았다**. 데이터 연산 여섯 형태를 손으로 태워 봤으나 전부 200 이었다.
이 스택에서 측정된 유일한 500 경로는 **부재 필드 `field.retype`**(구조적 크래시,
`stage 0.6.0` 이 닫는다)이지만, 스택 트레이스를 잡지 못했으므로 **그것이었다고
단정하지 않는다.** 미해결 리드로 남긴다.
