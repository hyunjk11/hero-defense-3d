import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { $, rand } from '../core/util.js';
import { CORE, DIRS, GH, T, inGrid, tileX, tileZ, toTile } from '../core/grid.js';
import { CLASSES, heroLabel } from '../data/heroes.js';
import { G, later } from '../core/state.js';
import { cam, scene } from '../render/scene.js';
import { P, emit, ringFx } from '../render/vfx.js';
import { hpBar } from '../render/hpbars.js';
import { flashMats, makeHeroModel, play } from '../render/characters.js';
import { tileAt } from '../world/terrain.js';
import { Heap } from '../world/pathfinding.js';
import { aoe, shoot } from '../combat/projectiles.js';
import { hurt } from '../monsters/enemy.js';
import { groundY } from '../monsters/ai.js';
import { banner } from '../ui/hud.js';
import { keys } from '../ui/input.js';
import { legendProc, updLeap } from './legend.js';
import { gunAttack, updRose } from './gunner.js';

// ================= 영웅 =================
let hero = null;
const stat = {
  dmg: () => { const b = hero.C.dmg * (1 + .15 * G.ups.atk), q = hero.eq; return q && q.crit && Math.random() * 100 < q.crit ? b * (1.5 + (q.critD || 0) / 100) : b; }, // 치명타는 장비가 있을 때만
  rate: () => hero.C.rate * (1 + .1 * G.ups.spd), range: () => hero.C.range * (1 + .08 * G.ups.rng),
  skillMul: () => (1 + .25 * G.ups.skill) * (1 + ((hero.eq && hero.eq.skill) || 0) / 100), skillCd: () => hero.C.cd * Math.pow(.92, G.ups.skill) * (1 - Math.min(40, (hero.eq && hero.eq.cdr) || 0) / 100),
};
function spawnHero(cls) {
  let C = CLASSES[cls]; if (G.perm) C = { ...C, hp: Math.round(C.hp * (1 + .06 * (G.perm.hp || 0))), dmg: C.dmg * (1 + .05 * (G.perm.atk || 0)) }; // 마을 영구 강화
  const q = G.perm && G.equip ? G.equip : null; if (q) C = { ...C, hp: Math.round(C.hp * (1 + (q.hp || 0) / 100)), dmg: C.dmg * (1 + (q.atk || 0) / 100), rate: C.rate * (1 + (q.spd || 0) / 100), range: C.range * (1 + (q.rng || 0) / 100) }; // 장비
  const ch = makeHeroModel(cls); ch.g.position.set(tileX(CORE[0] - 1), 0, tileZ(CORE[1])); ch.g.rotation.y = -Math.PI / 2; scene.add(ch.g);
  hero = G.hero = { warpT: 0, warpCd: 0, stuckT: 0, stuckD: 1e9, unstuckN: 0, cls, C, eq: q, ch, g: ch.g, hp: C.hp, max: C.hp, cd: 0, skillCd: 0, atkT: 0, path: [], dead: 0, spinT: 0, flash: 0, face: -Math.PI / 2 };
  if (G.perm && G.legend) Object.assign(hero, { lsk: G.legend, lcd: 0, licd: 0, leap: null }); // 전설 무기 고유 스킬 (마을 출정 때만)
  hero.hb = hpBar(ch.g, 3.1, 1.6, 0x55ff77); play(ch, 'Idle');
  $('heroName').textContent = `${heroLabel(cls)} · 스킬 [Q] ${C.skill}`; $('skillName').textContent = C.skill; $('skillName').classList.toggle('long', C.skill.length > 5);
}
function heroDamage(d) {
  if (hero.dead > 0) return; d *= 1 - hero.C.armor; hero.hp -= d; hero.flash = .1; Snd.play('heroHurt', { pos: hero.g.position, vol: .8 }); if (hero.ch.acts.Hit && hero.hp > 0 && hero.atkT <= 0 && hero.spinT <= 0 && !(hero.roseT > 0) && !(hero.gunT > 0) && hero.warpT <= 0) { play(hero.ch, 'Hit', { once: true, force: true, speed: 1.6 }); hero.atkT = .35; }
  if (hero.hp <= 0) { hero.hp = 0; hero.dead = 5; hero.spinT = 0; hero.roseT = 0; hero.gunT = 0; if (hero.swirl) hero.swirl.visible = false; hero.path = []; play(hero.ch, 'Death_A', { once: true }); hero.hb.show(false); emit(P, hero.g.position.x, 1.5, hero.g.position.z, 50, 0xff4a5a, 6, .9); banner('영웅 쓰러짐! 5초 후 부활', '#ff8a9a', 1500); }
}
const heroPass = (c, r) => { if (!inGrid(c, r)) return false; const t = tileAt(c, r); return (t.t === T.GRASS || t.t === T.CARVED || t.t === T.SPAWN || t.t === T.CORE) && !t.tower && !t.bar; };
function passAt(x, z) { for (const [ox, oz] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) { const [c, r] = toTile(x + ox, z + oz); if (!heroPass(c, r)) return false; } return true; }
const heroPassXZ = (x, z) => { const [c, r] = toTile(x, z); return heroPass(c, r); };
function overlap(x, z) { let n = 0; for (const [ox, oz] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) { const [c, r] = toTile(x + ox, z + oz); if (!heroPass(c, r)) n++; } return n; }
// BFS로 가장 가까운 '완전히 비어 있는' 칸(영웅 몸이 들어가고 적이 근처에 없음) 찾기
function freeTileNear(c0, r0, avoidEnemies = true) {
  const seen = new Set([c0 * GH + r0]), q = [[c0, r0]]; let fallback = null;
  while (q.length) { const [c, r] = q.shift(); if (heroPass(c, r) && passAt(tileX(c), tileZ(r))) { if (!fallback) fallback = [c, r];
      if (!avoidEnemies || !G.enemies.some(e => !e.dead && !e.E.fly && Math.hypot(e.g.position.x - tileX(c), e.g.position.z - tileZ(r)) < 1.6)) return [c, r]; }
    for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr, k = nc * GH + nr; if (inGrid(nc, nr) && !seen.has(k)) { seen.add(k); q.push([nc, nr]); } } }
  return fallback;
}
function unstuck() { const h = hero, p = h.g.position, goal = h.path.length ? h.path[h.path.length - 1].clone() : null; const [c, r] = toTile(p.x, p.z), f = freeTileNear(c, r, false); h.stuckT = 0; h.stuckD = 1e9; if (!f) return;
  p.set(tileX(f[0]), p.y, tileZ(f[1])); h.unstuckN++; G.unstuckN = (G.unstuckN || 0) + 1; emit(P, p.x, 1, p.z, 14, 0x9ae8ff, 3, .5); if (goal) heroGoTo(goal); else h.path = []; }
