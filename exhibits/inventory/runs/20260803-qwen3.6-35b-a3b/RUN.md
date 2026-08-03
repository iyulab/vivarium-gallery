# run 20260803-qwen3.6-35b-a3b — inventory

- 전시물: 재고 품목 표 (inventory)
- 모델/조건: qwen3.6-35b-a3b
- 아카이브 시각: 2026-08-03T12:25:33.574Z
- 세션: {"sessionId":"gallery:inventory","turns":1,"provider":"gpustack:qwen3.6-35b-a3b","strategy":"plan-then-generate@0","knowledgeSources":["inventory-catalog"]}

## 턴 비용 (GET /agent/metrics)

| 턴 | endpoint | status | 지연 | attempts | tokens(in/out) | artifact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | session | validated | 126.5s | 2 | 3183/6488 | 0B |

## 롤백 공통 게이트

**PASS** — rolledBack=true byteIdentical=true lineage=true reapplied=true (2026-08-03T12:25:19.380Z)

## 파일

- `final.html` — 자립형 뷰어 (서버·키 불필요)
- `artifacts/` — 최종 아티팩트 원본
- `turns.json` — 계보 + 턴 비용 원장
- `rollback.json` — 게이트 기록
- `screenshot.png` — 실행 주체가 캡처 (없으면 미캡처)

## 판정 — 미완주 (facet 축), 앞선 모델보다 한 단계 더

| facet | 제안 | 착지 |
| --- | --- | --- |
| **schema** | **0건** | ❌ 필드가 선언되지 않았다 |
| **data** | **0건** | ❌ 어떤 행도 값을 갖지 않는다 |
| ui | 1건 (열 추가) | ✅ 표에 열이 보인다 |

**UI 단독 변경.** 화면은 스키마에 존재하지 않고 데이터에도 없는 열을 보여준다 —
같은 전시물·같은 지시·같은 knowledge 로 구동한 다른 모델이 schema+ui 2건을 낸 것과
비교하면, **facet 도달 깊이가 모델에 따라 다르되 어느 쪽도 3-facet 에 도달하지
못한다.** 즉 이것은 특정 모델의 약점이 아니라 **입력 계약의 구조적 결손**이다.

attempts=2 — 첫 시도가 검증에 실패해 재시도했다(126.6s). 재시도 프롬프트는 형식
오류 교정에 주의를 끌지만, 빠진 facet 은 형식 오류가 아니므로 재시도가 이를
회복시키지 못한다.

screenshot.png 는 이번 run 에서 미캡처.
