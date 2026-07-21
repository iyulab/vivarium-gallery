# form-survey — 시나리오

전시물 #3. 변경 유형 축 담당: `build` · `delete` · `bulk` · `i18n`
(설계 §2 — 전시물당 3종 이상).

## 시퀀스 (실모델 — run-cycle 세션이 구동)

| 턴 | 유형 | 지시 (요지) | 판정 |
| --- | --- | --- | --- |
| 1 | `build` | 이메일 입력 질문 + NPS 척도 질문 추가 (총 4문항) | questions 배열에 2건 추가, id 규칙(q3·q4) 준수 |
| 2 | `delete` | 서술형 질문(q2) 삭제 | q2 항목만 제거, 다른 질문·제출 흐름 무변경 |
| 3 | `bulk` | 남은 전 질문을 필수(required)로 일괄 전환 | 모든 항목 required:true — 라벨 " *" 규칙 유지 |
| 4 | `i18n` | 사용자 노출 카피 전부 한국어로 (id/name/type 불변) | 라벨·버튼·상태 문구만 번역, 구조 무변경 |
| 게이트 | — | 롤백 공통 게이트 (tools/rollback-gate.ts) | 4단계 PASS → rollback.json |

## 완주 기준

1. 각 턴이 승인된 changeset apply 로만 반영 (exhausted 턴은 불산입).
2. 턴 4 apply 후 게이트: 체크포인트 = 턴 3 apply 직후 상태.
3. `runs/<yyyymmdd>-<model>/` 아카이브 (archive-run.ts + screenshot).

## 관찰 포인트

- 턴 4(i18n)는 knowledge 의 "localization changes ONLY user-visible copy"
  규칙 준수를 시험한다 — id 변경이 발생하면 스펙 위반 결함 후보.
- 턴 2(delete)는 no-op 게이트(agent 0.0.3)의 반대 방향 — 삭제 지시가
  전체 재생성에서 다른 질문을 보존하는지 (diff 임계 실측 원료).

## 판정 공통 규칙 (cycle-84 명문화)

턴 판정은 구조 기준에 더해 **지식 규칙 준수**를 포함한다 — capability 에
없는 데이터/카피의 날조가 관찰되면 해당 턴은 판정 실패로 기록한다
(FRICTION-20260719-knowledge-rule-enforcement-is-model-dependent 후속).
