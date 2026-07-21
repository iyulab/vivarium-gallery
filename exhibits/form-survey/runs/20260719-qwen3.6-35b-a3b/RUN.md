# run 20260719-qwen3.6-35b-a3b — form-survey

- 전시물: 제품 피드백 설문 (form-survey)
- 모델/조건: qwen3.6-35b-a3b
- 아카이브 시각: 2026-07-19T07:43:25.901Z
- 세션: {"sessionId":"gallery:form-survey","turns":4,"provider":"gpustack:qwen3.6-35b-a3b","strategy":"plan-then-generate@0","knowledgeSources":["form-survey-catalog"]}

## 턴 비용 (GET /agent/metrics)

| 턴 | endpoint | status | 지연 | attempts | tokens(in/out) | artifact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | session | validated | 167.8s | 1 | 1711/9551 | 3563B |
| 2 | refine | validated | 112.9s | 1 | 2351/6415 | 3474B |
| 3 | refine | validated | 213.8s | 1 | 2137/12117 | 3578B |
| 4 | refine | validated | 166.8s | 1 | 2107/9517 | 3639B |

## 롤백 공통 게이트

**PASS** — rolledBack=true byteIdentical=true lineage=true reapplied=true (2026-07-19T07:34:46.858Z)

## 파일

- `final.html` — 자립형 뷰어 (서버·키 불필요)
- `artifacts/` — 최종 아티팩트 원본
- `turns.json` — 계보 + 턴 비용 원장
- `rollback.json` — 게이트 기록
- `screenshot.png` — 실행 주체가 캡처 (없으면 미캡처)

## 관찰 (실행 주체 주석 — cycle-85)

- **시나리오 판정: 완주** — 4턴 attempts=1 validated·판정 통과(q2 삭제·
  전원 필수·i18n id/type 불변·렌더 정상 — 스크린샷). 게이트 4단계 PASS.
- 턴 지연 112.9~213.8s (opus 동일 시나리오 24.2~29.1s 대비 4~8배).
  bulk changedLines=44 (opus 1) — 내용 등가 여부는 미관측, 수치만 diff
  임계 원료.
