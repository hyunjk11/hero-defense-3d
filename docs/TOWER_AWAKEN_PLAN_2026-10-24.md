# ✨ 타워 초월 (하드 전용 4번째 단계) — 기획·구현 계획 (2026-10-24)

요청: "하드모드 이면서 3개 타워 모두 업그레이드 끝난 상황에만 열리는 새로운 타워 업그레이드를 만들자"
기준 코드: `/workspace/hero-defense-3d` main **dbbd23b** (읽기만 함 — 코드·스키마 변경 없음) · 브랜치 `tower-awaken`
이름: 장비에 이미 **각성**(고유 장비, `account/equip.js awaken`)·탑 보스 각성(`data/spire.js awakenCd`)이 있어서 타워 단계는 **초월**로 부름 (코드 키는 `awk`).

## 0. '업그레이드 끝'의 뜻 (코드 조사)
판 안 타워 성장은 3겹: ① 골드 강화 Lv.1→3 (`world/towers.js upgradeTower`, `TOWERS.*.up`, Lv.3 이면 `#tUp` = "최대 레벨") ② XP 별 ★→★★★ (`data/growth.js XP_NEED [0,600,2400]`, 판 시작 시 `ui/flow.js:65 G.grow = true` 로 항상 켜짐) ③ ★★★ 진화 분기 2택1 (`BRANCH`, `world/growth.js chooseBranch`, `ui/branch.js`).
영구(계정) 쪽은 🧪 연구소 `RES` (종류별 공격력 10 · 사거리 5 · 공속 8 · 시작 성장 4, `ui/lab.js`). 타워 1종 최대 = 영혼석 6,336 · 강철 144 · 마력석 20 (3종 ≈ 영혼석 19,000).

**채택 (판 안 해석):** 지금 하드 스테이지 판 위에 **화살탑·대포탑·마법탑 각각 1기 이상이 Lv.3 + ★★★ + 진화 선택 완료** 상태 = "3개 타워 모두 업그레이드 끝". 게임 UI 에서 '강화/업그레이드'는 판 안 버튼(`#tUp`)이고 연구소는 '연구'라 부르며, "상황"이라는 말도 판 안 조건에 맞음. 세 종류를 모두 키우게 만드는 판 안 목표가 됨.
**대안 (계정 해석):** 연구소 3종 연구 전부 최대. 원하면 `AWK.needLab = true` 한 줄로 조건에 추가(AND)할 수 있게 게이트 함수를 하나로 둠 (기본 false).

## 1. 해금 조건 · 표시
- 순수 함수 `awakenReady(towers, hard)` (`data/growth.js`): `hard && TTYPES.every(t => towers.some(w => !w.dead && w.type === t && w.lvl >= 3 && w.stars >= 3 && w.branch))`.
- 평가 위치: `world/growth.js checkAwaken()` — `chooseBranch()` 끝, `upgradeTower()` 끝(`world/towers.js:71-73`)에서만 호출 (매 프레임 아님). `G.hard` 는 `ui/flow.js:65` 스테이지 출정에서만 참 → 던전·무한의 탑·도전 모드는 자동 제외.
- 한 번 열리면 **그 판 동안 유지** (`G.awkOpen = true`; 나중에 팔리거나 부서져도 다시 잠기지 않음 — 짜증 방지).
- 잠김(티저): 하드에서 Lv.3 타워를 누르면 `#tinfo` 에 새 줄 `#tAwk`: `🔒 초월 (하드 전용) 🏹✔ 💣✖ 🔮✖ — 세 타워 모두 Lv.3·★★★·진화`. 노말에서는 표시 없음 (도움말 `ui/help.js` 에 한 줄).
- 해금 순간: 배너 `✨ 초월 해금! 세 타워가 정점에 올랐어요` (`hud.js banner`) + 조건을 만족한 타워마다 `ringFx`·빛기둥(분기 선택 연출 재사용) + `meteorCast`/`levelUp` 소리. 이후 해당 타워의 `#tUp` 이 `✨ 초월 (240G)` 로 바뀜.

