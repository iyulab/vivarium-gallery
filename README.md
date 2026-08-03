# vivarium-gallery — 런타임 UI 변경/롤백 시험 갤러리

**▶ 전시 보기: https://iyulab.github.io/vivarium-gallery/** — 클론 없이 실모델
run 결과물(최종 화면·턴 기록·롤백 판정)을 그대로 열람할 수 있습니다.

[Vivarium 패밀리](https://github.com/iyulab/vivarium)의 **소비자 재현 샘플**.
다양한 도메인·변경 유형·모델 조건에서 **런타임 UI 변경 요구사항이 안정적으로
적용되고 롤백되는지**를 시험하는 상설 표면이며, 시험 산출물이 리포에 남아
그대로 전시(갤러리)가 된다. API 키만 넣으면 완전히 작동합니다.

소비하는 패키지 (레지스트리 게시본만):
[`@vivariumjs/runtime`](https://www.npmjs.com/package/@vivariumjs/runtime) ·
[`@vivariumjs/agent`](https://www.npmjs.com/package/@vivariumjs/agent) ·
[`@vivariumjs/changeset`](https://www.npmjs.com/package/@vivariumjs/changeset) ·
[`Vivarium.Stage`](https://www.nuget.org/packages/Vivarium.Stage) (NuGet).

## 3가지 규율

1. **레지스트리 패키지만 소비한다** — 게시된 패키지만 설치해 쓴다. 소스를
   상대 경로로 import하지 않는다. 소스 지름길을 허용하면 재현이 아니라 통합
   하네스의 재발명이 된다.
2. **UI-only — 데이터·API는 in-memory mock** — 실제 서버·DB·외부 서비스에
   의존하지 않는다. 목적은 배포 가능한 제품이 아니라, 공개 API 표면이 실제
   사용 미션에서 어떤 마찰을 일으키는지 드러내는 것이다.
3. **샘플 필요를 근거로 업스트림을 선제 확장하지 않는다** — 갭은 먼저 샘플
   어댑터에서 해결하고, cross-consumer 증거가 있을 때만 라이브러리를 확장한다.

**소비 현실성**: 재현 고정보다 *항상 최신 게시본을 새로 해석하는 것*을
우선한다. 실제 소비자는 `npm install` 시점의 최신 semver-호환 버전을 받으므로,
`package-lock.json`은 의도적으로 커밋하지 않는다.

**Node 하한이 라이브러리보다 높은 이유**: 이 샘플은 `engines.node >= 23` 을 요구하고,
소비하는 라이브러리들은 `>= 20` 이다. 불일치가 아니라 요구가 다르다 — 호스트는 `.ts`
를 빌드 없이 그대로 실행하고(`node host/server.ts`, `node:module` 의
`stripTypeScriptTypes`), 플래그 없는 타입 스트리핑은 Node 23 부터다. 라이브러리
소비자는 빌드된 JS 를 받으므로 그 요구가 없다.

## 구조 — 공유 호스트 + 선언적 전시물

- `host/` — 전시물-무관 공유 호스트. 서버(`server.ts`)·브라우저 앱
  (`index.html`·`app.ts`)·provider·stage-host·smoke. 전시물과의 계약은
  [`host/exhibit-schema.ts`](host/exhibit-schema.ts)의 `ExhibitDefinition` 하나.
- `exhibits/<name>/` — 전시물 1건: `exhibit.ts`(시드·capability·knowledge·
  scripted provider) + `scenario.md`(변경 요구 시퀀스·완주 기준·롤백 게이트)
  + `runs/<yyyymmdd>-<model>/`(실행 아카이브 — final.html·turns.json·
  rollback.json·screenshot.png·RUN.md).
- 새 전시물 추가 = 디렉터리 추가. 호스트는 변경되지 않는다 — 단 전시물이
  **새 facet 을 요구하면** 계약이 그만큼 넓어진다. `inventory` 가 그 사례로,
  `ExhibitDefinition` 에 선택 필드 `schema`/`data` 가 그때 생겼다(UI 단일 facet
  전시물은 예전 그대로 동작한다).

## 실행 (API 키만 넣으면 작동)

```bash
# 0) 설치 (lockfile은 의도적으로 미고정 — 위 '소비 현실성')
npm install

# 1) stage-host (.NET, 8891)
dotnet run --project host/stage-host -- 8891

# 2) 호스트 서버 (8890) — 결정적 scripted provider (기본)
node host/server.ts 8890 --exhibit dashboard

#    실모델: 리포 루트 .env.local의 키 사용 (anthropic 또는 gpustack — 모델 축)
MODEL_PROVIDER=anthropic node --env-file=.env.local host/server.ts 8890 --exhibit dashboard
MODEL_PROVIDER=gpustack  node --env-file=.env.local host/server.ts 8890 --exhibit dashboard

# 3) 브라우저
open http://localhost:8890/host/index.html
```

## 검증 게이트

**전부 한 번에 — 이것이 CI 가 돌리는 것과 같은 명령이다:**

```bash
node host/tools/run-gates.ts            # 기대: run-gates: 4/4 gates passed
node host/tools/run-gates.ts --list     # 게이트 목록과 각자 필요한 전시물
node host/tools/run-gates.ts --gate smoke-refusal   # 하나만
```

호스트 기동 순서·포트·전시물은 러너가 쥔다. 게이트가 실패하거나 호스트가 뜨지
않으면 종료 코드가 0이 아니다(호스트 미기동은 **명시적으로** 실패한다 — 죽은
호스트가 게이트의 엉뚱한 오류로 둔갑하지 않게).

개별 실행이 필요할 때(디버깅·전제 확인)는 아래처럼 직접 돌릴 수 있다. 이때는
전제(전시물·포트)를 직접 맞춰야 한다.

> **알려진 것**: `smoke-review` 는 단독으로 돌릴 때와 앞선 게이트 뒤에 돌릴 때
> **판정 대상이 다르다** — 전자는 생성 diff, 후자는 편집 diff 를 검토 화면에
> 올린다. 단언은 양쪽 다 통과하므로 게이트는 이 차이를 말하지 않는다. 기전은
> 아직 규명되지 않았다. 러너를 쓰면 항상 후자(전체 실행) 형태다.

```bash
# 결정적 회귀 (scripted provider 필수 — MODEL_PROVIDER 미설정으로 서버 기동)
node host/smoke.ts        # 기대: smoke: 14/14 PASS (12 = 롤백 공통 게이트,
                          #        13 = 정적 인덱스 생성, 14 = 렌더 검증)
                          # 전제: 호스트 서버가 --exhibit dashboard 로 기동

# 3-facet 동반 변경 게이트 — 전제: 호스트 서버가 --exhibit inventory 로 기동
node host/smoke-3facet.ts # 기대: smoke-3facet: 8/8 PASS

# 거부 경로 게이트 — 같은 전제(--exhibit inventory)
#   거부는 결함이 아니라 기능이다. 단언 1~3은 거부가 **일어나야** 통과하고,
#   단언 5~6은 거부가 **일어나지 않는 것**을 기록한다(통과가 곧 결함 — 드리프트
#   게이트는 changeset 이 선언한 facet 만 본다).
node host/smoke-refusal.ts # 기대: smoke-refusal: 6/6 PASS

# 승인 전 검토 표면 — jsdom 판정(브라우저 불필요). 같은 전제(--exhibit inventory)
node host/smoke-review.ts  # 기대: smoke-review: 5/5 PASS

# 소비 재현성 (레지스트리 신선도·클린룸 설치)
node host/tools/verify-consumption.ts
```

## 시나리오 실행 도구 (run-cycle 세션이 사용)

- `host/tools/drive-scenario.ts` — scenario.md 턴 시퀀스의 선언적
  spec(JSON)을 받아 시드→턴 루프(승인·apply)→롤백 게이트까지 구동.
  no-proposal/no-op 은 중단이 아니라 기록 — 완주 판정은 RUN.md 에서.
- `host/tools/render-check.ts` — jsdom 실렌더 판정(무예외·비어있지 않음·
  **기대 capability invoke 여부**). validated 여도 기능 파손인 렌더
  (cycle-85: 잘못된 capability 호출 → 빈 대시보드)를 감지. 드라이버
  spec 에 `renderCheck: true` + 턴별 `expectInvokes` 로 활성화.
- `host/tools/rollback-gate.ts` — 롤백 공통 게이트(설계 §3) 4단계 판정:
  롤백 → 체크포인트 바이트 일치 → ledger 계보 정합 → 재적용. 결과는
  `rollback.json` 형식. 라이브러리 + CLI 겸용.
- `host/tools/archive-run.ts` — 실행 1회를
  `exhibits/<name>/runs/<yyyymmdd>-<label>/`로 아카이브: turns.json ·
  artifacts/ · rollback.json · RUN.md · **final.html**(아티팩트 소스 +
  capability 스냅샷 인라인 — 서버·키 없이 열람 가능한 자립형 뷰어).
  screenshot.png 은 실행 주체가 같은 디렉터리에 캡처해 두는 관례.

## 전시물 목록

| 이름 | 도메인 | 변경 유형 축 담당 | 상태 (runs/ 아카이브 참조) |
| --- | --- | --- | --- |
| [dashboard](exhibits/dashboard/) | dashboard | build·surgical·bulk | `smoke` 14/14 상시 게이트 · opus run 4건 |
| [landing-page](exhibits/landing-page/) | landing-page | build·surgical·theme·restructure | opus·qwen 완주 각 1건 (모델 축 비교 — qwen 날조 관찰 1건) |
| [form-survey](exhibits/form-survey/) | form-survey | build·delete·bulk·i18n | opus 완주 1건 |
| [inventory](exhibits/inventory/) | inventory | **facet 축** — 스키마+데이터+UI 동반 | `smoke-3facet` 8/8 · `smoke-refusal` 6/6 · `smoke-review` 5/5 · 실모델 run 2건 (**둘 다 미완주** — 아래) |

세션 축은 실측 종결 — 재시작 후 세션 계보가 단절되는 갭을 확인했고,
업스트림 재수화 원칙으로 이어졌다.

`inventory` 는 다른 셋과 목적이 다르다: 필드 하나를 추가하는 변경이 **스키마·데이터·
UI 세 facet 을 함께** 움직이는지를 시험한다. 결정적 경로는 통과하지만, **실모델 2종은
어느 쪽도 3-facet 을 저작하지 못했다**(한쪽은 스키마+UI, 다른 쪽은 UI 단독). 그 결과가
`runs/` 에 판정과 함께 남아 있다 — 미완주 run 도 결과이며, 지우지 않는다.

전시 표면: **https://iyulab.github.io/vivarium-gallery/** (로컬 원본은
[index/gallery.html](index/gallery.html), `node index/build-index.ts`로 재생성).
Pages 는 배포 시 `exhibits/` 에서 인덱스를 **재생성**하므로, run 을 추가하고
build-index 를 깜빡해도 사이트에는 반영됩니다.

## 이 샘플이 발견한 것

dogfooding 은 이 리포의 목적이지 부산물이 아니다. 실제로 상류 결함을
찾아냈고, 전부 업스트림에서 수정됐다:

- **agent** — refine 이 미적용 projection 을 base 로 선언해 다음 apply 가
  drift 로 거부되던 결함, 무변경(no-op) 제안이 validated 로 통과하던 결함,
  verified-diff projection 이 다음 턴을 크래시시키던 결함.
- **stage** — 크래시 복구가 판단 불능 상태를 추측해 원장에 기록하던 결함,
  롤백 실패를 apply 중단으로 오기록하던 결함.
- **runtime** — 생성 코드의 이벤트 리스너·동적 DOM 처리 갭.

발견 → 이슈 → 업스트림 수정 → 게시본 재소비까지가 한 사이클이며, 이
리포의 run 아카이브가 그 증거다.