// ================= 워프 (T): 1초 채널링 → 코어 앞 빈 칸으로 순간이동, 쿨다운 10초 =================
const WARP_CH = 1, WARP_CD = 10;
function warpTarget() { return freeTileNear(CORE[0] - 1, CORE[1]); }
function startWarp() { const h = hero; if (!h || h.dead > 0 || G.phase === 'select' || G.phase === 'over') return false;
  if (h.warpT > 0) return false; if (h.warpCd > 0) { Snd.play('error'); banner(`워프 재사용 대기 ${Math.ceil(h.warpCd)}초`, '#9ae8ff', 800); return false; }
  h.path = []; h.spinT = 0; h.roseT = 0; h.gunT = 0; if (h.swirl) h.swirl.visible = false; h.warpT = WARP_CH; play(h.ch, 'Cheer');
  if (!h.warpFx) { const m = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x7ad8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.position.y = 3; h.warpFx = m; h.g.add(m); }
  h.warpFx.visible = true; ringFx(h.g.position, 2.2, 0x7ad8ff, WARP_CH); Snd.play('magic', { pos: h.g.position, rate: .6, force: true }); Snd.whoosh(h.g.position, WARP_CH, 200, 2400, .4); return true; }
function warpChannelFx(dt) { const h = hero, k = 1 - h.warpT / WARP_CH; h.warpFx.material.opacity = .15 + k * .5; h.warpFx.scale.set(1 - k * .5, 1, 1 - k * .5); h.warpFx.rotation.y += dt * 6;
  if (Math.random() < .6) { const a = Math.random() * 6.28; emit(P, h.g.position.x + Math.cos(a) * 1.1, .2, h.g.position.z + Math.sin(a) * 1.1, 2, 0x9ae8ff, 1, .6, 6, .3); } }
