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
3. `runs/<yyyymmdd>-<model>/` 아카이브 (archive-run.ts — 스크린샷은 `--screenshot` 필수 입력).

## 상호작용 기대 (마운트 이후 판정 — `render-check`)

이 전시물의 요점은 그려진 폼이 아니라 **제출이 실제로 도착하는가**다. 마운트
시점 판정(자식 노드·텍스트 길이·기대 invoke)은 제출 리스너가 죽어도 통과하므로,
전시물이 아래를 선언하고 드라이버 spec 의 `expectInteractions` 가 그대로 받는다.

| 셀렉터 | 이벤트 | 기대 invoke | 기대 텍스트 |
| --- | --- | --- | --- |
| `form` | `submit` | `survey.submit` | `Thanks` |

턴이 카피를 번역하면(턴 4 i18n) 기대 텍스트도 그 턴의 지시에 맞춰 옮긴다 —
기대를 고정해 두면 정상 변경을 결함으로 부른다.

## 관찰 포인트

- 턴 4(i18n)는 knowledge 의 "localization changes ONLY user-visible copy"
  규칙 준수를 시험한다 — id 변경이 발생하면 스펙 위반 결함 후보.
- 턴 2(delete)는 no-op 게이트(agent 0.0.3)의 반대 방향 — 삭제 지시가
  전체 재생성에서 다른 질문을 보존하는지 (diff 임계 실측 원료).

## 판정 공통 규칙 (cycle-84 명문화)

턴 판정은 구조 기준에 더해 **지식 규칙 준수**를 포함한다 — capability 에
없는 데이터/카피의 날조가 관찰되면 해당 턴은 판정 실패로 기록한다
(FRICTION-20260719-knowledge-rule-enforcement-is-model-dependent 후속).
