import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rnd } from '../core/util.js';
import { tileX, tileZ } from '../core/grid.js';
import { TOWERS, REPAIR_K } from '../data/towers.js';
import { G } from '../core/state.js';
import { scene } from '../render/scene.js';
import { glow, mk, toon } from '../render/toon.js';
import { P, PB, debris, dmgText, emit, popCoins, ringFx } from '../render/vfx.js';
import { core, refreshTile } from './terrain.js';
import { computeDist, dAt } from './pathfinding.js';
import { woodD, woodM } from './barricades.js';
import { shoot } from '../combat/projectiles.js';
import { hurt } from '../monsters/enemy.js';
import { banner, refreshHud } from '../ui/hud.js';
import { hpBar } from '../render/hpbars.js';
import { select } from '../ui/input.js';

// ================= 타워 =================
const stoneM = toon(0xe0dacb), stoneD = toon(0x9e98ae), metalM = toon(0x4a4e5e), goldM = toon(0xffcc44, { emissive: 0x3a2200 });
function towerModel(type, lvl) {
  const g = new THREE.Group(), head = new THREE.Group(), muzzle = new THREE.Object3D(), anim = {};
  mk(new RoundedBoxGeometry(1.75, .45, 1.75, 2, .14), stoneD, 0, .22, 0, g);
  for (let k = 0; k < lvl; k++) mk(new THREE.OctahedronGeometry(.11, 0), glow(0xffd23a, 1.4), (k - (lvl - 1) / 2) * .45, .3, .9, g, .015);
  if (type === 'arrow') {
    const h = 1.3 + .45 * lvl, roofC = [0x3a7aff, 0xff4a6a, 0x9a5aff][lvl - 1];
    mk(new THREE.CylinderGeometry(.55, .72, h, 12), stoneM, 0, .45 + h / 2, 0, g); mk(new THREE.CylinderGeometry(.76, .76, .16, 12), stoneD, 0, .45 + h * .33, 0, g);
    const top = .45 + h; mk(new THREE.CylinderGeometry(.98, .82, .28, 12), woodM, 0, top + .14, 0, g);
    for (let k = 0; k < 4; k++) mk(new THREE.CylinderGeometry(.06, .06, 1, 6), woodD, Math.cos(k * 1.57 + .78) * .78, top + .78, Math.sin(k * 1.57 + .78) * .78, g, .02);
    const rh = 1 + .2 * lvl; mk(new THREE.ConeGeometry(1.18, rh, 12), toon(roofC), 0, top + 1.28 + rh / 2, 0, g);
    if (lvl >= 2) { const pole = mk(new THREE.CylinderGeometry(.03, .03, .8, 5), woodD, 0, top + 1.28 + rh + .3, 0, g, .015); anim.flag = mk(new THREE.BoxGeometry(.5, .28, .03), toon(0xffe06a), .25, .25, 0, pole, .015); }
    if (lvl >= 3) { mk(new THREE.TorusGeometry(1.0, .06, 6, 24), goldM, 0, top + .3, 0, g, .015).rotation.x = Math.PI / 2; anim.gem = mk(new THREE.OctahedronGeometry(.25), glow(0x9affff, 2.4), 0, top + 1.28 + rh + .9, 0, g, .02); }
    mk(new THREE.BoxGeometry(.16, .16, .9), woodD, 0, 0, .1, head, .02);
    const bow = mk(new THREE.TorusGeometry(.42, .045, 6, 14, Math.PI), lvl >= 3 ? goldM : woodM, 0, 0, .45, head, .02); bow.rotation.x = Math.PI / 2;
    mk(new THREE.ConeGeometry(.06, .2, 6), metalM, 0, 0, .65, head, 0).rotation.x = Math.PI / 2;
    head.position.y = top + .55; muzzle.position.set(0, 0, .7);
  } else if (type === 'cannon') {
    const h = .9 + .2 * lvl; mk(new THREE.CylinderGeometry(.95, 1.1, h, 14), stoneD, 0, .45 + h / 2, 0, g);
    for (let k = 0; k < 8; k++) mk(new RoundedBoxGeometry(.32, .3, .32, 1, .06), stoneM, Math.cos(k * .785) * .92, .45 + h + .1, Math.sin(k * .785) * .92, g, .02);
    if (lvl >= 2) mk(new THREE.TorusGeometry(1.05, .07, 6, 24), lvl >= 3 ? goldM : metalM, 0, .45 + h * .5, 0, g, .015).rotation.x = Math.PI / 2;
    mk(new THREE.SphereGeometry(.55, 16, 12), metalM, 0, 0, 0, head);
    for (const bx of lvl >= 2 ? [-.24, .24] : [0]) { const b = mk(new THREE.CylinderGeometry(.17 + lvl * .02, .24 + lvl * .02, 1.3, 12), toon(0x30333e), bx, .1, .55, head); b.rotation.x = Math.PI / 2 - .25;
      mk(new THREE.TorusGeometry(.2 + lvl * .02, .05, 6, 12), lvl >= 3 ? goldM : toon(0x5a5e70), bx, .27, 1.15, head, .015).rotation.x = -.25; }
    if (lvl >= 3) mk(new THREE.SphereGeometry(.16, 10, 8), glow(0xff6a2a, 2.5), 0, .45, -.2, head, 0);
    head.position.y = .45 + h + .55; muzzle.position.set(0, .3, 1.2);
  } else {
    const h = 1.5 + .5 * lvl, cc = [0x6af0ff, 0xc07aff, 0xff7ad0][lvl - 1];
    mk(new THREE.CylinderGeometry(.42, .78, h, 6), toon(0x6a4aa8), 0, .45 + h / 2, 0, g);
    mk(new THREE.CylinderGeometry(.62, .5, .3, 6), toon(0x8a6ad0), 0, .45 + h + .15, 0, g);
    for (let k = 0; k < 3; k++) { const s = mk(new THREE.OctahedronGeometry(.18), glow(cc, 1.2), Math.cos(k * 2.09) * .62, .45 + h + .3, Math.sin(k * 2.09) * .62, g, .015); s.scale.y = 1.8; }
    const crys = mk(new THREE.OctahedronGeometry(.42 + lvl * .08, 0), glow(cc, 2.2), 0, 0, 0, head, .025); crys.scale.y = 1.5; anim.crys = crys;
    anim.rings = []; for (let k = 0; k < lvl; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.8 + k * .22, .035, 6, 32), glow(k % 2 ? 0xffe06a : cc, 1.8)); ring.rotation.x = Math.PI / 2 + k * .6; head.add(ring); anim.rings.push(ring); }
    head.position.y = .45 + h + 1.2; anim.baseY = head.position.y;
  }
  head.add(muzzle); g.add(head); return { g, head, muzzle, anim };
}
function placeTower(t, type) {
  const D = TOWERS[type], tw = { kind: 'tower', type, lvl: 1, t, c: t.c, r: t.r, cd: .5, invest: D.cost, pop: 0, recoil: 0 };
  tw.max = tw.hp = D.hp[0]; tw.hitT = 0; tw.fxT = 0; tw.anchor = new THREE.Object3D(); tw.anchor.position.set(tileX(t.c), 0, tileZ(t.r)); scene.add(tw.anchor);
  tw.hb = hpBar(tw.anchor, 3.6, 1.6, 0x55ff77, { auto: true, h: .17 });
  tw.m = towerModel(type, 1); tw.m.g.position.set(tileX(t.c), 0, tileZ(t.r)); Snd.play('build', { pos: tw.m.g.position }); Snd.play('place', { delay: .12 }); scene.add(tw.m.g); t.tower = tw; G.towers.push(tw); refreshTile(t); return tw;
}
function upgradeTower(tw) {
  if (tw.lvl >= 3) return; const c = TOWERS[tw.type].up[tw.lvl - 1]; if (G.gold < c) return Snd.play('error'); G.gold -= c; tw.invest += c; tw.lvl++; { const nm = TOWERS[tw.type].hp[tw.lvl - 1]; tw.hp += nm - tw.max; tw.max = nm; tw.hb.set(tw.hp / tw.max); } Snd.play('upgrade', { pos: { x: tileX(tw.c), z: tileZ(tw.r) } }); Snd.play('levelUp', { vol: .7 });
  const ry = tw.m.head.rotation.y; scene.remove(tw.m.g); tw.m = towerModel(tw.type, tw.lvl); tw.m.head.rotation.y = ry; tw.m.g.position.set(tileX(tw.c), 0, tileZ(tw.r)); scene.add(tw.m.g); tw.pop = 0;
  const p = tw.m.g.position; emit(P, p.x, 1, p.z, 50, 0xffe066, 6, .9, -4, 2); emit(PB, p.x, 2, p.z, 10, 0xffd23a, 3, .8, 2, 1); ringFx(p, 2.5, 0xffd23a, .6); banner(`${TOWERS[tw.type].n} Lv.${tw.lvl}!`, '#ffe066', 900); refreshHud();
}
function sellTower(tw) {
  const v = Math.floor(tw.invest * .7 * (tw.hp / tw.max >= .999 ? 1 : .5 + .5 * tw.hp / tw.max)); G.gold += v; Snd.play('sell'); Snd.play('breakWood', { pos: { x: tileX(tw.c), z: tileZ(tw.r) }, vol: .5 }); const hpK = tw.hp / tw.max; scene.remove(tw.m.g); removeTowerObj(tw);
  const p = tw.m.g.position; debris(p.x, 1, p.z, 14, [0xe0dacb, 0x9e98ae, 0xa8703a], 6); popCoins(p.clone().setY(1.5), 4); dmgText(p.clone().setY(2.5), `+${v}G`, '#ffe066', true); select(null); computeDist(); refreshHud();
}
function removeTowerObj(tw) { tw.dead = true; G.towers.splice(G.towers.indexOf(tw), 1); tw.t.tower = null; refreshTile(tw.t); scene.remove(tw.anchor); tw.hb.dispose(); }
// ---- 타워 체력 / 피해 / 파괴 / 수리 ----
function damageTower(tw, dmg, src) {
  if (!tw || tw.dead || dmg <= 0) return; tw.hp -= dmg; tw.hb.set(Math.max(0, tw.hp / tw.max)); tw.hitT = .25; G.stats.towerDmg = (G.stats.towerDmg || 0) + dmg;
  const p = tw.anchor.position; dmgText(new THREE.Vector3(p.x, 3, p.z), Math.round(dmg), '#ff9a6a'); Snd.play('towerHit', { pos: p });
  debris(p.x, 1.2, p.z, 3, [0xe0dacb, 0x9e98ae, 0xa8703a], 3.5);
  if (tw.hp <= 0) destroyTower(tw, src);
}
function destroyTower(tw) {
  const p = tw.m.g.position.clone(); scene.remove(tw.m.g); removeTowerObj(tw); G.stats.towersLost = (G.stats.towersLost || 0) + 1;
  debris(p.x, 1.4, p.z, 30, [0xe0dacb, 0x9e98ae, 0xa8703a, 0x6a6a7a], 8); emit(P, p.x, 1.5, p.z, 60, 0x9a9a9a, 5, 1.1, 1, 1.5); emit(PB, p.x, 1, p.z, 18, 0xff8a3a, 4, .6, 0, 1); ringFx(p, 3, 0xff6a3a, .5);
  G.shake = Math.max(G.shake, .45); Snd.play('towerBreak', { pos: p, force: true }); Snd.play('breakRock', { pos: p, force: true, rate: .8 });
  banner(`${TOWERS[tw.type].n} 파괴됨!`, '#ff7a5a', 1200); if (G.sel === tw) select(null); computeDist(); refreshHud();
}
const repairCost = tw => tw.hp >= tw.max ? 0 : Math.max(5, Math.ceil((1 - tw.hp / tw.max) * tw.invest * REPAIR_K));
function repairTower(tw, quiet) {
  const c = repairCost(tw); if (!c) return 0; if (G.gold < c) { if (!quiet) { Snd.play('error'); banner('골드가 부족합니다', '#ff8a8a', 700); } return -1; }
  G.gold -= c; G.stats.repairSpent = (G.stats.repairSpent || 0) + c; tw.hp = tw.max; tw.hb.set(1); const p = tw.anchor.position;
  emit(P, p.x, 1.5, p.z, 30, 0x7aff9a, 4, .8, -2, 1.5); ringFx(p, 2.2, 0x7aff9a, .45); dmgText(new THREE.Vector3(p.x, 3, p.z), `수리 -${c}G`, '#9affb0', true); Snd.play('repair', { pos: p }); refreshHud(); return c;
}
function repairAll() { let n = 0, spent = 0; const L = G.towers.filter(t => t.hp < t.max).sort((a, b) => a.hp / a.max - b.hp / b.max);
  for (const tw of L) { const c = repairTower(tw, true); if (c > 0) { n++; spent += c; } }
  if (!L.length) banner('수리할 타워가 없습니다', '#ffffff', 700); else if (!n) { Snd.play('error'); banner('골드가 부족합니다', '#ff8a8a', 700); } return spent; }