## 2. 초월 효과 (분기 위에 덧씌움, 수치는 `AWK` 표 하나에)
공통: 피해 ×1.3 · 최대 내구도 ×1.3 (하드 타워 피해 ×1.25 `HARD.towerDmg` 상쇄) · Lv/별 표시는 `Lv.3 ✨초월`.
| 타워 | 이름 | 효과 | 분기별 |
|---|---|---|---|
| 🏹 화살탑 | **천궁** | 공속 ×1.1 · 모든 화살 **꿰뚫기 2회** (명중 후 3.5 안의 다음 적, 80%→65%) · 6타마다 **일제사격** 5발(서로 다른 적, 각 60%, 공중 포함) | 연발: 동시 대상 3→4 · 저격: 꿰뚫기도 방어 무시, 일제사격 대신 6타마다 피해 ×2 |
| 💣 대포탑 | **화염 포루** | 착탄 지점 **불바다** 반경 2.2 · 3초, 0.5초마다 착탄 피해 8% (지상만, 겹치면 가장 센 1개만) | 광역: 집속탄 3→5발 · 관통: 지나간 직선에 2초 불길(반폭 0.8, 같은 틱) |
| 🔮 마법탑 | **뇌전 첨탑** | 연쇄 +2 · 둔화 +10%p (상한 80%) · 8타마다 **천뢰**: 첫 대상 반경 3 광역 200% + 기절 0.8초 (보스 0.25초, 같은 보스 4초 쿨) | 폭풍: 연쇄 감쇠 그대로 · 서리: 연쇄 +1만, 빙결 주기 4→3타 |

참고(지금 Lv.3★★★ 수치, 연구 0): 연발 45.7×3.07/s×3대상, 저격 140, 광역 191(폭발 4.6), 관통 348, 폭풍 72.5×10연쇄, 서리 116.

## 3. 비용 · 제한
- **판 안 골드만** (영혼석·강철 없음 → 저장 변경 없음): 화살 240G · 대포 320G · 마법 340G (Lv.1~3 누적 투자 210/300/340G 의 약 1.1배). `tw.invest` 에 더해 판매 70% 환급 규칙(`sellTower`) 그대로.
- 종류별 최대 **2기** (`AWK.maxPerType`), 판 안 타워에만 적용(계정 소유물 아님). 초월 타워 수리비는 `repairCost` 그대로(투자액 비례라 자동 상승).

## 4. 하드 밸런스
하드: 체력 ×(1장 6.2 · 2장 4.2 · 3장 4 · 4장 2.6), 피해 ×1.85~2.1, 정예, 타워 피해 ×1.25 (`data/stages.js:72 HARD`). 초월 1기 ≈ 단일 대상 DPS +43%, 몰려올 때 ×1.8~2.1. 해금이 판 중후반(★★★ 3종 + Lv.3 3종 ≈ 900G+)이라 후반 웨이브 보조 수단. 목표: `tests/hard_balance.py` 시뮬에서 초월 1~2기로 하드 3·4장 후반 누수 30~40% 감소, 하드 ★3 은 여전히 어렵게. 숫자는 `AWK` 표만 조정.

## 5. 외형 · 성능
- `world/growth.js decorate()` 에 `awkDeco(tw)`: 금빛 왕관 링 + 궤도 룬 3개 + 색 오라 (화살 `#fff3a0`, 대포 `#ff5a2a`, 마법 `#ffe27a`). 지오메트리/재질은 모듈 상단에서 1번만 만들어 공유(`starGeo` 방식).
- 투사체: 화살 = `makeArrow(0xfff6a0)` big · 대포알 = `glow(0xff6a2a)` (toon 대신) · 천뢰 = 금색 `bolt` + `ringFx` 1개. 불바다 = 바닥 RingGeometry 가산 데칼 1장 + 틱마다 작은 `emit`.
- 성능 모드(`render/quality.js Q.perf`): 룬 회전·빛기둥 없음(정적 링 1개), 파티클 1/3, 불바다 틱 파티클 없음, **활성 불바다 상한 8** (오래된 것 재사용). `tests/stress.py` 로 high/perf FPS 비교.

