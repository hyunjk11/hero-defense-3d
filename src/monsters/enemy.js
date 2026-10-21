import { Snd } from '../audio/audio.js';
import { rand, rnd } from '../core/util.js';
import { SPAWN, SPAWNS, tileX, tileZ, GW, STAGE } from '../core/grid.js';
import { ETYPES } from '../data/monsters.js';
import { G, later } from '../core/state.js';
import { scene } from '../render/scene.js';
import { disposeObj } from '../render/toon.js';
import { P, PB, debris, dmgText, emit, popCoins } from '../render/vfx.js';
import { hpBar } from '../render/hpbars.js';
import { shadowOf } from './ai.js';
import { makeEnemyModel, play } from '../render/characters.js';
import { core, crystalMat } from '../world/terrain.js';
import { enemyAim } from '../world/towers.js';
import { gameOver } from '../core/waves.js';
import { banner } from '../ui/hud.js';
import { towerXp } from '../world/growth.js';
import { KILL_XP } from '../data/growth.js';
import { lootFx } from '../render/loot.js';
import { BOSS_DROP, bossOdds, randomItem, GRADES } from '../account/equip.js';
import { initAbilities, armorOf, crackHit, absorbShield, onKilled } from './abilities.js';
import { HARD } from '../data/stages.js';
import { shareGeo } from '../render/toon.js';
import * as THREE from 'three';

// ---------- 하드 모드: 종류별 강화 수치 (캐시). 체력은 웨이브 배수(G.hpMul)에 HARD.hp 가 이미 곱해짐 → 여기서는 보스·정예 추가분만 E.hp 에 넣음
// (분열 새끼는 e.max / e.E.hp = G.hpMul 로 태어나므로 정예·보스 추가 체력은 물려받지 않음)
const HARD_E = new Map(), DMG_KEYS = ['tower', 'hero', 'dps', 'bar', 'block'];
function scaleAb(ab, boss) { if (!ab) return ab; const o = {}; for (const [k, v] of Object.entries(ab)) { if (!v || typeof v !== 'object') { o[k] = v; continue; } const c = { ...v };
  for (const d of DMG_KEYS) if (typeof c[d] === 'number' && k !== 'shield') c[d] = c[d] * HARD.dmg; if (boss && typeof c.every === 'number') { c.every *= HARD.bossCd; if (typeof c.first === 'number') c.first *= HARD.bossCd; } o[k] = c; } return o; }
export function hardE(type, elite) { const key = type + (elite ? '*' : ''); let H = HARD_E.get(key); if (H) return H; const E = ETYPES[type];
  H = { ...E, dps: E.dps * HARD.dmg, spd: E.spd * HARD.spd, hard: true };
  if (E.sprint) H.sprint = E.sprint * HARD.spd; if (E.towerDps) H.towerDps = E.towerDps * HARD.dmg; if (E.bomb) H.bomb = { ...E.bomb, tower: E.bomb.tower * HARD.dmg, bar: E.bomb.bar * HARD.dmg, hero: E.bomb.hero * HARD.dmg };
  if (E.ab) H.ab = scaleAb(E.ab, !!E.boss); if (E.boss) H.hp = E.hp * HARD.bossHp;
  if (elite) Object.assign(H, { elite: true, hp: E.hp * HARD.eliteHp, h: E.h * HARD.eliteScale, gold: E.gold * HARD.eliteGold, core: E.core + HARD.eliteCore, n: '정예 ' + E.n });
  HARD_E.set(key, H); return H; }
