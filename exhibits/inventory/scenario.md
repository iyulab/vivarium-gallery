# inventory — 시나리오

전시물 #4. 도메인 축: `inventory`. **facet 축 담당** — 갤러리에서 유일하게
스키마·데이터·UI 세 facet 을 함께 움직이는 전시물이다.

이 전시물이 증명하려는 명제는 하나다:
**필드 하나를 추가하는 변경은 스키마+데이터+UI 가 함께여야 올바르고, 그 셋은
하나의 fingerprint·하나의 승인·하나의 원자 flip 으로 착지하며, 롤백에서도
함께 되돌아온다.**

## 시퀀스

| 턴 | 유형 | 지시 (요지) | 판정 |
| --- | --- | --- | --- |
| 1 | `3-facet field add` | "품목에 재입고 예정일을 추가하고 표에도 보여줘" | 한 제안이 `patches.schema`·`patches.data`·`patches.ui` 를 **전부** 채우고, apply 시 facet fingerprint 셋이 함께 이동 |
| 게이트 | — | 롤백 공통 게이트 + facet 동반 복귀 | 4단계 PASS + `facetsRestored` → rollback.json |

턴이 하나뿐인 것은 의도다. 다턴 refine 경로는 다른 전시물 3종이 이미 증명했고,
이 전시물이 유일하게 증명할 수 있는 것은 **한 턴 안의 facet 동반성**이다.
관계없는 턴을 늘리면 그것은 제품 만들기다(갤러리 규율 2).

## 완주 기준

1. 턴 1이 승인된 changeset apply 로만 반영 (exhausted 턴은 불산입).
2. 롤백 게이트가 `facetsRestored: true` 를 포함해 PASS.
3. `runs/<yyyymmdd>-<model>/` 아카이브 (archive-run.ts + screenshot).
4. **실모델 판정**: 결정적 scripted 경로의 PASS 는 배관이 성립한다는 증거일 뿐,
   *모델이 3-facet 변경을 저작할 수 있다*는 증거가 **아니다**. 그 판정은 실모델
   run 에서만 나온다 — 아래 §마찰 참조.

## 증거가 어디에 있는가

- **스키마 facet** — 월드 판독(`GET /stage/targets/inventory/artifacts` 의
  `schema`)에 `Item.restockDue: date` 가 선언됐는가.
- **데이터 facet** — 같은 판독의 `data.Item` 행에 값이 채워졌는가.
  화면에서는 보이지 않는다: `inventory.list` capability 는 **정적 mock** 이고
  (규율 2 — 전시물은 실백엔드를 알지 못한다) 월드 데이터를 읽지 않는다.
  **데이터 facet 의 증거는 픽셀이 아니라 월드 상태와 원장이다.**
- **UI facet** — 아티팩트에 `restockDue` 열이 추가됐는가(화면에서 보인다).
- **원자성** — 세 facet fingerprint 가 flip 전후로 **함께** 바뀌고, 원장의
  apply/rollback 쌍이 **같은 changeset fingerprint 하나**를 인용하는가.

## 마찰 — 이 전시물이 드러내려는 것

에이전트 파이프라인은 2단계다. planner 프롬프트는 intent·editContext·
**knowledge** 를 받지만, schema/data 연산을 실제로 뱉는 **generator 프롬프트는
intent·plan·UI 아티팩트만** 받는다. 즉:

- 스키마 연산을 쓰는 단계가 **현재 스키마를 구조적으로 볼 수 없다.**
- 데이터 연산(`update`/`delete`)이 요구하는 행 식별자를 볼 수 없다 —
  `where` 절을 발명하게 된다.
- 유일한 우회는 스키마·데이터를 **knowledge 산문에 눌러 담아** planner 가 plan
  으로 옮겨 적기를 기대하는 것이다. 이 전시물의 `knowledge.ts` 가 정확히 그
  우회를 하고 있고, `scripted.ts` 는 그 경로를 그대로 흉내낸다(시드를 아는
  스크립트가 generator 단계에서 "그냥 아는" 짓을 하지 않는다 — 그러면 실모델이
  할 수 없는 일을 스모크가 통과시킨다).

실모델 run 이 이 우회의 성패를 판정한다. 실패하면 그것은 전시물의 결함이 아니라
**입력 계약의 결함**이다 — 출력 계약은 3-facet 인데 입력 계약은 UI 단일 facet 이다.

## 결정적 회귀

```bash
# stage-host (8891) + host 서버를 inventory 전시물로 기동한 뒤
node host/smoke-3facet.ts     # 기대: smoke-3facet: 8/8 PASS
```

## 거부 경로 (T2 — `host/smoke-refusal.ts`)

거부는 결함이 아니라 기능이다. 이 전시물은 갤러리에서 처음으로 **드리프트 거부를
실제로 일으킨다** — out-of-band 조작 없이, 같은 base 에서 세션 둘을 따고 하나를
적용하는 것만으로(동시 편집자·낡은 제안 시나리오).

| # | 무엇을 판정하는가 | 성격 |
| --- | --- | --- |
| 1 | 미승인 apply → 409 `FingerprintGate` | 거부가 일어나야 통과 |
| 2 | 같은 base 의 두 세션 — 하나 적용 후 다른 하나는 409 `DriftGate` | 거부가 일어나야 통과 |
| 3 | 거부 페이로드의 구조 필드는 `reason` 뿐 | **마찰 기록** — 어긋난 ref·기대·실제는 산문 메시지에만 있어 호스트가 파싱해야 한다 |
| 4 | 3-facet 제안조차 `baseState` 에 `ui-artifact` 만 선언 | **마찰 기록** |
| 5 | 데이터 전용 changeset 이 행을 삭제 — `baseState` 는 빌 수밖에 없다 | **마찰 기록** (`data` kind 부재) |
| 6 | 그 행을 갱신하려는 낡은 제안이 **거부 없이 적용된다** | **통과가 곧 결함** |

6이 이 시나리오의 핵심이다. 드리프트 게이트는 changeset 이 **스스로 선언한** facet
만 검사하는데, 저작자는 UI 만 선언한다 — 스키마·데이터가 발밑에서 바뀌어도 아무도
눈치채지 못한다. 게이트의 기계는 멀쩡하고(어댑터는 facet 별 지문을 이미 내놓는다)
**선언 어휘와 저작자가 그것을 쓰지 않는다.**

## 승인 전 검토 표면 (T3 — `host/smoke-review.ts`)

"검토 가능한 단위"라는 주장의 **검토 절반**이 그동안 화면에 없었다 — 프리뷰는 바뀐
결과를 보여줄 뿐, *무엇이 왜* 바뀌는지는 어디에도 없었다. 이제 승인 버튼 위에
changeset 이 **이미 담고 있는 것**이 렌더된다: 의도 · fingerprint(승인이 묶이는 대상) ·
facet 별 연산 요약 · UI diff.

라이브러리에는 아무것도 추가하지 않았다. `reviewDiff`(whole-artifact@0)와
`diff`(verified-diff@0)는 **검토를 위해** 스펙이 이미 문서에 넣어 둔 값이다.

단언 5는 주입 안전을 본다 — 검토 화면의 입력은 전부 모델 유래이고, **검토 대상에게
조작당하는 검토 화면은 검토가 아니다.**
