# ⚡ 스킬 자동 사용 (auto skill use) — 2026-10-24, 브랜치 autoskill

요청: "스킬 자동사용 추가" (설계는 위임). 우선순위: 안정성 > 게임성 > 그래픽.

## 체크리스트
- [x] A-0 코드 조사 (castSkill · 전직 Q · 던전 파티 AI rolePlan · 설정/자동 웨이브 패턴 · 단축키)
- [x] A-1 순수 판단 로직 `src/core/autoskill.js` (스킬 모양 표 · 대상 고르기 · busy 판정) + node 테스트 tests/autoskill.test.mjs
- [x] A-2 런타임 `src/heroes/autoskill.js` (토글 저장 · HUD AUTO 버튼 · Z 키 · 매 0.25초 판단 → castSkill) + main.js 연결 · 파티 AI busy 공유
- [x] A-3 설정 칸(메뉴 ⚙ / 전투 ⚙) · 단축키 안내 · CSS · G_REGISTRY
- [x] A-4 Playwright tests/autoskill.py (스위트 등록)
- [x] A-5 스위트 실행 · CHANGELOG · 병합 · 배포 · 스크린샷

## A-0 조사 결과
- Q = `castSkill(at)` (heroes/skills.js) — 모듈 바인딩 `hero`(파티면 withHero 로 바뀜) 기준. 쿨/사망/선택·결과 화면 검사 포함. `at`(Vector3)이 있으면 그 지점, 없으면 마우스 지점.
  전직 Q 는 advSkill(advfx.js), 격투가는 fighterSkill(냥냥 진각/백호진천권/천룡파), 메카닉은 변신(숨김 영웅).
- 던전·무한의 탑: 조작하지 않는 영웅은 이미 `partyAI → rolePlan`(dungeon/logic.js)이 Q 를 씀 (밀집 3+ `bestCluster`, 백호진천권 `qSelf = TQ.R*.85`). 조작 영웅은 손으로만.
- 시전 중(busy) 판정: spinT · roseT · snipeT · leap · mech.busy · ft.leap (partyAI 안에 인라인). 워프 채널(warpT) 중 시전하면 워프를 방해할 수 있음 → 자동은 건너뜀.
- 설정 패턴: ui/autowave.js (localStorage `hd3d_autoWave`, 메뉴 `st*` ↔ 전투 `snd*` 두 칸, settings.js ROWS 표).
- 쓰는 키: Q E T R 1~5 Space P F C M H ? I WASD Esc → **Z 비어 있음** (Q 아래, 왼손).

## A-5 스위트 결과 (2026-10-24 18:20–18:48 KST, 하나씩)
node rc0 · regress rc0 (diffs 0, 콘솔 오류 0) · autoskill 29/0 · seoyun 81/0 · advance 65/0 · dungeon 103/2 (태블릿 전용 tablet_entry_fits · tablet_start_visible_after_pick — main 16:19 실행에서도 같은 실패, 이 기능과 무관) · spire 26/0 · rose 14/0 · stages 22/0.

## 범위 메모
- 자동은 Q 만. E(전설 스킬)는 안정성 위해 제외 — 필요하면 후속.
