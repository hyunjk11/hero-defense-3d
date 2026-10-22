import { Snd } from './audio/audio.js';
import * as THREE from 'three';
import { $, rand, rnd } from './core/util.js';
import { CORE, GH, GW, SPAWN, SPAWNS, STAGE, HARDQ, T, tileX, tileZ, toTile } from './core/grid.js';
G.hard = HARDQ; G.eliteKills = 0; // 하드 모드 (출정 흐름에서는 ui/flow.js 가 해금 확인 후 다시 정함)
import { BLK } from './data/terrain.js';
import { startWarp } from './heroes/hero.js';
import { updPreview } from './ui/preview.js';
import { startFlow, updFlow } from './ui/flow.js';
import './ui/touch.js';
import './ui/branch.js';
import { towerXp, chooseBranch } from './world/growth.js';
import * as GROW from './data/growth.js';
import { QS } from './core/util.js';
import { onMove as _onMove, buildReason as _buildReason, setTool as _setTool } from './ui/input.js';
import { camera as _camera } from './render/scene.js';
import { CLASSES, VISIBLE_HEROES, isHidden } from './data/heroes.js';
import { ETYPES } from './data/monsters.js';
import { TOWERS } from './data/towers.js';
import { G, runTimer } from './core/state.js';
import { renderer, DAY, NIGHT, LIGHT, bloom, cam, composer, hemi, moon, scene, skyU, sun, updateCam } from './render/scene.js';
import { P, PB, emit, stars, updCoins, updDebris, updFx, updParticles } from './render/vfx.js';
import { BARS, updBars } from './render/hpbars.js';
import { GL, ASSETS, MON_ASSETS, heroAssets, loadAssets, loadBackground, makeEnemyModel, play } from './render/characters.js';
import { load as accLoad } from './account/account.js';
import { carve, damageTile, buildCore, buildPortal, coreLight, coreRings, crystal, genMap, initTerrainColors, portal, portalDisk, portalLight, refreshAll, refreshTile, tileAt } from './world/terrain.js';
import { computeDist, enterCost, field, fieldInfo, nextStep, pathStats } from './world/pathfinding.js';
import { updRoute } from './render/route.js';
import { updLoot } from './render/loot.js';
import { damageTower, repairAll, repairTower, sellTower, updTowers, upgradeTower } from './world/towers.js';
import { updProjs } from './combat/projectiles.js';
import { hurt, spawnEnemy } from './monsters/enemy.js';
import { separate, updEnemies, updLod } from './monsters/ai.js';
import { Q } from './render/quality.js';
import './ui/gfx.js';
import './ui/speed.js';
import { hero, heroDamage, heroGoTo, updHero, updParty } from './heroes/hero.js';
import { castSkill } from './heroes/skills.js';
import { castLegend, updLegend } from './heroes/legend.js';
import { endWave, startWave } from './core/waves.js';
import { refreshHud, updBossBar } from './ui/hud.js';
import { build, keys, mouseGround, moveMark, select, setTool } from './ui/input.js';
import { choose, showSelect, updSelect } from './ui/select.js';
import './render/toon.js';
import './audio/sfx.js';
import './world/barricades.js';
import { pendingSpawns, towerRateK } from './monsters/abilities.js';
import { ROSTERS } from './data/monsters.js';
import * as ROSTER from './core/roster.js';
import { updVolcano } from './render/volcano.js';
import { updRuins } from './render/ruins.js';
import { updDungeon } from './dungeon/run.js';
import { DUNGEON } from './core/grid.js';
import { DG_BASE, DG_PAID } from './data/dungeon.js';

Object.assign(G, { Q, STAGE_CFG: STAGE, ROSTERS, ROSTER, towerRateK, pendingSpawns, towerXp, chooseBranch, GROW, castLegend, SPAWNS, startWarp, renderer, carve, damageTile, refreshTile, computeDist, damageTower, repairTower, repairAll, field, fieldInfo, pathStats, makeEnemyModel, play, scene, THREE, nextStep, SPAWN, CORE, choose, startWave, castSkill, mouseGround, select, upgradeTower, sellTower, T, tileAt, cam, TOWERS, enterCost, spawnEnemy, GL, BARS, hurt, ETYPES, CLASSES, BLK, heroDamage, toTile, GW, GH });
G.build = (c, r, tool) => { setTool(tool); const ok = build(c, r); setTool('move'); return ok; };
G.setTool = _setTool; G.buildReason = (c, r, tool) => { const o = G.tool; G.tool = tool; const w = _buildReason(c, r); G.tool = o; return w; };
G.hoverTile = (c, r) => { const v = new THREE.Vector3(tileX(c), 0, tileZ(r)).project(_camera); const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight; _onMove(x, y); return [Math.round(x), Math.round(y), document.getElementById('tip').innerText]; };
G.heroGoTo = (x, z) => heroGoTo(new THREE.Vector3(x, 0, z));
G.tileXZ = (c, r) => [tileX(c), tileZ(r)];
G.heroShotMode = () => { G.heroShot = true; $('select').classList.add('hidden'); cam.target.set(0, 1.3, GH + 5.8); cam.r = 8.6; cam.phi = 1.4; cam.theta = 0; };

