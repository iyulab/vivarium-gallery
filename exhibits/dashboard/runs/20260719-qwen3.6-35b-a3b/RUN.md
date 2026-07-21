# run 20260719-qwen3.6-35b-a3b — dashboard

- 전시물: 커머스 분석 대시보드 (dashboard)
- 모델/조건: qwen3.6-35b-a3b
- 아카이브 시각: 2026-07-19T07:43:26.064Z
- 세션: {"sessionId":"gallery:dashboard","turns":3,"provider":"gpustack:qwen3.6-35b-a3b","strategy":"plan-then-generate@0","knowledgeSources":["dashboard-sample-catalog"]}

## 턴 비용 (GET /agent/metrics)

| 턴 | endpoint | status | 지연 | attempts | tokens(in/out) | artifact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | session | validated | 215.3s | 1 | 2479/12292 | 8068B |
| 2 | refine | validated | 146.0s | 1 | 4999/8249 | 8069B |
| 3 | refine | validated | 90.0s | 1 | 4408/4978 | 8166B |

## 롤백 공통 게이트

**PASS** — rolledBack=true byteIdentical=true lineage=true reapplied=true (2026-07-19T07:42:18.398Z)

## 파일

- `final.html` — 자립형 뷰어 (서버·키 불필요)
- `artifacts/` — 최종 아티팩트 원본
- `turns.json` — 계보 + 턴 비용 원장
- `rollback.json` — 게이트 기록
- `screenshot.png` — 실행 주체가 캡처 (없으면 미캡처)

## 관찰 (실행 주체 주석 — cycle-85)

- **시나리오 판정: 미완주 — build 턴 기능 판정 실패**: 모델이
  `dashboard.dataset` 대신 레거시 `dashboard.metrics`(2-KPI 배열)를
  호출하면서 dataset 형태(meta/summary/…)로 구조분해 → **렌더가 빈
  대시보드**(스크린샷: KPI 0개·빈 차트·빈 표). 숫자 날조는 없음(잘못된
  invoke 조차 capability 경유). friction:
  `claudedocs/dogfooding/friction/FRICTION-20260719-wrong-capability-contract-renders-empty.md`.
- 한편 **surgical 턴은 changedLines=1 성공** — 동일 게시본 0.0.2에서
  opus 가 2/2 no-op 이었던 그 지시. no-op 발현이 모델 의존적임을 확인
  (opus 268줄 no-op ×2 vs qwen 181줄 1줄 성공 — 7/19 벤치의 328줄 1줄
  성공과도 일관). bulk 도 changedLines=1.
- 드라이버 한계 관찰: changedLines 기반 자동 승인은 기능 파손을 잡지
  못함 — UI 흐름이라면 사람이 빈 프리뷰를 보고 거부했을 지점.