function cancelWarp() { const h = hero; h.warpT = 0; if (h.warpFx) h.warpFx.visible = false; Snd.play('error'); banner('워프 취소', '#9ae8ff', 700); play(h.ch, 'Idle'); }
function doWarp() { const h = hero, p = h.g.position, f = warpTarget(); h.warpFx.visible = false; h.warpCd = WARP_CD; h.stuckT = 0; if (!f) return;
  emit(P, p.x, 1.2, p.z, 50, 0x7ad8ff, 7, .7, 0, 3); ringFx(p, 3, 0x7ad8ff, .5); vanishPillar(p.x, p.z);
  p.set(tileX(f[0]), 0, tileZ(f[1])); h.path = []; h.face = -Math.PI / 2; G.warpN = (G.warpN || 0) + 1;
  emit(P, p.x, 1.2, p.z, 60, 0xbaf0ff, 6, .8, -4, 2); ringFx(p, 3.5, 0xbaf0ff, .6); vanishPillar(p.x, p.z); G.shake = Math.max(G.shake || 0, .2); play(h.ch, 'Cheer', { once: true }); h.atkT = .8;
  Snd.play('magic', { pos: p, rate: 1.4, force: true }); Snd.play('levelUp', { vol: .5, force: true }); banner('워프!', '#9ae8ff', 700); }
function vanishPillar(x, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(.6, 1.2, 9, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xbaf0ff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.position.set(x, 4.5, z); scene.add(m); G.fxs.push({ m, t: 0, dur: .45, kind: 'fade' }); }
function astar(s, g) {
  const key = (c, r) => c * GH + r, gs = new Map([[key(s[0], s[1]), 0]]), from = new Map(), h = new Heap(), H = (c, r) => Math.abs(c - g[0]) + Math.abs(r - g[1]);
  h.push([H(s[0], s[1]), s[0], s[1]]);
  while (h.size) { const [, c, r] = h.pop(); if (c === g[0] && r === g[1]) { const path = []; let k = key(c, r); while (from.has(k)) { path.unshift([k / GH | 0, k % GH]); k = from.get(k); } return path; }
    const gc = gs.get(key(c, r)); for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (!heroPass(nc, nr)) continue; const nk = key(nc, nr), ng = gc + 1; if (ng < (gs.get(nk) ?? Infinity)) { gs.set(nk, ng); from.set(nk, key(c, r)); h.push([ng + H(nc, nr), nc, nr]); } } }
  return null;
}
function heroGoTo(p) {
  const s = toTile(hero.g.position.x, hero.g.position.z); const [gc, gr] = toTile(p.x, p.z); let exact = heroPass(gc, gr);
  let path = exact ? astar(s, [gc, gr]) : null;
  if (!path) { // 도달 불가 → 도달 가능한 가장 가까운 칸
    const seen = new Set([s[0] * GH + s[1]]), q = [s]; let best = s, bd = Infinity;
    while (q.length) { const [c, r] = q.shift(); const d = Math.hypot(tileX(c) - p.x, tileZ(r) - p.z); if (d < bd) { bd = d; best = [c, r]; }
      for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr, k = nc * GH + nr; if (heroPass(nc, nr) && !seen.has(k)) { seen.add(k); q.push([nc, nr]); } } }
    path = astar(s, best) || []; exact = false;
  }
  hero.path = path.map(([c, r]) => new THREE.Vector3(tileX(c), 0, tileZ(r))); if (exact && passAt(p.x, p.z)) { hero.path.pop(); hero.path.push(new THREE.Vector3(p.x, 0, p.z)); } // 벽에 붙은 클릭 지점은 몸이 못 들어가 제자리걸음하던 원인 → 칸 중심 사용
}

