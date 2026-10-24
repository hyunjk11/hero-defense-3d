# 전역 `G` 레지스트리 (C-7, 2026-10-23)

`window.G` (src/core/state.js) 는 상태 + 모듈 간 함수 훅을 담는 공용 객체. 여러 모듈이 런타임에 속성을 붙이고, 테스트(tests/*.py)가 `G.` 이름을 직접 씀 → **이름은 API 로 고정** (바꾸지 말 것).

규칙
- 새 속성/훅을 붙이면 `node tests/gregistry.mjs --write` 로 아래 표를 갱신하고 설명 칸을 채운다 (`tests/gregistry.test.mjs` 가 빠진 이름을 잡음).
- 런타임 동작은 바꾸지 않음: state.js 에 null 로 미리 선언하지 않는다 (`G.x === undefined`·`'x' in G` 검사가 있을 수 있어서). 이 문서가 선언 목록.
- 영웅별 스냅샷(`Object.assign(G, L)` — hero.js withHero, dungeon/run.js 파티)은 영웅 상태 키를 통째로 바꿔 끼움: `hero perm equip legend adv uq` 등.
- 설명 칸이 자동 추정(함수 훅/계측/던전 상태…)인 줄은 정의 위치를 보고 고쳐도 됨 — `--write` 가 고친 설명을 유지함.

<!-- AUTO -->
| 속성 | 설정하는 모듈 (src/) | 테스트 참조 수 | 설명 |
|---|---|---:|---|
| `adv` | ui/flow.js | 2 |  |
| `advBar` | ui/flow.js | 1 |  |
| `advDmg` | heroes/advfx.js | 2 | 계측/카운터 (테스트·통계용) |
| `advHeal` | heroes/advfx.js · heroes/fighter.js | 2 |  |
| `advModelFail` | dungeon/run.js · ui/flow.js · ui/select.js | 1 |  |
| `advN` | heroes/advfx.js | 43 | 계측/카운터 (테스트·통계용) |
| `allModels` | main.js | 3 | main.js 가 노출하는 값/함수 |
| `autoWaveAt` | ui/autowave.js | 0 | Q-13 다음 웨이브 자동 시작 시각 (G.t 기준, 0 = 꺼짐) |
| `barRes` | ui/flow.js | 1 | 🧱 바리케이드 보강 연구 배수 (account/steel.js barMul, 판 시작 시 · 2026-10-24) |
| `BARS` | main.js | 1 | main.js 가 노출하는 값/함수 |
| `bgModels` | main.js | 0 | main.js 가 노출하는 값/함수 |
| `blessTab` | ui/flow.js | 8 |  |
| `BLK` | main.js | 1 | main.js 가 노출하는 값/함수 |
| `build` | main.js | 27 | 함수 훅 (다른 모듈·테스트가 호출) |
| `buildReason` | main.js | 16 | 함수 훅 (다른 모듈·테스트가 호출) |
| `cam` | main.js | 83 | main.js 가 노출하는 값/함수 |
| `carve` | main.js | 1 | 함수 훅 (다른 모듈·테스트가 호출) |
| `carved` | world/terrain.js | 4 |  |
| `castLegend` | main.js | 2 | 함수 훅 (다른 모듈·테스트가 호출) |
| `castSkill` | main.js | 8 | 함수 훅 (다른 모듈·테스트가 호출) |
| `choose` | main.js | 46 | main.js 가 노출하는 값/함수 |
| `chooseBranch` | main.js | 3 | 함수 훅 (다른 모듈·테스트가 호출) |
| `chooseWait` | ui/select.js | 0 | 함수 훅 (다른 모듈·테스트가 호출) |
| `CLASSES` | main.js | 0 | main.js 가 노출하는 값/함수 |
| `classic` | core/state.js | 0 | 기본 상태 (state.js 초기값) |
| `closeBlessing` | ui/flow.js | 4 | 함수 훅 (다른 모듈·테스트가 호출) |
| `closeLab` | ui/flow.js | 3 | 함수 훅 (다른 모듈·테스트가 호출) |
| `coins` | core/state.js | 0 | 기본 상태 (state.js 초기값) |
| `computeDist` | main.js | 5 | main.js 가 노출하는 값/함수 |
| `CORE` | main.js | 21 | main.js 가 노출하는 값/함수 |
| `coreHb` | world/terrain.js | 0 |  |
| `coreHp` | core/state.js · monsters/enemy.js | 27 | 기본 상태 (state.js 초기값) |
| `coreMax` | core/state.js | 14 | 기본 상태 (state.js 초기값) |
| `curHero` | heroes/hero.js | 0 |  |
| `D` | core/state.js · world/pathfinding.js | 0 | 기본 상태 (state.js 초기값) |
| `damageTile` | main.js | 1 | 함수 훅 (다른 모듈·테스트가 호출) |
| `damageTower` | main.js | 4 | main.js 가 노출하는 값/함수 |
| `dg` | dungeon/run.js | 75 | 던전 상태 |
| `dgAiSkills` | dungeon/run.js | 3 | 던전 상태 |
| `dgB` | dungeon/boss.js | 20 | 던전 상태 |
| `dgBlessLog` | dungeon/run.js | 0 | 계측/카운터 (테스트·통계용) |
| `dgBossClear` | dungeon/boss.js | 0 | 던전 상태 |
| `dgBossModel` | dungeon/run.js | 2 | 던전 상태 |
| `dgDmg` | dungeon/run.js | 1 | 계측/카운터 (테스트·통계용) |
| `dgEntry` | ui/dungeon.js | 2 | 던전 상태 |
| `dgEntryMode` | dungeon/run.js | 2 | 던전 상태 |
| `dgJoint` | dungeon/run.js | 4 | 던전 상태 |
| `dgJointHits` | dungeon/run.js | 1 | 계측/카운터 (테스트·통계용) |
| `dgJointN` | dungeon/run.js | 0 | 계측/카운터 (테스트·통계용) |
| `dgLastBuy` | ui/dungeon.js | 10 | 던전 상태 |
| `dgM` | dungeon/run.js | 0 | 던전 상태 |
| `dgPick` | dungeon/run.js | 0 | 던전 상태 |
| `dgResult` | dungeon/run.js | 28 | 던전 상태 |
| `dgStartFloor` | dungeon/run.js | 1 | 던전 상태 |
| `dgTakeBless` | dungeon/run.js | 5 | 던전 상태 |
| `dirty` | core/state.js | 0 | 기본 상태 (state.js 초기값) |
| `distDirty` | core/state.js · world/pathfinding.js · world/terrain.js | 0 | 기본 상태 (state.js 초기값) |
| `distT` | core/state.js · main.js | 0 | 기본 상태 (state.js 초기값) |
| `dmOther` | heroes/hero.js | 7 |  |
| `dmTowers` | heroes/hero.js | 4 |  |
| `dropCh` | ui/flow.js | 0 |  |
| `dungeon` | dungeon/run.js | 14 |  |
| `eliteKills` | dungeon/run.js · main.js · monsters/enemy.js · ui/flow.js | 3 | 계측/카운터 (테스트·통계용) |
| `endStats` | ui/endstats.js | 6 |  |
| `endStatsShow` | ui/endstats.js | 0 |  |
| `endStatsUI` | ui/endstats.js | 3 |  |
| `enemies` | core/state.js | 178 | 기본 상태 (state.js 초기값) |
| `enterCost` | main.js | 0 | main.js 가 노출하는 값/함수 |
| `equip` | ui/flow.js | 1 |  |
| `ETYPES` | main.js | 14 | main.js 가 노출하는 값/함수 |
| `field` | main.js | 2 | main.js 가 노출하는 값/함수 |
| `fieldInfo` | main.js | 2 | main.js 가 노출하는 값/함수 |
| `frameN` | monsters/ai.js | 0 | 계측/카운터 (테스트·통계용) |
| `ftN` | heroes/fighter.js | 25 | 계측/카운터 (테스트·통계용) |
| `fxs` | core/state.js | 0 | 기본 상태 (state.js 초기값) |
| `gear` | ui/flow.js | 237 |  |
| `GH` | main.js | 23 | main.js 가 노출하는 값/함수 |
| `GL` | main.js | 8 | main.js 가 노출하는 값/함수 |
| `gold` | core/state.js · core/waves.js · dungeon/run.js · monsters/enemy.js · ui/flow.js · ui/input.js · world/towers.js | 60 | 기본 상태 (state.js 초기값) |
| `grow` | core/state.js · dungeon/run.js · ui/flow.js | 3 | 기본 상태 (state.js 초기값) |
| `GROW` | main.js | 2 | main.js 가 노출하는 값/함수 |
| `gunN` | heroes/gunner.js | 7 | 계측/카운터 (테스트·통계용) |
| `GW` | main.js | 20 | main.js 가 노출하는 값/함수 |
| `hard` | dungeon/run.js · main.js · ui/flow.js | 5 |  |
| `help` | ui/help.js | 1 | Q-3 단축키 안내 { openHelp, closeHelp, helpOpen, HELP } |
| `hero` | heroes/hero.js | 524 |  |
| `heroDamage` | main.js | 18 | main.js 가 노출하는 값/함수 |
| `heroes` | heroes/hero.js | 110 |  |
| `heroGoTo` | main.js | 5 | 함수 훅 (다른 모듈·테스트가 호출) |
| `heroShot` | main.js | 0 | 함수 훅 (다른 모듈·테스트가 호출) |
| `heroShotMode` | main.js | 2 | main.js 가 노출하는 값/함수 |
| `heroStat` | heroes/hero.js | 4 |  |
| `hoverTile` | main.js | 3 | main.js 가 노출하는 값/함수 |
| `hpMul` | core/waves.js | 3 |  |
| `hurt` | main.js | 71 | main.js 가 노출하는 값/함수 |
| `labTab` | ui/lab.js | 2 |  |
| `legend` | ui/flow.js | 1 | 전설 스킬 상태 |
| `legendDmg` | heroes/fighter.js · heroes/gunner.js · heroes/legend.js · heroes/mechanic.js | 16 | 계측/카운터 (테스트·통계용) |
| `legendDmgGun` | heroes/gunner.js | 0 | 계측/카운터 (테스트·통계용) |
| `legendExec` | heroes/legend.js | 3 | 전설 스킬 상태 |
| `legendFreeze` | heroes/legend.js | 2 | 전설 스킬 상태 |
| `legendN` | heroes/legend.js | 32 | 계측/카운터 (테스트·통계용) |
| `legendPool` | heroes/legend.js | 3 | 전설 스킬 상태 |
| `legendRoot` | heroes/legend.js | 1 | 전설 스킬 상태 |
| `legendSeed` | heroes/legend.js | 4 | 전설 스킬 상태 |
| `lfx` | heroes/legend.js | 8 | 전설 스킬 상태 |
| `loadPlan` | main.js | 0 | 함수 훅 (다른 모듈·테스트가 호출) |
| `lowQ` | monsters/ai.js | 0 |  |
| `makeEnemyModel` | main.js | 2 | main.js 가 노출하는 값/함수 |
| `manual` | core/state.js | 67 | 기본 상태 (state.js 초기값) |
| `mechN` | heroes/mechanic.js | 18 | 계측/카운터 (테스트·통계용) |
| `mK` | combat/projectiles.js · core/state.js · dungeon/run.js · heroes/hero.js | 0 | 기본 상태 (state.js 초기값) |
| `mouseGround` | main.js | 23 | main.js 가 노출하는 값/함수 |
| `mTw` | combat/projectiles.js · world/towers.js | 0 |  |
| `mWho` | combat/projectiles.js · dungeon/run.js · world/towers.js | 0 |  |
| `nextStep` | main.js | 1 | main.js 가 노출하는 값/함수 |
| `night` | core/state.js · main.js | 1 | 기본 상태 (state.js 초기값) |
| `nightTarget` | core/state.js · core/waves.js · dungeon/run.js · ui/flow.js | 0 | 기본 상태 (state.js 초기값) |
| `nudgeN` | monsters/ai.js | 3 | 계측/카운터 (테스트·통계용) |
| `onBranchReady` | ui/branch.js | 0 | 함수 훅 (다른 모듈·테스트가 호출) |
| `onHeroDown` | dungeon/run.js | 0 | 함수 훅 (다른 모듈·테스트가 호출) |
| `onRunEnd` | ui/flow.js | 0 | 함수 훅 (다른 모듈·테스트가 호출) |
| `onStageClear` | ui/result.js | 1 | 함수 훅 (다른 모듈·테스트가 호출) |
| `openBlessing` | ui/flow.js | 6 | 함수 훅 (다른 모듈·테스트가 호출) |
| `openBranch` | ui/branch.js | 0 | 함수 훅 (다른 모듈·테스트가 호출) |
| `openDungeon` | ui/dungeon.js | 18 | 함수 훅 (다른 모듈·테스트가 호출) |
| `openLab` | ui/lab.js | 4 | 함수 훅 (다른 모듈·테스트가 호출) |
| `partyAI` | dungeon/run.js | 6 |  |
| `pathStats` | main.js · world/pathfinding.js | 1 |  |
| `pathVer` | world/pathfinding.js | 0 |  |
| `paused` | dungeon/run.js · ui/speed.js | 19 |  |
| `pendingSpawns` | main.js | 0 | main.js 가 노출하는 값/함수 |
| `perm` | ui/flow.js | 3 |  |
| `phase` | core/waves.js · dungeon/run.js · ui/flow.js · ui/result.js · ui/select.js | 133 |  |
| `pickBranch` | ui/branch.js | 0 | 함수 훅 (다른 모듈·테스트가 호출) |
| `play` | main.js | 3 | main.js 가 노출하는 값/함수 |
| `projs` | core/state.js | 3 | 기본 상태 (state.js 초기값) |
| `Q` | main.js | 14 | main.js 가 노출하는 값/함수 |
| `ready` | core/state.js · main.js | 116 | 기본 상태 (state.js 초기값) |
| `refreshTile` | main.js | 5 | 함수 훅 (다른 모듈·테스트가 호출) |
| `renderer` | main.js | 11 | main.js 가 노출하는 값/함수 |
| `repairAll` | main.js | 0 | main.js 가 노출하는 값/함수 |
| `repairTower` | main.js | 2 | main.js 가 노출하는 값/함수 |
| `research` | core/state.js · dungeon/run.js · ui/flow.js | 1 | 기본 상태 (state.js 초기값) |
| `ROSTER` | main.js | 0 | main.js 가 노출하는 값/함수 |
| `ROSTERS` | main.js | 3 | main.js 가 노출하는 값/함수 |
| `route` | render/route.js | 17 |  |
| `routes` | render/route.js | 10 |  |
| `routeVis` | render/route.js | 1 |  |
| `runBossKills` | dungeon/run.js · monsters/enemy.js · ui/flow.js | 0 | 계측/카운터 (테스트·통계용) |
| `runDrops` | dungeon/run.js · monsters/enemy.js · ui/flow.js | 3 |  |
| `runSaved` | ui/result.js | 0 |  |
| `runStart` | dungeon/run.js · ui/flow.js | 0 |  |
| `scene` | main.js | 34 | main.js 가 노출하는 값/함수 |
| `screen` | ui/flow.js | 156 |  |
| `screenMusic` | ui/flow.js | 0 |  |
| `seenMon` | core/waves.js | 2 |  |
| `sel` | core/state.js · ui/input.js | 0 | 기본 상태 (state.js 초기값) |
| `select` | main.js | 8 | main.js 가 노출하는 값/함수 |
| `sellTower` | main.js | 4 | main.js 가 노출하는 값/함수 |
| `setPaused` | ui/speed.js | 7 | 함수 훅 (다른 모듈·테스트가 호출) |
| `setSpeed` | ui/speed.js | 6 | 함수 훅 (다른 모듈·테스트가 호출) |
| `setTool` | main.js | 5 | 함수 훅 (다른 모듈·테스트가 호출) |
| `shake` | combat/projectiles.js · core/state.js · dungeon/boss.js · dungeon/run.js · heroes/advfx.js · heroes/fighter.js · heroes/gunner.js · heroes/hero.js · heroes/legend.js · heroes/mechanic.js · heroes/unique.js · main.js · monsters/abilities.js · monsters/ai.js · monsters/enemy.js · world/growth.js · world/terrain.js · world/towers.js | 1 | 기본 상태 (state.js 초기값) |
| `shop` | ui/shop.js | 74 |  |
| `sim` | main.js | 415 | main.js 가 노출하는 값/함수 |
| `slowF` | heroes/mechanic.js | 0 |  |
| `slowN` | heroes/mechanic.js | 0 | 계측/카운터 (테스트·통계용) |
| `slowT` | heroes/mechanic.js · main.js | 2 |  |
| `Snd` | main.js | 23 | main.js 가 노출하는 값/함수 |
| `SPAWN` | main.js | 4 | 계측/카운터 (테스트·통계용) |
| `spawnE` | core/waves.js | 7 |  |
| `spawnEnemy` | main.js | 30 | main.js 가 노출하는 값/함수 |
| `spawnIdx` | monsters/enemy.js | 0 |  |
| `spawnQ` | core/state.js · core/waves.js | 48 | 기본 상태 (state.js 초기값) |
| `SPAWNS` | main.js | 8 | main.js 가 노출하는 값/함수 |
| `spawnT` | core/waves.js · main.js | 0 |  |
| `speed` | ui/speed.js | 14 |  |
| `spire` | dungeon/spire.js | 3 | 🗼 무한의 탑 판 상태 {from, week, top, practice} — 탑 판에서만 있음 (원정·일반 판 undefined) |
| `spireE` | dungeon/spire.js | 1 | 🗼 탑 몬스터 정의 훅 (enemy.js spawnEnemy: 정예·보스 체력·가속·철갑) — 탑 판에서만 |
| `spireAtkK` | dungeon/spire.js | 1 | 🗼 T-5 몬스터 근접 공격 배수 훅 (ai.js: 😡 광폭) — 탑 판에서만 |
| `spireDmgK` | dungeon/spire.js | 1 | 🗼 T-5 영웅 피해 배수 훅 (enemy.js hurt: 🔮마법·🏹원거리 저항) — 탑 판에서만 |
| `stage` | dungeon/run.js · ui/flow.js | 31 |  |
| `STAGE_CFG` | main.js | 7 | main.js 가 노출하는 값/함수 |
| `stageSel` | ui/flow.js | 30 |  |
| `startWarp` | main.js | 6 | 함수 훅 (다른 모듈·테스트가 호출) |
| `startWave` | main.js | 47 | 함수 훅 (다른 모듈·테스트가 호출) |
| `stats` | core/state.js | 49 | 기본 상태 (state.js 초기값) |
| `statsUI` | ui/stats.js | 8 |  |
| `structVer` | world/pathfinding.js | 0 |  |
| `t` | core/state.js · main.js | 20 | 기본 상태 (state.js 초기값) |
| `T` | main.js | 9 | main.js 가 노출하는 값/함수 |
| `THREE` | main.js | 15 | main.js 가 노출하는 값/함수 |
| `tileAt` | main.js | 40 | main.js 가 노출하는 값/함수 |
| `tiles` | core/state.js | 5 | 기본 상태 (state.js 초기값) |
| `tileXZ` | main.js | 37 | 함수 훅 (다른 모듈·테스트가 호출) |
| `timers` | core/state.js | 0 | 기본 상태 (state.js 초기값) |
| `tool` | core/state.js · main.js · ui/input.js | 7 | 기본 상태 (state.js 초기값) |
| `toTile` | main.js | 21 | main.js 가 노출하는 값/함수 |
| `towerRateK` | main.js | 10 | main.js 가 노출하는 값/함수 |
| `towers` | core/state.js | 60 | 기본 상태 (state.js 초기값) |
| `TOWERS` | main.js | 10 | main.js 가 노출하는 값/함수 |
| `towerXp` | main.js | 9 | main.js 가 노출하는 값/함수 |
| `townGoal` | ui/flow.js | 7 | 함수 훅 (다른 모듈·테스트가 호출) |
| `townHero` | ui/flow.js | 27 | 함수 훅 (다른 모듈·테스트가 호출) |
| `townLab` | ui/flow.js | 2 | 함수 훅 (다른 모듈·테스트가 호출) |
| `townShop` | ui/flow.js | 1 | 함수 훅 (다른 모듈·테스트가 호출) |
| `townSmith` | ui/flow.js | 1 | 함수 훅 (다른 모듈·테스트가 호출) |
| `townTeleport` | ui/flow.js | 11 | 함수 훅 (다른 모듈·테스트가 호출) |
| `townTower` | ui/flow.js | 5 | 함수 훅 (다른 모듈·테스트가 호출) |
| `uniqueSeed` | heroes/unique.js | 1 |  |
| `unjamN` | monsters/ai.js | 0 | 계측/카운터 (테스트·통계용) |
| `unstuckN` | heroes/hero.js | 0 | 계측/카운터 (테스트·통계용) |
| `upgradeTower` | main.js | 6 | main.js 가 노출하는 값/함수 |
| `ups` | core/state.js | 6 | 기본 상태 (state.js 초기값) |
| `uq` | heroes/unique.js · ui/flow.js | 4 | 고유 장비 상태 |
| `uqDmg` | heroes/unique.js | 10 | 계측/카운터 (테스트·통계용) |
| `uqInit` | heroes/unique.js | 3 | 고유 장비 상태 |
| `uqKill` | heroes/unique.js | 0 | 고유 장비 상태 |
| `uqN` | heroes/unique.js | 25 | 계측/카운터 (테스트·통계용) |
| `wallsBroken` | world/terrain.js | 1 |  |
| `warpN` | heroes/hero.js | 4 | 계측/카운터 (테스트·통계용) |
| `wave` | core/state.js · core/waves.js · dungeon/run.js | 39 | 기본 상태 (state.js 초기값) |
| `waveLog` | heroes/hero.js | 5 | 계측/카운터 (테스트·통계용) |
| `wavePrev` | ui/waveprev.js | 4 |  |
| `withHero` | heroes/hero.js | 4 | 함수 훅 (다른 모듈·테스트가 호출) |
| `xpSrc` | combat/projectiles.js · world/towers.js | 0 |  |