## 6. 저장 · 서버
- **스키마 변경 없음**: 상태는 판 안 `tw.awk`·`G.awkOpen` 뿐, `account/progress.js clean/merge`·`supabase/schema.sql` 그대로. (대안 해석을 켜도 기존 `save.research` 만 읽음.)
- 통계만 메모리: `G.stats.awk`(초월 횟수) → `ui/endstats.js:15` 타워 이름에 `✨`. 새 `G.` 속성은 `node tests/gregistry.mjs --write` 로 `docs/G_REGISTRY.md` 갱신.

## 7. UI
- `#tinfo` (`index.html:40`, `ui/hud.js:28-36`): 이름 `화살탑 Lv.3 ✨천궁`, 설명 줄에 초월 효과, `#tAwk` 잠김 체크리스트, `#tUp` 문구 3가지(강화/🔒 최대 레벨/✨ 초월 nG/✨ 초월 완료).
- 미리보기: `#ups`(영웅 강화 Q-7 `upPreview`)는 그대로, 같은 방식으로 `#tUp` 의 `title`/`data-nx` 에 "피해 191→249 · 불바다 3초" (`towerStats(..., aw=true)` 비교, `ui/branch.js statLine` 재사용).
- 클릭: `ui/input.js:104 tUp.onclick` → Lv.3 이면 `awakenTower(G.sel)`.

## 8. 테스트
- `tests/awaken.test.mjs` (node): `towerStats(t,l,s,b,mods)` 기존 결과와 완전 동일(회귀) · `aw=true` 수치 · `awakenReady` 진리표(노말 false / 1종 빠짐 / 분기 없음 / Lv.2 / 모두 OK) · 비용 · 종류별 2기 제한 · `needLab` 대안.
- `tests/awaken.py` (Playwright, `?test&grow=1` + 하드): 노말 표시 없음 · 하드 2종만 → 🔒 체크리스트 · 3종 완료 → 배너·버튼 · 구매 → 골드·수치·장식 · 꿰뚫기/불바다/천뢰 계측(`G.awkN`) · 판매 환급 · `?gfx=perf` 장식 수 감소 · 콘솔 에러 0. `tests/run_all.sh SUITES` 에 `awaken` 추가. `growth.test.mjs`·`tower.py`·`hard.py`·`regress.py`(알려진 차이 4) 그대로 통과해야 함.

## 9. 구현 단계 (브랜치 `tower-awaken`)
- **W-0** 브랜치 · 이 계획을 `docs/AWAKEN_2026-10-24.md` 로.
- **W-1** `data/growth.js`: `AWK` 표, `awakenReady`, `awkCost`, `towerStats(..., aw=false)` 확장 + `awaken.test.mjs`.
- **W-2** `world/growth.js` `checkAwaken`/`awakenTower`/`awkDeco`, `world/towers.js` 호출 지점 · 내구도 ×1.3 · 발사 분기(꿰뚫기·일제사격·천뢰), `combat/projectiles.js` 화살 꿰뚫기·불바다(상한 8).
- **W-3** UI: `index.html #tAwk`, `ui/hud.js` · `ui/input.js` · `style.css`, 도움말.
- **W-4** 성능 모드 분기 · endstats `✨` · G 레지스트리.
- **W-5** `awaken.py` + `hard_balance.py` 수치 조정.
- **W-6** 전체 `bash tests/run_all.sh` · CHANGELOG · 병합.

## 사용자 결정 (2026-10-24 18:30 KST)
- 해금 조건: 판 안 (각 타워 종류 1기 이상 Lv.3 + ★★★ + 진화) **그리고** 연구소에서 3종 타워 연구 전부 만렙 — 둘 다 필수. `AWK.needLab = true` (기본값 켬). 🔒 체크리스트에 연구소 만렙 여부도 종류별로 표시.