// ================= 조명 / 메인 루프 =================
function updLighting(dt) {
  G.night += (G.nightTarget - G.night) * Math.min(1, dt * 1.5); const n = G.night;
  skyU.top.value.copy(DAY.top).lerp(NIGHT.top, n); skyU.bot.value.copy(DAY.bot).lerp(NIGHT.bot, n); scene.fog.color.copy(DAY.fog).lerp(NIGHT.fog, n);
  const nl = n * LIGHT.nightK; sun.intensity = (2.6 * (1 - nl) + .25) * LIGHT.sun; moon.intensity = 1.4 * nl; hemi.intensity = (1.35 - .75 * nl) * LIGHT.hemi; stars.material.opacity = n;
  sun.color.setHSL(LIGHT.sunH, .6 - n * .3, .88 - n * .2); bloom.strength = (.32 + n * .22) * LIGHT.bloomK; portalLight.intensity = 20 + n * 60 + Math.sin(G.t * 6) * 8; coreLight.intensity = 3 + n * 5;
}
let lastT = performance.now(), hudT = 0;
function loop() { requestAnimationFrame(loop); const now = performance.now(), raw = (now - lastT) / 1000; lastT = now; if (!G.manual && !G.paused) { const dt = Math.min(raw, .05); for (let i = 0; i < (G.speed || 1); i++) step(dt); } // ×2 배속 = G.sim 처럼 같은 길이 스텝을 여러 번(더 큰 dt 아님), 일시정지 = 정지 (src/ui/speed.js)
  Q.tick(raw, !G.manual && (G.phase === 'build' || G.phase === 'wave')); if (!G.pauseRender) { updLod(); composer.render(); } }