function enemyAim(e) { return e.g.position.clone().setY(e.E.fly ? e.m.inner.position.y : e.E.h * .55 + e.g.position.y); }
function updTowers(dt) {
  for (const tw of G.towers) {
    const D = TOWERS[tw.type], L = tw.lvl - 1, m = tw.m, p = m.g.position; tw.cd -= dt; tw.pop = Math.min(1, tw.pop + dt * 3);
    const s = tw.pop < 1 ? 1 + Math.sin(tw.pop * Math.PI) * .25 : 1; m.g.scale.set(s, tw.pop < 1 ? .4 + tw.pop * .6 : 1, s);
    if (m.anim.crys) { m.head.position.y = m.anim.baseY + Math.sin(G.t * 2.4 + tw.c) * .15; m.anim.crys.rotation.y += dt * 1.6; m.anim.rings.forEach((r, k) => { r.rotation.z += dt * (1.2 + k * .7) * (k % 2 ? -1 : 1); }); }
    if (m.anim.flag) m.anim.flag.rotation.y = Math.sin(G.t * 5 + tw.c) * .4; if (m.anim.gem) m.anim.gem.rotation.y += dt * 2;
    tw.recoil = Math.max(0, tw.recoil - dt * 4);
    if (tw.hp < tw.max) { // 손상 연출: 피격 흔들림, 50% 이하 연기, 25% 이하 불꽃
      if (tw.hitT > 0) { tw.hitT -= dt; m.g.position.x = tileX(tw.c) + Math.sin(G.t * 70) * tw.hitT * .4; } else m.g.position.x = tileX(tw.c);
      tw.fxT -= dt; const k = tw.hp / tw.max; if (k < .5 && tw.fxT <= 0) { tw.fxT = k < .25 ? .08 : .2; emit(P, p.x + rnd(-.5, .5), 2.2, p.z + rnd(-.5, .5), 1, 0x5a5a62, .6, 1.4, 2.5, .3); if (k < .25) emit(P, p.x + rnd(-.4, .4), 1.6, p.z + rnd(-.4, .4), 2, 0xff8a2a, 1.2, .5, 3, .3); } }
    const rng = D.range[L]; let best = null, bd = Infinity;
    for (const e of G.enemies) { if (e.dead || (e.E.fly && !D.air)) continue; const dx = e.g.position.x - p.x, dz = e.g.position.z - p.z; if (dx * dx + dz * dz > rng * rng) continue;
      const prog = e.E.fly ? Math.hypot(core.position.x - e.g.position.x, core.position.z - e.g.position.z) : dAt(e.tile[0], e.tile[1]); if (prog < bd) { bd = prog; best = e; } }
    if (!best) continue;
    const want = Math.atan2(best.g.position.x - p.x, best.g.position.z - p.z); let d = want - m.head.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); m.head.rotation.y += d * Math.min(1, dt * 10);
    if (tw.type === 'cannon') { const k = tw.recoil * .25; m.head.position.x = -Math.sin(m.head.rotation.y) * k; m.head.position.z = -Math.cos(m.head.rotation.y) * k; }
    if (tw.cd > 0) continue; tw.cd = 1 / D.rate[L]; const from = new THREE.Vector3(); m.muzzle.getWorldPosition(from);
    if (tw.type === 'arrow') { shoot('arrow', from, best, D.dmg[L], { spd: 34, color: L >= 2 ? 0x9affff : 0xfff0c0 }); Snd.play('arrow', { pos: from, rate: 1.15 }); }
    else if (tw.type === 'cannon') { const dest = best.g.position.clone(); if (best.next) { const v = new THREE.Vector3(tileX(best.next[0]) - dest.x, 0, tileZ(best.next[1]) - dest.z); if (v.length() > .01) dest.addScaledVector(v.normalize(), Math.min(1.5, best.E.spd * .6)); }
      const ball = mk(new THREE.SphereGeometry(.22 + L * .04, 12, 8), toon(0x26282e), from.x, from.y, from.z, scene, .02); G.projs.push({ kind: 'ball', m: ball, from: from.clone(), dest, t: 0, dur: .7, dmg: D.dmg[L], r: D.splash[L] });
      tw.recoil = 1; emit(P, from.x, from.y, from.z, 14, 0xffaa4a, 4, .35, 0, .5); emit(P, from.x, from.y, from.z, 8, 0x8a8a8a, 2, .8, 1.5, .5); Snd.play('cannon', { pos: from }); }
    else chainLightning(from, best, D.dmg[L], D.chain[L], D.slow[L]);
  }
}
function chainLightning(from, first, dmg, n, slow) {
  const hit = new Set(); let cur = first, a = from.clone();
  for (let k = 0; k < n && cur; k++) { const b = enemyAim(cur); bolt(a, b, k ? 0xc0a0ff : 0x9ae8ff); const ce = cur; hit.add(ce); ce.slowT = 1.3; ce.slowAmt = slow; hurt(ce, dmg * Math.pow(.85, k), '#c8b8ff'); emit(P, b.x, b.y, b.z, 8, 0xb8a0ff, 4, .35, 0, .5);
    a = b; let nb = null, nd = 3.8 * 3.8; for (const e of G.enemies) { if (e.dead || hit.has(e)) continue; const d = e.g.position.distanceToSquared(ce.g.position); if (d < nd) { nd = d; nb = e; } } cur = nb; }
  Snd.crackle(first.g.position);
}
function bolt(a, b, color) {
  for (let w = 0; w < 2; w++) { const pts = [], n = 9; for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); if (i > 0 && i < n) p.add(new THREE.Vector3(rnd(-.4, .4), rnd(-.4, .4), rnd(-.4, .4))); pts.push(p); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: w ? 0xffffff : color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); scene.add(l); G.fxs.push({ m: l, t: 0, dur: .2, kind: 'fade' }); }
}

export { towerModel, placeTower, upgradeTower, sellTower, enemyAim, updTowers, damageTower, destroyTower, repairTower, repairAll, repairCost };
