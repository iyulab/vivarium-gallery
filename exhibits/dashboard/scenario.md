# dashboard — 시나리오

전시물 #1 (dashboard-builder M1~M8 이식본). 변경 유형 축 담당: `build` ·
`surgical` · `bulk` (전시물당 변경 유형 3종 이상). 원본 표면(dashboard-builder,
은퇴)에서 완주된 M1~M8 이력은 상류 개발 기록에 보존되고, 갤러리에서의 신규
시험은 여기 정의한다.

## 시퀀스 (실모델 — run-cycle 세션이 구동)

| 턴 | 유형 | 지시 (요지) | 판정 |
| --- | --- | --- | --- |
| 1 | `build` | dashboard.dataset 기반 KPI 6타일 + 매출 추이 차트 + Top Products 표 구성 | 하우스 디자인 시스템 준수, capability invoke 로만 데이터 취득 |
| 2 | `surgical` | 표 제목 텍스트만 교체 (0.0.2 no-op 재현 지시와 동일 계열) | 1개 문자열만 변경 — no-op 미재현 확인 (diff 임계 실측 원료) |
| 3 | `bulk` | 전 KPI 타일의 통화 표기를 compact($128.4K)에서 전체 자릿수로 일괄 전환 | 대상 타일 전부 일관 변경, 차트·표 무변경 |
| 게이트 | — | 롤백 공통 게이트 (tools/rollback-gate.ts) | 4단계 PASS → rollback.json |

## 완주 기준 (공통 골격 — 모든 시나리오가 상속)

1. 각 턴의 변경이 승인된 changeset apply 로만 반영된다 (exhausted 불산입).
2. 턴 3 apply 후 게이트: 체크포인트 = 턴 2 apply 직후 상태.
3. 실행 1회의 아카이브를 `runs/<yyyymmdd>-<model>/`에 남긴다
   (archive-run.ts + screenshot). `rollback.json` 필수.

## 결정적 검증

`host/smoke.ts` 14 단언(원본 11 동등성 + 롤백 게이트 + 인덱스 생성 +
렌더 검증)이 이 전시물로 상시 회귀를 담당한다. 실모델 구동 시 턴 1 은
`expectInvokes: ["dashboard.dataset"]` 렌더 검증을 켠다
(FRICTION-20260719-wrong-capability-contract-renders-empty 후속).

## 판정 공통 규칙 (cycle-84 명문화)

턴 판정은 구조 기준에 더해 **지식 규칙 준수**를 포함한다 — capability 에
없는 데이터/카피의 날조가 관찰되면 해당 턴은 판정 실패로 기록한다
(FRICTION-20260719-knowledge-rule-enforcement-is-model-dependent 후속).
