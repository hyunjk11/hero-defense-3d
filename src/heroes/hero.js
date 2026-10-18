import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { $, rand } from '../core/util.js';
import { CORE, DIRS, GH, T, inGrid, tileX, tileZ, toTile } from '../core/grid.js';
import { CLASSES } from '../data/heroes.js';
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

// ================= 영웅 =================
let hero = null;
const stat = {
  dmg: () => hero.C.dmg * (1 + .15 * G.ups.atk), rate: () => hero.C.rate * (1 + .1 * G.ups.spd), range: () => hero.C.range * (1 + .08 * G.ups.rng),
  skillMul: () => 1 + .25 * G.ups.skill, skillCd: () => hero.C.cd * Math.pow(.92, G.ups.skill),
};
function spawnHero(cls) {
  const C = CLASSES[cls], ch = makeHeroModel(cls); ch.g.position.set(tileX(CORE[0] - 1), 0, tileZ(CORE[1])); ch.g.rotation.y = -Math.PI / 2; scene.add(ch.g);
  hero = G.hero = { cls, C, ch, g: ch.g, hp: C.hp, max: C.hp, cd: 0, skillCd: 0, atkT: 0, path: [], dead: 0, spinT: 0, flash: 0, face: -Math.PI / 2 };
  hero.hb = hpBar(ch.g, 3.1, 1.6, 0x55ff77); play(ch, 'Idle');
  $('heroName').textContent = `${C.n} · 스킬 [Q] ${C.skill}`; $('skillName').textContent = C.skill;
}
function heroDamage(d) {
  if (hero.dead > 0) return; d *= 1 - hero.C.armor; hero.hp -= d; hero.flash = .1; Snd.play('heroHurt', { pos: hero.g.position, vol: .8 });
  if (hero.hp <= 0) { hero.hp = 0; hero.dead = 5; hero.spinT = 0; if (hero.swirl) hero.swirl.visible = false; hero.path = []; play(hero.ch, 'Death_A', { once: true }); hero.hb.show(false); emit(P, hero.g.position.x, 1.5, hero.g.position.z, 50, 0xff4a5a, 6, .9); banner('영웅 쓰러짐! 5초 후 부활', '#ff8a9a', 1500); }
}
const heroPass = (c, r) => { if (!inGrid(c, r)) return false; const t = tileAt(c, r); return (t.t === T.GRASS || t.t === T.CARVED || t.t === T.SPAWN || t.t === T.CORE) && !t.tower && !t.bar; };
function passAt(x, z) { for (const [ox, oz] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) { const [c, r] = toTile(x + ox, z + oz); if (!heroPass(c, r)) return false; } return true; }
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
  hero.path = path.map(([c, r]) => new THREE.Vector3(tileX(c), 0, tileZ(r))); if (exact) { hero.path.pop(); hero.path.push(new THREE.Vector3(p.x, 0, p.z)); }
}

