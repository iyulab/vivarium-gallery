# landing-page — 시나리오

전시물 #2. 변경 유형 축 담당: `build` · `surgical` · `theme` · `restructure`
(설계 §2 — 전시물당 3종 이상).

## 시퀀스 (실모델 — run-cycle 세션이 구동)

| 턴 | 유형 | 지시 (요지) | 판정 |
| --- | --- | --- | --- |
| 1 | `build` | FAQ 섹션(질문 3개, 접힘 없이 나열)을 CTA 앞에 추가 | 섹션 목록에 faq 추가 + builder 구현, 기존 섹션 무변경 |
| 2 | `surgical` | CTA 버튼 문구만 "Get Started Today"로 | 해당 문자열 1건만 변경 (diff 최소성 관찰 — 임계 실측 원료) |
| 3 | `theme` | 라이트 팔레트를 다크(배경 #16181d·잉크 #f4f6f8·액센트 유지)로 전면 전환 | 전 섹션 팔레트 일관 전환, 구조 무변경 |
| 4 | `restructure` | 기능 그리드를 히어로 바로 아래에서 FAQ 뒤로 이동 | sections 배열 순서만 변경 |
| 게이트 | — | 롤백 공통 게이트 (tools/rollback-gate.ts) | 4단계 PASS → rollback.json |

## 완주 기준

1. 각 턴이 승인된 changeset apply 로만 반영 (exhausted 턴은 불산입).
2. 턴 4 apply 후 게이트: 체크포인트 = 턴 3 apply 직후 상태.
3. `runs/<yyyymmdd>-<model>/` 아카이브 (archive-run.ts — 스크린샷은 `--screenshot` 필수 입력).

## 세션 축 변형 (G4 — 알면서 실측: **실측 완료, cycle-84**)

계보 확립(2턴) 후 서버 재시작 → `/agent/refine` 재개 시도. 실측 결과:
세션 소실(history 0)·refine 500·stage 상태는 생존·새 세션 복구 시 계보
단절 — 게시본 ProposalSession 에 재수화 API 부재로 앱 측 해결 불가,
보류(실측 수요 기록). 이 실측은 상류의 세션 재수화 원칙으로 이어졌다.

## 판정 공통 규칙 (cycle-84 명문화)

턴 판정은 구조 기준에 더해 **지식 규칙 준수**를 포함한다 — capability 에
없는 데이터/카피의 날조가 관찰되면 해당 턴은 판정 실패로 기록한다
(FRICTION-20260719-knowledge-rule-enforcement-is-model-dependent 후속).