// ================= 영웅 업데이트 =================
function updHero(dt) {
  const h = hero; h.ch.mixer.update(dt);
  if (h.dead > 0) { h.dead -= dt; if (h.dead <= 0) { h.hp = h.max; h.hb.show(true); h.g.position.set(tileX(CORE[0] - 1), 0, tileZ(CORE[1])); play(h.ch, 'Cheer', { once: true }); h.atkT = 1.2; emit(P, h.g.position.x, 1, h.g.position.z, 40, 0x8aff9a, 5, .8); ringFx(h.g.position, 2.5, 0x8aff9a, .6); } return; }
  const fwd = new THREE.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta)), right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  let fromPath = false; if (keys.w) mv.add(fwd); if (keys.s) mv.sub(fwd); if (keys.d) mv.add(right); if (keys.a) mv.sub(right);
  if (h.warpCd > 0) h.warpCd -= dt;
  if (h.leap) { updLeap(dt); h.hb.set(h.hp / h.max); return; } // 천지파열무 도약 중
  if (h.warpT > 0) { // 워프 채널링: 이동 입력 시 취소
    if (mv.lengthSq() > 0 || h.path.length) cancelWarp(); else { h.warpT -= dt; warpChannelFx(dt); if (h.warpT <= 0) doWarp(); h.hb.set(h.hp / h.max); return; } }
  if (mv.lengthSq() > 0) h.path = [];
  else if (h.path.length) { fromPath = true; mv.subVectors(h.path[0], h.g.position).setY(0); if (mv.length() < .15) { h.path.shift(); if (!h.path.length) mv.set(0, 0, 0); } }
  let moving = false;
  if (mv.lengthSq() > 0) { const want = mv.length(), stp = h.C.speed * dt * (h.spinT > 0 || h.roseT > 0 ? .7 : 1); mv.normalize().multiplyScalar(fromPath ? Math.min(stp, want) : stp); const p = h.g.position; // 경로 지점을 지나치며 왕복하던 떨림 방지 const p = h.g.position;
    // 근본 원인 수정: 현재 위치가 이미 막힌 칸과 겹쳐 있으면(타워/바리케이드가 옆에 생기거나 밀려서) 4모서리 검사가 모든 이동을 거부해 영구히 갇혔음.
    // 겹친 상태에서는 '덜 겹치는' 방향(중심 칸이 통과 가능)으로의 이동을 허용해 빠져나오게 함
    const ok = (x, z) => passAt(x, z) || (!passAt(p.x, p.z) && heroPassXZ(x, z) && overlap(x, z) <= overlap(p.x, p.z));
    const x0 = p.x, z0 = p.z; if (ok(p.x + mv.x, p.z)) p.x += mv.x; if (ok(p.x, p.z + mv.z)) p.z += mv.z; h.face = Math.atan2(mv.x, mv.z); moving = true;
    // 자동 탈출: 2초 동안 목표 쪽으로 진척이 없으면 가장 가까운 빈 칸으로 이동 후 경로 재계산
    const tgt0 = h.path.length ? h.path[0] : null, dNow = tgt0 ? Math.hypot(tgt0.x - p.x, tgt0.z - p.z) : (Math.hypot(p.x - x0, p.z - z0) < 1e-4 && !passAt(p.x, p.z) ? 1 : -1);
    if (dNow >= 0 && dNow > h.stuckD - .05) { h.stuckT += dt; if (h.stuckT > 2) unstuck(); } else { h.stuckT = 0; h.stuckD = dNow >= 0 ? dNow : 1e9; } }
  else { h.stuckT = 0; h.stuckD = 1e9; }
  if (!moving && !passAt(h.g.position.x, h.g.position.z)) { h.stuckT += dt; if (h.stuckT > 2) unstuck(); }
  h.g.position.y += (groundY(h.g.position.x, h.g.position.z) - h.g.position.y) * Math.min(1, dt * 10);
  const rng = stat.range(); let tgt = null, bd = rng * rng;
  for (const e of G.enemies) { if (e.dead) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = dx * dx + dz * dz; if (d < bd && (h.cls !== 'warrior' || !e.E.fly)) { bd = d; tgt = e; } }
  h.cd -= dt; h.atkT -= dt; if (h.gunT > 0) h.gunT -= dt;
  if (h.roseT > 0) updRose(dt); // 로즈 피니시 중: 일반 사격 대신 난사
  else if (h.cls === 'gunner' && tgt) { h.face = Math.atan2(tgt.g.position.x - h.g.position.x, tgt.g.position.z - h.g.position.z); // 총사: 이동 중에도 목표를 겨누며 연사
    if (h.cd <= 0) { h.cd = 1 / stat.rate(); h.gunT = .45; const t0 = tgt; later(.02, () => { if (!t0.dead && hero.dead <= 0) { gunAttack(t0); if (hero.lsk) legendProc(t0); } }); } }
  else if (tgt && h.spinT <= 0) { const want = Math.atan2(tgt.g.position.x - h.g.position.x, tgt.g.position.z - h.g.position.z); if (!moving) h.face = want;
    if (h.cd <= 0) { h.cd = 1 / stat.rate();
      let hitD = h.cls === 'warrior' ? .12 : .08;
      if (!moving) { const nm = h.cls === 'warrior' && rand() < .5 ? '1H_Melee_Attack_Slice_Horizontal' : h.C.atk, spd = h.C.atkSpd * Math.max(1, stat.rate() / h.C.rate); play(h.ch, nm, { once: true, force: true, speed: spd }); h.atkT = Math.min(.55, 1 / stat.rate());
        if (h.ch.hitAt) hitD = h.ch.hitAt / spd; } // Meshy 전사: 칼 휘두름 정점에 타격
      const t0 = tgt; later(hitD, () => { if (!t0.dead && hero.dead <= 0) { attack(t0); if (hero.lsk) legendProc(t0); } }); } }
  if (h.spinT > 0) { h.spinT -= dt; h.spinTick -= dt; h.g.rotation.y += dt * 9;
    if (h.spinTick <= 0) { h.spinTick = .25; aoe(h.g.position, 3.6, stat.dmg() * 1.3 * stat.skillMul(), '#ffb07a', { groundOnly: true }); emit(P, h.g.position.x, 1.2, h.g.position.z, 20, 0xffa04a, 7, .4, 0, 4); }
    h.swirl.rotation.z += dt * 15; if (h.spinT <= 0) { h.swirl.visible = false; play(h.ch, 'Idle'); } }
  else { let d = h.face - h.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); h.g.rotation.y += d * Math.min(1, dt * 14); }
  if (h.roseT > 0) { /* ShootCharged 재생 중 */ } else if (h.gunT > 0) play(h.ch, moving ? 'ShootWalk' : 'ShootStand', { speed: moving ? 1.3 : 1, fade: .12 });
  else if (h.spinT <= 0) { if (moving) play(h.ch, 'Running_A', { speed: 1.1 }); else if (h.atkT <= 0) play(h.ch, 'Idle', { fade: .25 }); }
  h.ch.ring.material.opacity = .5 + Math.sin(G.t * 4) * .2;
  if (h.flash > 0) { h.flash -= dt; flashMats(h.ch.mats, true, 0xff3030); } else flashMats(h.ch.mats, false);
  if (!G.enemies.some(e => !e.dead && e.g.position.distanceTo(h.g.position) < 4)) h.hp = Math.min(h.max, h.hp + h.max * .03 * dt);
  h.hb.set(h.hp / h.max);
}
function heroTip() { if (hero.ch.tip) { hero.g.updateMatrixWorld(true); const v = hero.ch.tip.getWorldPosition(new THREE.Vector3()); if (v.y > .8) return v; } const p = hero.g.position, f = hero.g.rotation.y; return new THREE.Vector3(p.x + Math.sin(f) * .6, p.y + (hero.cls === 'mage' ? 2.2 : 1.5), p.z + Math.cos(f) * .6); }
function attack(t) {
  const h = hero, from = heroTip(); if (h.cls === 'archer') Snd.play('bolt', { pos: from }); else if (h.cls === 'mage') Snd.play('magic', { pos: from, rate: .8 }); else { Snd.play('sword', { pos: from }); Snd.whoosh(from, .22, 700, 2200, .25); }
  if (h.cls === 'archer') shoot('arrow', from, t, stat.dmg(), { color: 0xb0ffb8 });
  else if (h.cls === 'mage') { shoot('orb', from, t, stat.dmg(), { aoe: h.C.aoe }); emit(P, from.x, from.y, from.z, 10, 0xc07aff, 3, .3); }
  else { const fx2 = Math.sin(h.face), fz2 = Math.cos(h.face);
    for (const e of [...G.enemies]) { if (e.dead || e.E.fly) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = Math.hypot(dx, dz); if (d < stat.range() + .4 && (dx * fx2 + dz * fz2) / (d || 1) > .45) hurt(e, stat.dmg(), '#ffcf9a', false, { x: h.g.position.x, z: h.g.position.z, kind: 'melee' }); }
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.8, 24, 1, -Math.PI / 3, Math.PI * 2 / 3), new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: .8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    arc.rotation.x = -Math.PI / 2; arc.rotation.z = h.face - Math.PI / 2; arc.position.set(h.g.position.x, 1, h.g.position.z); scene.add(arc); G.fxs.push({ m: arc, t: 0, dur: .2, kind: 'fade' }); }
}

export { startWarp, WARP_CD, hero, stat, heroTip, passAt, spawnHero, heroDamage, heroGoTo, updHero };
