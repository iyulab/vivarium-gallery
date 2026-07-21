# run 20260719-qwen3.6-35b-a3b — landing-page

- 전시물: 제품 랜딩 페이지 (landing-page)
- 모델/조건: qwen3.6-35b-a3b
- 아카이브 시각: 2026-07-19T07:18:34.321Z
- 세션: {"sessionId":"gallery:landing-page","turns":4,"provider":"gpustack:qwen3.6-35b-a3b","strategy":"plan-then-generate@0","knowledgeSources":["landing-page-catalog"]}

## 턴 비용 (GET /agent/metrics)

| 턴 | endpoint | status | 지연 | attempts | tokens(in/out) | artifact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | session | validated | 125.7s | 1 | 1557/7235 | 3343B |
| 2 | refine | validated | 187.0s | 1 | 2153/8535 | 3351B |
| 3 | refine | validated | 183.6s | 1 | 2232/10342 | 3325B |
| 4 | refine | validated | 107.9s | 1 | 2401/6077 | 3325B |

## 롤백 공통 게이트

**PASS** — rolledBack=true byteIdentical=true lineage=true reapplied=true (2026-07-19T07:18:18.473Z)

## 파일

- `final.html` — 자립형 뷰어 (서버·키 불필요)
- `artifacts/` — 최종 아티팩트 원본
- `turns.json` — 계보 + 턴 비용 원장
- `rollback.json` — 게이트 기록
- `screenshot.png` — 실행 주체가 캡처 (없으면 미캡처)

## 관찰 (실행 주체 주석 — cycle-83)

- **시나리오 판정: 완주(구조 기준)** — 4턴 전부 attempts=1 validated·구조
  판정 통과: build(FAQ 추가) · surgical(**changedLines=1**, no-op 미발생)
  · theme(다크 전환 30줄) · restructure(sections 1줄 재배치). 롤백 공통
  게이트 4단계 PASS. 턴 지연 107.9~187.0s — 동일 시나리오 opus run
  (22.9~32.9s) 대비 4~6배 (로컬 ~57 tok/s 처리량 한계와 일관).
- **지식 규칙 위반 관찰 1건**: FAQ 답변에 존재하지 않는 제품 주장
  ("$29/month" 등)을 날조 — 동일 조건에서 opus 는 준수(공란). 갭 기록:
  `claudedocs/dogfooding/friction/FRICTION-20260719-knowledge-rule-enforcement-is-model-dependent.md`.