G.Snd = Snd; G.sim = (sec, h = .05) => { for (let t = 0; t < sec; t += h) step(h); };
function step(dt) {
  if (G.slowT > 0) { dt *= G.slowF || .4; G.slowT -= dt; } // 메카닉 변신 연출: 잠깐 슬로 모션 (변신할 때만)
  G.t += dt;
  for (let i = G.timers.length - 1; i >= 0; i--) { const tm = G.timers[i]; tm.t -= dt; if (tm.t <= 0) { G.timers.splice(i, 1); runTimer(tm); } }
  if (G.phase === 'select') updSelect(dt);
  if (G.phase === 'wave') { if (G.spawnQ.length) { G.spawnT -= dt; if (G.spawnT <= 0) { G.spawnT = rnd(.55, .9); const t0 = G.spawnQ.shift(), el = G.spawnE ? G.spawnE.shift() : false; spawnEnemy(t0, G.hpMul, undefined, el); if (ETYPES[t0].pack && G.spawnQ[0] === t0) G.spawnT = .22; /* 무리는 붙어서 */ } } else if (!G.enemies.length && !pendingSpawns() && !G.dungeon) endWave(); }
  if (G.dungeon) updDungeon(dt); // 던전 원정: 층·웨이브·결과 (src/dungeon/run.js)
  if (hero && G.phase !== 'over' && G.phase !== 'select') {
    if (G.prof) { const pf = G.prof, tm = (k, f) => { const t0 = performance.now(); f(); pf[k] = (pf[k] || 0) + performance.now() - t0; };
      tm('hero', () => updHero(dt)); tm('enemies', () => updEnemies(dt)); tm('separate', () => separate(dt)); tm('towers', () => updTowers(dt)); tm('projs', () => updProjs(dt)); updLegend(dt); }
    else { if (G.heroes.length > 1) updParty(dt); else updHero(dt); updEnemies(dt); separate(dt); updTowers(dt); updProjs(dt); updLegend(dt); } if (hero.skillCd > 0) hero.skillCd -= dt;
    if (keys.w || keys.a || keys.s || keys.d || hero.path.length) cam.target.lerp(new THREE.Vector3(hero.g.position.x * .4, 0, hero.g.position.z * .4 + 1), dt * 2);
  }
  G.distT -= dt; if (G.distDirty && G.distT <= 0) { computeDist(); G.distT = .35; }
  for (const t of G.dirty) { refreshTile(t); if (t.shk > 0) t.shk -= dt; else G.dirty.delete(t); }
  updFlow(dt); updLoot(dt); updPreview(dt); updFx(dt); updParticles(P, dt); updParticles(PB, dt); updVolcano(dt); updRuins(dt); updDebris(dt); updCoins(dt); updLighting(dt); updRoute(); updBars(dt); updBossBar(dt); Snd.listener = cam.target; if (G.screenMusic) Snd.setMusic(G.screenMusic); else if (G.phase !== 'over') Snd.setMusic(G.phase === 'wave' ? (G.enemies.some(e => e.E.boss && !e.dead) ? 'boss' : 'wave') : 'build');
  portalDisk.rotation.z -= dt * 2.5; if (rand() < .6) emit(P, portal.position.x + rnd(-.3, .3), rnd(.6, 3.2), portal.position.z + rnd(-1.4, 1.4), 1, 0xc07aff, 1.5, .8, 2, .3);
  crystal.rotation.y += dt * 1.2; crystal.position.y = 3.6 + Math.sin(G.t * 2) * .2; coreRings.forEach((r, k) => r.rotation.z += dt * (k ? -1.5 : 1));
  if (moveMark.visible) { moveMark.scale.multiplyScalar(1 - dt * 3); moveMark.material.opacity = moveMark.scale.x; if (moveMark.scale.x < .2) moveMark.visible = false; }
  G.shake = Math.max(0, G.shake - dt * 1.8); updateCam(); hudT += dt; if (hudT > .15) { hudT = 0; if (G.phase !== 'select' && G.phase !== 'loading' && G.phase !== 'town' && G.phase !== 'menu') refreshHud(); }
}
genMap(); initTerrainColors(); refreshAll(); buildPortal(); buildCore(); computeDist(); updateCam(); loop();
// 첫 로딩 계획 (P-2 지연 로딩). ?test/?skipintro(테스트·영웅 선택 화면) = 전부 먼저 (?lazy 로 끌 수 있음)
//  스테이지 출정: 몬스터 + 저장된 영웅(유료면 대체 영웅 마법사도, 버들이면 장비·변신 로봇까지)만 — 판 중에는 영웅이 바뀌지 않으므로 백그라운드 로딩 없음
//  인트로/마을: 저장된 영웅만 먼저 → 백그라운드로 몬스터(마을 '도전' 출정용) → 무료 영웅 → 유료 영웅 → 변신 로봇 (버들 저장이면 로봇을 앞쪽으로)
function bootPlan() {
  if ((QS.has('test') || QS.has('skipintro')) && !QS.has('lazy')) return { first: ASSETS, bg: [] };
  let h = 'mage'; try { const s = accLoad(); if (CLASSES[s.hero] && !isHidden(s.hero)) h = s.hero; } catch (e) {}
  const heroes = CLASSES[h].paid ? [h, 'mage'] : [h], uniq = a => [...new Set(a)];
  if (DUNGEON && QS.has('run')) return { first: uniq([...MON_ASSETS, ...[...DG_BASE, ...DG_PAID].flatMap(c => heroAssets(c, true))]), bg: [] }; // 던전 원정: 몬스터 + 파티 (로즈는 소유 확인 전이라 같이 받음)
  if (STAGE && QS.has('run')) return { first: uniq([...MON_ASSETS, ...heroes.flatMap(c => heroAssets(c, true))]), bg: [] };
  const first = uniq(heroes.flatMap(c => heroAssets(c))), order = [...MON_ASSETS, ...(h === 'mechanic' ? ['mech_robot_meshy'] : []), ...VISIBLE_HEROES.filter(c => !CLASSES[c].paid).flatMap(c => heroAssets(c)), ...VISIBLE_HEROES.filter(c => CLASSES[c].paid).flatMap(c => heroAssets(c, true))];
  return { first, bg: uniq(order).filter(k => !first.includes(k)) };
}
const PLAN = bootPlan(); G.loadPlan = PLAN;
loadAssets(PLAN.first).then(() => { G.ready = true; $('loading').classList.add('hidden'); G.bgModels = loadBackground(PLAN.bg).then(() => (G.allModels = true)); if (QS.has('flow') || !(QS.has('test') || QS.has('skipintro'))) startFlow(); else showSelect(); })
  .catch(err => { console.warn(err); $('loadTxt').textContent = '모델을 불러오지 못했습니다. 새로고침 해주세요.'; });
