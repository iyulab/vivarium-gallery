# run 20260803-claude-opus-4-8 — inventory

- 전시물: 재고 품목 표 (inventory)
- 모델/조건: claude-opus-4-8
- 아카이브 시각: 2026-08-03T12:22:52.521Z
- 세션: {"sessionId":"gallery:inventory","turns":1,"provider":"anthropic:claude-opus-4-8","strategy":"plan-then-generate@0","knowledgeSources":["inventory-catalog"]}

## 턴 비용 (GET /agent/metrics)

| 턴 | endpoint | status | 지연 | attempts | tokens(in/out) | artifact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | session | validated | 20.2s | 1 | 2604/855 | 0B |
| 2 | session | validated | 13.8s | 1 | 2611/830 | 0B |

## 롤백 공통 게이트

**PASS** — rolledBack=true byteIdentical=true lineage=true reapplied=true (2026-08-03T12:22:46.272Z)

## 파일

- `final.html` — 자립형 뷰어 (서버·키 불필요)
- `artifacts/` — 최종 아티팩트 원본
- `turns.json` — 계보 + 턴 비용 원장
- `rollback.json` — 게이트 기록
- `screenshot.png` — 실행 주체가 캡처 (없으면 미캡처)

## 판정 — 미완주 (facet 축)

시나리오의 완주 기준은 "한 제안이 schema·data·ui 를 **전부** 담는 것"이다.

| facet | 제안 | 착지 |
| --- | --- | --- |
| schema | 1건 (`field.add Item.restockDue: date`) | ✅ 선언됨 |
| **data** | **0건** | ❌ **어떤 행도 값을 갖지 않는다** |
| ui | 1건 (열 추가) | ✅ 표에 열이 보인다 |

**결과 상태는 비정합이다.** 스키마는 필드를 선언했고 화면은 열을 보여주는데
데이터는 비어 있어, 표의 새 열이 전 행에서 `—` 로 렌더된다. 헌법 §3.3 이
"필드 추가는 셋이 함께여야 올바르다"고 말하는 바로 그 상태다.

파이프라인은 이것을 **막지 못했다**: 에이전트 검증 → fingerprint 봉인 → 승인
게이트 → 드리프트 게이트 → 원자 flip → 원장까지 전부 통과했다. **facet 간
정합성을 판정하는 층이 아무 데도 없다.**

원인은 모델의 태만이 아니라 **입력 계약**이다 — 에이전트의 생성 단계 프롬프트는
intent·plan·UI 아티팩트만 받고 데이터 행을 보지 못하므로, `update` 의 `where`
절에 쓸 식별자를 알 수 없다. 자세한 경로는 `scenario.md` §마찰.

부가 관찰: `changedLines=32` — 국소 편집이 가능한 변경인데 아티팩트를 크게
재작성했다(surgical uiEdits 미사용). screenshot.png 는 이번 run 에서 미캡처.