let _eRingG = null, _eRingM = null, _eAuraM = null;
function eliteMark(e) { _eRingG ||= shareGeo(new THREE.RingGeometry(.66, 1, 40)); _eRingM ||= new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: .9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  _eAuraM ||= new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: .3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const r = Math.max(.9, e.E.h * .42) / HARD.eliteScale, ring = new THREE.Mesh(_eRingG, _eRingM), aura = new THREE.Mesh(_eRingG, _eAuraM); ring.rotation.x = aura.rotation.x = -Math.PI / 2; ring.position.y = .1; aura.position.y = .14;
  ring.scale.setScalar(r); aura.scale.setScalar(r * 1.35); ring.userData.elite = aura.userData.elite = 1; e.g.add(ring, aura); e.eliteRing = ring;
  if (e.m.mats) for (const m of e.m.mats) if (m.emissive) { m.emissive.setHex(0x5a0a00); m.userData.e = m.emissive.clone(); } } // 붉은 기운 (피격 플래시 후에도 유지)


// ================= 적 =================
// at = { x, z, tile } 이면 포털 대신 그 자리에서 (분열한 슬라임 등) — 포털 순번·출현 연출 없음
function spawnEnemy(type, hpMul, at, elite = false) {
  const hard = !!(G.hard && STAGE), E = hard ? hardE(type, !!elite) : ETYPES[type], m = makeEnemyModel(type), hp = E.hp * hpMul; scene.add(m.g);
  if (E.elite) m.g.scale.setScalar(HARD.eliteScale);
  const sp = at ? at.tile : SPAWNS.length > 1 ? SPAWNS[(G.spawnIdx = ((G.spawnIdx || 0) + 1)) % SPAWNS.length] : SPAWN, side = sp[0] <= 0 || sp[0] >= GW - 1; // 여러 포털이면 번갈아
  if (at) m.g.position.set(at.x, 0, at.z); else { m.g.position.set(tileX(sp[0]) + (side ? (sp[0] <= 0 ? .4 : -.4) : rnd(-.5, .5)), 0, tileZ(sp[1]) + (side ? rnd(-.5, .5) : sp[1] <= 0 ? .4 : -.4)); m.g.rotation.y = side ? (sp[0] <= 0 ? Math.PI / 2 : -Math.PI / 2) : (sp[1] <= 0 ? 0 : Math.PI); }
  const e = { type, E, m, g: m.g, hp, max: hp, ai: E.ai || 'basic', profile: E.profile || 'default', tile: sp.slice(), next: null, off: [rnd(-.45, .45), rnd(-.45, .45)], slowT: 0, slowAmt: 0, flash: 0, atkCd: rnd(0, .5), hitT: rnd(0, .3), state: 'walk', spawnT: 0, dead: false, bob: rand() * 6 };
  if (E.ab) initAbilities(e); if (E.elite) { e.elite = true; eliteMark(e); }
  if (at) { e.hb = hpBar(m.g, E.fly ? 4 : E.h + .35, Math.max(1.1, E.h * .55), 0x55ff77, { auto: true, h: .15 }); shadowOf(e); G.enemies.push(e); return e; }
  if (!E.fly) { const a = play(m, 'Spawn_Ground_Skeletons', { once: true, speed: 2, fade: 0 }); if (E.elite && !E.boss) banner(`⚠ ${E.n} 출현!`, '#ff8a4a', 1200); e.state = 'spawn'; e.spawnT = a ? Math.min(1.4, a.getClip().duration / 2) : 0; emit(P, m.g.position.x, .3, m.g.position.z, 12, 0x9a7a5a, 3, .6, -6, 1.5); }
  e.hb = hpBar(m.g, E.fly ? 4 : E.h + .35, E.boss ? 3 : E.elite ? Math.max(1.5, E.h * .6) : Math.max(1.1, E.h * .55), E.boss ? 0xff3a4a : E.elite ? 0xff8a2a : 0x55ff77, { auto: !E.boss && !E.elite, h: E.boss ? .22 : E.elite ? .18 : .15 });
  if (E.boss) { G.shake = .7; Snd.roar(m.g.position); banner(`⚠ 보스 출현: ${E.n} ⚠`, '#ff4a5a', 2200); emit(PB, m.g.position.x, 2, m.g.position.z, 40, 0xff3a3a, 8, 1, -2, 2); }
  emit(P, m.g.position.x, 1.5, m.g.position.z, 14, 0xc07aff, 4, .5); shadowOf(e); G.enemies.push(e); return e;
}
// 방패병: 공격 방향(src)과 바라보는 방향의 각도로 피해 감소. 정면 원거리 대폭 감소, 근접은 일부, 옆은 소폭, 뒤는 추가 피해. src 없는 범위/번개 공격은 무시
function shieldFactor(e, src) {
  const S = e.E.shieldDef; if (!S || !src || e.dying !== undefined) return 1;
  const g = e.g, fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y), dx = src.x - g.position.x, dz = src.z - g.position.z, d = Math.hypot(dx, dz) || 1;
  const ang = Math.acos(Math.max(-1, Math.min(1, (fx * dx + fz * dz) / d))) * 180 / Math.PI, melee = src.kind === 'melee';
  const red = ang <= S.arc ? (melee ? S.melee : S.front) : ang <= S.side ? (melee ? S.sideRed / 2 : S.sideRed) : S.back;
  e.lastShield = { ang, red, kind: src.kind }; return 1 - red;
}
// 타워 XP: 타워 공격 중(G.xpSrc)이면 실제로 깎은 체력 + 처치 보너스를 그 타워에 (성장 꺼짐이면 G.xpSrc는 항상 null)
function hurt(e, dmg, color, big, src) { const tw = G.xpSrc; if (!tw || e.dead) return hurt0(e, dmg, color, big, src); const h0 = Math.max(0, e.hp); hurt0(e, dmg, color, big, src); towerXp(tw, h0 - Math.max(0, e.hp) + (e.dead ? KILL_XP : 0)); }
function hurt0(e, dmg, color = '#fff', big = false, src = null) {
  if (e.dead) return; if (e.immT > G.t && dmg < 1e8) { if (!(e.immTxt > G.t)) { e.immTxt = G.t + .6; const p = enemyAim(e); p.y += e.E.fly ? .8 : e.E.h * .55; dmgText(p, e.phaseT > 0 ? '통과!' : '무적', '#d8d0f0'); } return; } // 석상·실체 소멸 (테스트 즉사 피해는 통과)
  if (e.vulnT > G.t) dmg *= 1 + (e.vulnAmt || 0); // 뿌리 감옥 ★3: 속박된 적 받는 피해 증가 (설정된 적만)
  const sk = shieldFactor(e, src);
  if (sk < .5) { Snd.play('block', { pos: e.g.position }); const p = enemyAim(e); emit(P, p.x + Math.sin(e.g.rotation.y) * .6, p.y, p.z + Math.cos(e.g.rotation.y) * .6, 6, 0xbfe0ff, 3, .25, 0, .3); e.blockT = .2;
    G.stats.blocked = (G.stats.blocked || 0) + dmg * (1 - sk); if (!(e.blockTxt > G.t)) { e.blockTxt = G.t + .6; p.y += e.E.h * .55 + .3; dmgText(p, '막음!', '#9ad4ff'); } }
  else Snd.play(armorOf(e) ? 'hitArmor' : 'hit', { pos: e.g.position });
  if (sk !== 1) { dmg *= sk; if (sk < .5) { dmg = armorDmg(e, dmg); if (e.shield > 0) dmg = absorbShield(e, dmg); e.hp -= dmg; e.flash = .05; if (e.hp <= 0) killEnemy(e); return; } } dmg = armorDmg(e, dmg);
  if (e.shield > 0) { dmg = absorbShield(e, dmg); if (dmg <= 0) { e.flash = .05; return; } } e.hp -= dmg; e.flash = .09; const p = enemyAim(e); p.y += e.E.fly ? .8 : e.E.h * .55; dmgText(p, dmg, color, big);
  if (e.hp <= 0) killEnemy(e);
}
// 방어력 (서리 골렘: 깨지기 전 피해 누적, 서리늑대: 무리 감소 포함). 능력 없는 몬스터는 기존 1 - E.armor 그대로
function armorDmg(e, dmg) { if (e.crackAcc !== undefined) crackHit(e, dmg); return dmg * (1 - armorOf(e)); }
function killEnemy(e) {
  e.dead = true; if (e.E.ab) onKilled(e); if (G.hero && G.hero.uqs && G.uqKill) G.uqKill(e); /* 고유 '끝없는 순환' 처치 수 */ e.hb.show(false); const p = enemyAim(e);
  emit(P, p.x, p.y, p.z, e.E.boss ? 160 : 22, e.E.fly ? 0xb08aff : 0xe8e0d0, e.E.boss ? 10 : 5, .8, -10, 1.5); emit(P, p.x, p.y, p.z, 10, 0xffe066, 4, .6);
  if (!e.E.fly) debris(p.x, p.y, p.z, e.E.boss ? 30 : 5, [0xf0ead8, 0xd8d0c0], 5);
  if (e.E.boss) { G.shake = 1.1; emit(PB, p.x, p.y, p.z, 60, 0xff8a3a, 12, 1.2, -3, 3); banner(`${e.E.n} 처치!`, '#ffd23a'); Snd.play('boom', { pos: p, force: true }); later(.6, () => Snd.play('victory', { force: true, exact: true })); }
  if (e.E.elite) G.eliteKills = (G.eliteKills || 0) + 1; // 하드 정예 처치 → 클리어 보너스 영혼석
  if (e.E.boss && G.perm) (G.runBossKills ||= []).push(G.wave); // 고유 ③ 숨은 보물 / 도전 모드 정수 판정용 (판 종료 applyRun)
  if (e.E.boss && G.perm && G.hero && (G.forceDrop || Math.random() < BOSS_DROP)) { const it = randomItem(G.hero.cls, bossOdds(G.wave + (G.hard && STAGE ? 5 * HARD.tierUp : 0)), Math.random, undefined, G.dropCh); /* 스테이지 = 그 챕터 세트, 도전 모드 = 열린 챕터 무작위 */ (G.runDrops ||= []).push(it); lootFx(p, it.g); // 보스 장비 드롭 (마을 출정 때만)
    later(1.2, () => { banner(`✦ ${GRADES[it.g].n} 장비 획득: ${it.n} ✦`, GRADES[it.g].c, 2600); Snd.play('levelUp', { force: true }); Snd.play('coins', { force: true }); }); }
  G.gold += e.E.gold; G.stats.goldEarned += e.E.gold; G.stats.kills[e.type] = (G.stats.kills[e.type] || 0) + 1; popCoins(p, Math.ceil(e.E.gold / 2)); Snd.play(e.E.fly ? 'poof' : 'bones', { pos: p, rate: e.E.boss ? .6 : 1, force: e.E.boss }); e.dying = e.E.fly ? .7 : 1.6;
  if (!e.E.fly) play(e.m, 'Death_A', { once: true, fade: .1 });
}
function reachCore(e) {
  G.coreHp -= e.E.core; G.stats.leaked++; e.dead = true; removeEnemy(e); G.shake = Math.max(G.shake, .35);
  emit(P, core.position.x, 3, core.position.z, 30, 0xff3a5a, 6, .7); crystalMat.emissive.setHex(0xff2a3a); later(.22, () => crystalMat.emissive.setHex(0x1890c0)); Snd.play('coreHit', { force: true }); Snd.play('glass', { vol: .6 });
  banner(`코어 피격! -${e.E.core}`, '#ff6a7a', 700); if (G.coreHp <= 0) gameOver();
}
function removeEnemy(e) { scene.remove(e.g); disposeObj(e.g); e.hb.dispose(); if (e.m.mats) e.m.mats.forEach(m => m.dispose()); if (e.m.mixer) e.m.mixer.stopAllAction(); const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); }

export { spawnEnemy, hurt, killEnemy, reachCore, removeEnemy, shieldFactor, armorOf };
