import { Snd } from '../audio/audio.js';
import { rand, rnd } from '../core/util.js';
import { SPAWN, SPAWNS, tileX, tileZ, GW } from '../core/grid.js';
import { ETYPES } from '../data/monsters.js';
import { G, later } from '../core/state.js';
import { scene } from '../render/scene.js';
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

// ================= 적 =================
// at = { x, z, tile } 이면 포털 대신 그 자리에서 (분열한 슬라임 등) — 포털 순번·출현 연출 없음
function spawnEnemy(type, hpMul, at) {
  const E = ETYPES[type], m = makeEnemyModel(type), hp = E.hp * hpMul; scene.add(m.g);
  const sp = at ? at.tile : SPAWNS.length > 1 ? SPAWNS[(G.spawnIdx = ((G.spawnIdx || 0) + 1)) % SPAWNS.length] : SPAWN, side = sp[0] <= 0 || sp[0] >= GW - 1; // 여러 포털이면 번갈아
  if (at) m.g.position.set(at.x, 0, at.z); else { m.g.position.set(tileX(sp[0]) + (side ? (sp[0] <= 0 ? .4 : -.4) : rnd(-.5, .5)), 0, tileZ(sp[1]) + (side ? rnd(-.5, .5) : sp[1] <= 0 ? .4 : -.4)); m.g.rotation.y = side ? (sp[0] <= 0 ? Math.PI / 2 : -Math.PI / 2) : (sp[1] <= 0 ? 0 : Math.PI); }
  const e = { type, E, m, g: m.g, hp, max: hp, ai: E.ai || 'basic', profile: E.profile || 'default', tile: sp.slice(), next: null, off: [rnd(-.45, .45), rnd(-.45, .45)], slowT: 0, slowAmt: 0, flash: 0, atkCd: rnd(0, .5), hitT: rnd(0, .3), state: 'walk', spawnT: 0, dead: false, bob: rand() * 6 };
  if (E.ab) initAbilities(e);
  if (at) { e.hb = hpBar(m.g, E.fly ? 4 : E.h + .35, Math.max(1.1, E.h * .55), 0x55ff77, { auto: true, h: .15 }); if (G.lowQ) shadowOf(e, false); G.enemies.push(e); return e; }
  if (!E.fly) { const a = play(m, 'Spawn_Ground_Skeletons', { once: true, speed: 2, fade: 0 }); e.state = 'spawn'; e.spawnT = a ? Math.min(1.4, a.getClip().duration / 2) : 0; emit(P, m.g.position.x, .3, m.g.position.z, 12, 0x9a7a5a, 3, .6, -6, 1.5); }
  e.hb = hpBar(m.g, E.fly ? 4 : E.h + .35, E.boss ? 3 : Math.max(1.1, E.h * .55), E.boss ? 0xff3a4a : 0x55ff77, { auto: !E.boss, h: E.boss ? .22 : .15 });
  if (E.boss) { G.shake = .7; Snd.roar(m.g.position); banner(`⚠ 보스 출현: ${E.n} ⚠`, '#ff4a5a', 2200); emit(PB, m.g.position.x, 2, m.g.position.z, 40, 0xff3a3a, 8, 1, -2, 2); }
  emit(P, m.g.position.x, 1.5, m.g.position.z, 14, 0xc07aff, 4, .5); if (G.lowQ) shadowOf(e, false); G.enemies.push(e); return e;
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
  if (e.dead) return; const sk = shieldFactor(e, src);
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
  e.dead = true; if (e.E.ab) onKilled(e); e.hb.show(false); const p = enemyAim(e);
  emit(P, p.x, p.y, p.z, e.E.boss ? 160 : 22, e.E.fly ? 0xb08aff : 0xe8e0d0, e.E.boss ? 10 : 5, .8, -10, 1.5); emit(P, p.x, p.y, p.z, 10, 0xffe066, 4, .6);
  if (!e.E.fly) debris(p.x, p.y, p.z, e.E.boss ? 30 : 5, [0xf0ead8, 0xd8d0c0], 5);
  if (e.E.boss) { G.shake = 1.1; emit(PB, p.x, p.y, p.z, 60, 0xff8a3a, 12, 1.2, -3, 3); banner(`${e.E.n} 처치!`, '#ffd23a'); Snd.play('boom', { pos: p, force: true }); later(.6, () => Snd.play('victory', { force: true, exact: true })); }
  if (e.E.boss && G.perm && G.hero && (G.forceDrop || Math.random() < BOSS_DROP)) { const it = randomItem(G.hero.cls, bossOdds(G.wave)); (G.runDrops ||= []).push(it); lootFx(p, it.g); // 보스 장비 드롭 (마을 출정 때만)
    later(1.2, () => { banner(`✦ ${GRADES[it.g].n} 장비 획득: ${it.n} ✦`, GRADES[it.g].c, 2600); Snd.play('levelUp', { force: true }); Snd.play('coins', { force: true }); }); }
  G.gold += e.E.gold; G.stats.goldEarned += e.E.gold; G.stats.kills[e.type] = (G.stats.kills[e.type] || 0) + 1; popCoins(p, Math.ceil(e.E.gold / 2)); Snd.play(e.E.fly ? 'poof' : 'bones', { pos: p, rate: e.E.boss ? .6 : 1, force: e.E.boss }); e.dying = e.E.fly ? .7 : 1.6;
  if (!e.E.fly) play(e.m, 'Death_A', { once: true, fade: .1 });
}
function reachCore(e) {
  G.coreHp -= e.E.core; G.stats.leaked++; e.dead = true; removeEnemy(e); G.shake = Math.max(G.shake, .35);
  emit(P, core.position.x, 3, core.position.z, 30, 0xff3a5a, 6, .7); crystalMat.emissive.setHex(0xff2a3a); later(.22, () => crystalMat.emissive.setHex(0x1890c0)); Snd.play('coreHit', { force: true }); Snd.play('glass', { vol: .6 });
  banner(`코어 피격! -${e.E.core}`, '#ff6a7a', 700); if (G.coreHp <= 0) gameOver();
}
function removeEnemy(e) { scene.remove(e.g); e.hb.dispose(); if (e.m.mats) e.m.mats.forEach(m => m.dispose()); if (e.m.mixer) e.m.mixer.stopAllAction(); const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); }

export { spawnEnemy, hurt, killEnemy, reachCore, removeEnemy, shieldFactor, armorOf };