// ================= 영웅 업데이트 =================
function updHero(dt) {
  const h = hero; h.ch.mixer.update(dt);
  if (h.dead > 0) { h.dead -= dt; if (h.dead <= 0) { h.hp = h.max; h.hb.show(true); h.g.position.set(tileX(CORE[0] - 1), 0, tileZ(CORE[1])); play(h.ch, 'Cheer', { once: true }); h.atkT = 1.2; emit(P, h.g.position.x, 1, h.g.position.z, 40, 0x8aff9a, 5, .8); ringFx(h.g.position, 2.5, 0x8aff9a, .6); } return; }
  const fwd = new THREE.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta)), right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  if (keys.w) mv.add(fwd); if (keys.s) mv.sub(fwd); if (keys.d) mv.add(right); if (keys.a) mv.sub(right);
  if (mv.lengthSq() > 0) h.path = [];
  else if (h.path.length) { mv.subVectors(h.path[0], h.g.position).setY(0); if (mv.length() < .15) { h.path.shift(); if (!h.path.length) mv.set(0, 0, 0); } }
  let moving = false;
  if (mv.lengthSq() > 0) { mv.normalize().multiplyScalar(h.C.speed * dt * (h.spinT > 0 ? .7 : 1)); const p = h.g.position;
    if (passAt(p.x + mv.x, p.z)) p.x += mv.x; if (passAt(p.x, p.z + mv.z)) p.z += mv.z; h.face = Math.atan2(mv.x, mv.z); moving = true; }
  h.g.position.y += (groundY(h.g.position.x, h.g.position.z) - h.g.position.y) * Math.min(1, dt * 10);
  const rng = stat.range(); let tgt = null, bd = rng * rng;
  for (const e of G.enemies) { if (e.dead) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = dx * dx + dz * dz; if (d < bd && (h.cls !== 'warrior' || !e.E.fly)) { bd = d; tgt = e; } }
  h.cd -= dt; h.atkT -= dt;
  if (tgt && h.spinT <= 0) { const want = Math.atan2(tgt.g.position.x - h.g.position.x, tgt.g.position.z - h.g.position.z); if (!moving) h.face = want;
    if (h.cd <= 0) { h.cd = 1 / stat.rate();
      if (!moving) { const nm = h.cls === 'warrior' && rand() < .5 ? '1H_Melee_Attack_Slice_Horizontal' : h.C.atk; play(h.ch, nm, { once: true, force: true, speed: h.C.atkSpd * Math.max(1, stat.rate() / h.C.rate) }); h.atkT = Math.min(.55, 1 / stat.rate()); }
      const t0 = tgt; later(h.cls === 'warrior' ? .12 : .08, () => { if (!t0.dead && hero.dead <= 0) attack(t0); }); } }
  if (h.spinT > 0) { h.spinT -= dt; h.spinTick -= dt; h.g.rotation.y += dt * 9;
    if (h.spinTick <= 0) { h.spinTick = .25; aoe(h.g.position, 3.6, stat.dmg() * 1.3 * stat.skillMul(), '#ffb07a', { groundOnly: true }); emit(P, h.g.position.x, 1.2, h.g.position.z, 20, 0xffa04a, 7, .4, 0, 4); }
    h.swirl.rotation.z += dt * 15; if (h.spinT <= 0) { h.swirl.visible = false; play(h.ch, 'Idle'); } }
  else { let d = h.face - h.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); h.g.rotation.y += d * Math.min(1, dt * 14); }
  if (h.spinT <= 0) { if (moving) play(h.ch, 'Running_A', { speed: 1.1 }); else if (h.atkT <= 0) play(h.ch, 'Idle', { fade: .25 }); }
  h.ch.ring.material.opacity = .5 + Math.sin(G.t * 4) * .2;
  if (h.flash > 0) { h.flash -= dt; flashMats(h.ch.mats, true, 0xff3030); } else flashMats(h.ch.mats, false);
  if (!G.enemies.some(e => !e.dead && e.g.position.distanceTo(h.g.position) < 4)) h.hp = Math.min(h.max, h.hp + h.max * .03 * dt);
  h.hb.set(h.hp / h.max);
}
function heroTip() { const p = hero.g.position, f = hero.g.rotation.y; return new THREE.Vector3(p.x + Math.sin(f) * .6, p.y + (hero.cls === 'mage' ? 2.2 : 1.5), p.z + Math.cos(f) * .6); }
function attack(t) {
  const h = hero, from = heroTip(); if (h.cls === 'archer') Snd.play('bolt', { pos: from }); else if (h.cls === 'mage') Snd.play('magic', { pos: from, rate: .8 }); else { Snd.play('sword', { pos: from }); Snd.whoosh(from, .22, 700, 2200, .25); }
  if (h.cls === 'archer') shoot('arrow', from, t, stat.dmg(), { color: 0xb0ffb8 });
  else if (h.cls === 'mage') { shoot('orb', from, t, stat.dmg(), { aoe: h.C.aoe }); emit(P, from.x, from.y, from.z, 10, 0xc07aff, 3, .3); }
  else { const fx2 = Math.sin(h.face), fz2 = Math.cos(h.face);
    for (const e of [...G.enemies]) { if (e.dead || e.E.fly) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = Math.hypot(dx, dz); if (d < stat.range() + .4 && (dx * fx2 + dz * fz2) / (d || 1) > .45) hurt(e, stat.dmg(), '#ffcf9a', false, { x: h.g.position.x, z: h.g.position.z, kind: 'melee' }); }
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.8, 24, 1, -Math.PI / 3, Math.PI * 2 / 3), new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: .8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    arc.rotation.x = -Math.PI / 2; arc.rotation.z = h.face - Math.PI / 2; arc.position.set(h.g.position.x, 1, h.g.position.z); scene.add(arc); G.fxs.push({ m: arc, t: 0, dur: .2, kind: 'fade' }); }
}

export { hero, stat, spawnHero, heroDamage, heroGoTo, updHero };
