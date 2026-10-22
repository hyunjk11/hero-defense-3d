// ================= 전설 무기 고유 스킬 =================
// proc: 영웅 기본 공격 시 확률 발동(내부 쿨타임) · active: [E] 키 / HUD 버튼. 전설 무기를 장착하지 않으면 아무 코드도 실행되지 않음
// (게임 난수 rand()를 쓰지 않고 별도 시드 난수를 써서 회귀 테스트 결정성을 해치지 않음). 지형은 파괴하지 않음.
import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { QS, mulberry32 } from '../core/util.js';
import { G, later, heroFx } from '../core/state.js';
import { scene } from '../render/scene.js';
import { glow } from '../render/toon.js';
import { P, PB, debris, emit, ringFx } from '../render/vfx.js';
import { play } from '../render/characters.js';
import { makeArrow } from '../combat/projectiles.js';
import { hurt as hurt0 } from '../monsters/enemy.js';
import { groundY } from '../monsters/ai.js';
import { LSK } from '../account/equip.js';
import { banner } from '../ui/hud.js';
import { mouseGround } from '../ui/input.js';
import { hero, heroTip, passAt, stat } from './hero.js';
import { ricochet, rosebarrage, updGun, gunFlash } from './gunner.js';
import { gigahammer, overdrill, updMechFx } from './mechanic.js';
import { updUnique, uniqueHero } from './unique.js';
import { awakeMul, awakeCd } from '../data/items.js';

const lr = mulberry32(((+QS.get('rng') || (Math.random() * 1e9 | 0)) ^ 0x1e9e7d) >>> 0);
let lrNext = lr; const LR = () => lrNext(); G.legendSeed = s => { lrNext = mulberry32(s >>> 0); }; // 테스트: 발동 난수 고정
const FX = G.lfx = heroFx(); G.legendN = {}; // 발동 횟수 (테스트용)
G.legendDmg = 0; const hurt = (e, d, ...a) => { if (!e.dead) G.legendDmg += d; hurt0(e, d, ...a); }; // 고유 스킬 피해 합계 (테스트용)
const count = k => G.legendN[k] = (G.legendN[k] || 0) + 1;
let lastPT = 'mouse'; addEventListener('pointerdown', e => { lastPT = e.pointerType; }, true);
const ADD = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const alive = () => G.enemies.filter(e => !e.dead && e.dying === undefined);
const d2 = (e, x, z) => { const dx = e.g.position.x - x, dz = e.g.position.z - z; return dx * dx + dz * dz; };
const fade = (m, dur) => { scene.add(m); G.fxs.push({ m, t: 0, dur, kind: 'fade' }); };
export const legendSkill = () => hero && hero.lsk ? LSK[hero.lsk] : null;
export const legendActive = () => { const s = legendSkill(); return s && s.type === 'active' ? s : null; };
export const legendCd = () => { const s = legendActive(); return s ? s.cd * (s.uq ? awakeCd(hero.uqA) : 1) * (1 - Math.min(40, (hero.eq && hero.eq.cdr) || 0) / 100) : 0; }; // 고유 무기: 각성마다 쿨 -4%
const AW = s => (s.uq ? awakeMul(hero.uqA) : 1), A3 = () => (hero.uqA || 0) >= 3; // 고유 무기 각성: 위력 +8%/★, ★3 추가 효과

// 목표 지점: 마우스는 커서 위치, 터치(버튼을 누름)는 영웅 근처 적이 가장 많이 모인 곳 → 없으면 바라보는 방향
function aim(maxD) {
  const h = hero.g.position;
  if (lastPT === 'mouse' && mouseGround.lengthSq() > 0) { const t = mouseGround.clone().setY(0); if (t.distanceTo(h) > maxD) t.sub(h).setY(0).setLength(maxD).add(h); return t; }
  let best = null, bn = -1; const L = alive();
  for (const e of L) { if (d2(e, h.x, h.z) > maxD * maxD) continue; let n = 0; for (const o of L) if (d2(o, e.g.position.x, e.g.position.z) < 16) n++; if (n > bn) { bn = n; best = e; } }
  if (best) return new THREE.Vector3(best.g.position.x, 0, best.g.position.z);
  return new THREE.Vector3(h.x + Math.sin(hero.face) * 6, 0, h.z + Math.cos(hero.face) * 6);
}

// ---------- proc (기본 공격 직후 호출) ----------
export function legendProc(t) {
  const s = legendSkill(); if (!s || s.type !== 'proc' || hero.licd > 0 || !t || t.dead) return;
  if (LR() >= (G.legendForce ? 1 : s.chance)) return; hero.licd = s.icd; count(hero.lsk);
  ({ multishot, frostorb, boomerang, ricochet, overdrill })[hero.lsk](t, s);
}
// 멀티샷: 황금 화살 5발 부채꼴
function multishot(t, s) {
  const from = heroTip(), a0 = Math.atan2(t.g.position.x - from.x, t.g.position.z - from.z), dmg = stat.dmg() * s.mul, max = stat.range() * 1.25 + 4;
  Snd.play('draw', { pos: from, rate: 1.3 }); for (let k = 0; k < 3; k++) Snd.play('bolt', { pos: from, delay: k * .04, rate: 1.1 + k * .15, force: true });
  emit(P, from.x, from.y, from.z, 24, 0xffd86a, 5, .35, 0, .6); ringFx(hero.g.position, 1.8, 0xffd86a, .3);
  for (let i = -2; i <= 2; i++) { const a = a0 + i * .2, m = makeArrow(0xffd86a); m.scale.setScalar(1.35); m.position.copy(from); m.rotation.y = a; scene.add(m);
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); let dist = 0;
    FX.push(dt => { const st = 34 * dt; m.position.addScaledVector(dir, st); dist += st; m.position.y = Math.max(.9, m.position.y - dt * 1.2);
      emit(P, m.position.x, m.position.y, m.position.z, 1, 0xffc84a, .3, .3, 0, 0);
      for (const e of alive()) if (d2(e, m.position.x, m.position.z) < .8) { hurt(e, dmg, '#ffe08a', false, { x: m.position.x - dir.x, z: m.position.z - dir.z, kind: 'ranged' }); emit(P, m.position.x, m.position.y, m.position.z, 10, 0xffe08a, 4, .3); scene.remove(m); return false; }
      if (dist > max) { scene.remove(m); return false; } return true; }); }
}
// 프로즌 오브: 느린 얼음 구체 — 주변 피해·둔화, 끝에서 폭발해 빙결
function frostorb(t, s) {
  const from = heroTip(), dir = new THREE.Vector3(t.g.position.x - from.x, 0, t.g.position.z - from.z).normalize(), base = stat.dmg();
  const g = new THREE.Group(), core = new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 1), glow(0xbaf4ff, 4)), aura = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), ADD(0x5ac8ff));
  aura.material.opacity = .16; const ring = new THREE.Mesh(new THREE.RingGeometry(2, 2.25, 40), ADD(0x9ae8ff)); ring.rotation.x = -Math.PI / 2; ring.position.y = -1.1; ring.material.opacity = .6;
  g.add(core, aura, ring); g.position.set(from.x, 1.4, from.z); scene.add(g);
  Snd.play('magic', { pos: from, rate: 1.7, force: true }); Snd.play('glass', { pos: from, rate: 1.5, vol: .5 }); emit(P, from.x, from.y, from.z, 30, 0x9ae8ff, 5, .5, 0, 1);
  let life = Math.max(1.2, Math.min(3, (Math.hypot(t.g.position.x - from.x, t.g.position.z - from.z) + 1.5) / 3.6)), tick = 0; // 대상 뒤쪽에서 폭발
  FX.push(dt => { life -= dt; tick -= dt; g.position.addScaledVector(dir, 3.6 * dt); core.rotation.x += dt * 3; core.rotation.y += dt * 4; aura.scale.setScalar(1 + Math.sin(G.t * 9) * .06); ring.rotation.z += dt * 2;
    g.position.y = 1.4 + Math.sin(G.t * 5) * .15; if (Math.random() < .9) { const a = Math.random() * 6.28; emit(P, g.position.x + Math.cos(a) * 1.6, g.position.y - .6, g.position.z + Math.sin(a) * 1.6, 1, 0xcaf6ff, .8, .6, -1, .2); }
    if (tick <= 0) { tick = .3; for (const e of alive()) if (d2(e, g.position.x, g.position.z) < 2.2 * 2.2) { e.slowT = Math.max(e.slowT, .6); e.slowAmt = Math.max(e.slowT > .6 ? e.slowAmt || 0 : 0, .5); hurt(e, base * s.mul, '#aee8ff'); } }
    if (life > 0) return true;
    scene.remove(g); const p = g.position; ringFx(p, 3.4, 0xbaf4ff, .5); ringFx(p, 2.2, 0xffffff, .3); emit(P, p.x, p.y, p.z, 90, 0xbaf4ff, 9, .8, -6, 2); emit(PB, p.x, p.y, p.z, 14, 0x7ad8ff, 3, .6, 0, 1.5); debris(p.x, p.y, p.z, 10, [0xdaf6ff, 0x9ae0ff], 6);
    Snd.play('glass', { pos: p, force: true }); Snd.play('zap', { pos: p, rate: .7 });
    for (const e of alive()) if (d2(e, p.x, p.z) < 9) { hurt(e, base * 1.2, '#dff8ff', true); if (e.dead) continue; e.stunT = e.E.boss ? .4 : 1.1; e.frozen = true; }
    return false; });
}
// 회선대검: 회전하며 날아갔다 돌아오는 대검
function boomerang(t, s) {
  const h = hero.g.position, dir = new THREE.Vector3(t.g.position.x - h.x, 0, t.g.position.z - h.z).normalize(), dmg = stat.dmg() * s.mul;
  const g = new THREE.Group(), blade = new THREE.Mesh(new THREE.BoxGeometry(.32, .09, 2.6), glow(0xffe2a8, 2.2)), guard = new THREE.Mesh(new THREE.BoxGeometry(.9, .14, .16), glow(0xffa83a, 1.5)), trail = new THREE.Mesh(new THREE.RingGeometry(.9, 1.45, 32, 1, 0, Math.PI * 1.3), ADD(0xffa04a));
  blade.position.z = .7; guard.position.z = -.6; trail.rotation.x = -Math.PI / 2; trail.material.opacity = .45; g.add(blade, guard, trail); g.position.set(h.x, 1.2, h.z); scene.add(g);
  Snd.whoosh(h, .9, 300, 1800, .5); Snd.play('sword', { pos: h, rate: .8, force: true }); emit(P, h.x, 1.2, h.z, 16, 0xffb07a, 5, .3);
  let out = true, dist = 0, hit = new Set(), back = 0;
  FX.push(dt => { g.rotation.y += dt * 22; const p = g.position;
    if (out) { const st = 17 * dt; p.addScaledVector(dir, st); dist += st; if (dist > 8.5) { out = false; hit = new Set(); Snd.whoosh(p, .7, 400, 2000, .4); } }
    else { const hp = hero.g.position, v = new THREE.Vector3(hp.x - p.x, 0, hp.z - p.z), L = v.length(); back += dt; if (L < .9 || back > 2.5) { scene.remove(g); emit(P, hp.x, 1.2, hp.z, 12, 0xffd0a0, 3, .3); Snd.play('hitArmor', { pos: hp, rate: 1.4 }); return false; } p.addScaledVector(v.normalize(), Math.min(L, 20 * dt)); }
    emit(P, p.x + Math.sin(g.rotation.y) * 1.4, 1.2, p.z + Math.cos(g.rotation.y) * 1.4, 2, 0xffa04a, .6, .3, 0, 0);
    for (const e of alive()) if (!e.E.fly && !hit.has(e) && d2(e, p.x, p.z) < 1.7 * 1.7) { hit.add(e); hurt(e, dmg, '#ffcf9a', false, { x: p.x, z: p.z, kind: 'melee' }); emit(P, e.g.position.x, 1.2, e.g.position.z, 10, 0xffc07a, 4, .3); }
    return true; });
}

// ---------- active ([E]) ----------
export function castLegend() {
  const s = legendActive(); if (!s || !hero || hero.dead > 0 || hero.lcd > 0 || hero.leap || (hero.mech && hero.mech.busy > 0) || (G.phase !== 'build' && G.phase !== 'wave')) { if (s && hero && hero.lcd > 0) Snd.play('error'); return false; }
  if (hero.warpT > 0) return false; hero.lcd = legendCd(); hero.spinT = 0; hero.roseT = 0; if (hero.swirl) hero.swirl.visible = false; count(hero.lsk);
  if (hero.lsk === 'rosebarrage') rosebarrage(s, aim(14)); else if (hero.lsk === 'gigahammer') gigahammer(s, aim(12)); else ({ pierce, meteorstorm, quake, rootshot: pierce, zeroabs, eruption: quake, execution })[hero.lsk](s); return true;
}
// 관통샷: 충전 → 일직선 모든 적 관통하는 황금 화살 + 큰 잔상
function pierce(s) {
  const tg = aim(30), h = hero.g.position, ang = hero.face = Math.atan2(tg.x - h.x, tg.z - h.z), root = !!s.root, CC = root ? 0x8aff6a : 0xffe07a; hero.path = []; banner(root ? '뿌리 감옥 화살!' : '관통샷!', root ? '#9aff7a' : '#ffd86a', 800); // rootshot(고유) = 관통샷 + 속박
  play(hero.ch, hero.ch.acts.Ranged_Skill ? 'Ranged_Skill' : '2H_Ranged_Shoot', { once: true, force: true, speed: .9 }); hero.atkT = .9;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(.25, 1), glow(CC, 6)); scene.add(orb); ringFx(h, 2.6, 0xffd86a, .45);
  Snd.play('draw', { pos: h, rate: .7, force: true }); Snd.whoosh(h, .45, 200, 3000, .4); let ch = 0;
  FX.push(dt => { ch += dt; hero.face = ang; const tip = heroTip(); orb.position.copy(tip); orb.scale.setScalar(1 + ch * 6); const a = Math.random() * 6.28; emit(P, tip.x + Math.cos(a) * 1.4, tip.y + Math.sin(a) * .8, tip.z + Math.sin(a) * 1.4, 2, 0xffe07a, -2.5, .3, 0, 0);
    if (ch < .4) return true; scene.remove(orb); fire(tip); return false; });
  const fire = from => {
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), dmg = stat.dmg() * s.mul * AW(s) * stat.skillMul(), m = makeArrow(CC), hit = new Set(), L = 30; let dist = 0;
    m.scale.set(3.2, 3.2, 2.4); m.position.copy(from).setY(1.3); m.rotation.y = ang; scene.add(m); const start = m.position.clone();
    Snd.play('bolt', { pos: from, rate: .55, force: true }); Snd.play('boom', { pos: from, vol: .4, rate: 1.6 }); Snd.whoosh(from, .6, 600, 4000, .5); G.shake = Math.max(G.shake || 0, .3); emit(PB, from.x, 1.3, from.z, 8, 0xffd86a, 4, .4, 0, .5);
    FX.push(dt => { const st = 60 * dt, px = m.position.x, pz = m.position.z; m.position.addScaledVector(dir, st); dist += st; const p = m.position;
      emit(PB, p.x, p.y, p.z, 2, 0xffc84a, .5, .35, 0, .3); emit(P, p.x, p.y, p.z, 6, 0xfff0b0, 1.5, .45, 0, .4);
      // 이번 프레임 이동 구간(선분) 기준 판정 → 느린 프레임(dt 0.05 = 3칸)에서도 적을 건너뛰지 않음
      const segD2 = e => { const ex = e.g.position.x - px, ez = e.g.position.z - pz, t = Math.max(0, Math.min(st, ex * dir.x + ez * dir.z)), qx = ex - dir.x * t, qz = ez - dir.z * t; return qx * qx + qz * qz; };
      for (const e of alive()) if (!hit.has(e) && segD2(e) < 1.3 * 1.3) { hit.add(e); hurt(e, dmg, root ? '#b8ff9a' : '#ffd86a', true); emit(P, e.g.position.x, 1.4, e.g.position.z, 20, root ? 0x9aff7a : 0xffe08a, 6, .4);
        if (root && !e.dead && !e.E.fly) { const t = e.E.boss ? s.rootBoss : s.root; e.stunT = Math.max(e.stunT || 0, t); e.frozen = false; if (A3()) { e.vulnT = G.t + t; e.vulnAmt = .15; } ringFx(e.g.position, 1.1, 0x6aff4a, t); G.legendRoot = (G.legendRoot || 0) + 1; } }
      if (dist < L) return true; scene.remove(m);
      const len = start.distanceTo(p), beam = new THREE.Mesh(new THREE.CylinderGeometry(.18, .5, len, 10, 1, true), ADD(0xffd86a)); beam.rotation.set(Math.PI / 2, 0, 0); beam.position.set(0, 0, 0);
      const holder = new THREE.Group(); holder.add(beam); beam.position.z = len / 2; holder.position.copy(start); holder.rotation.y = ang; scene.add(holder); beam.material.opacity = .8; G.fxs.push({ m: beam, t: 0, dur: .6, kind: 'fade', holder });
      later(.62, () => scene.remove(holder)); return false; });
  };
}
// 메테오 스톰: 거대 운석 6개
function meteorstorm(s) {
  const tg = aim(16), h = hero.g.position, dmg = stat.dmg() * s.mul * stat.skillMul(); hero.face = Math.atan2(tg.x - h.x, tg.z - h.z); hero.path = [];
  banner('메테오 스톰!', '#ff7a3a', 1000); play(hero.ch, 'Spellcast_Summon', { once: true, force: true }) || play(hero.ch, 'Spellcast_Long', { once: true, force: true, speed: 1.2 }); hero.atkT = 1.2;
  const warn = new THREE.Mesh(new THREE.CircleGeometry(5.2, 48), ADD(0xff3a1a)); warn.rotation.x = -Math.PI / 2; warn.position.set(tg.x, .25, tg.z); warn.material.opacity = .25; scene.add(warn); ringFx(tg, 6, 0xff5a2a, 1.6); ringFx(tg, 4, 0xffa04a, 1.2);
  emit(PB, h.x, 2.4, h.z, 10, 0xff6a2a, 3, .8, 3, 1); Snd.play('meteorCast', { pos: h, rate: .65, force: true }); Snd.whoosh(tg, 2, 120, 700, .6);
  let wt = 0; FX.push(dt => { wt += dt; warn.material.opacity = .18 + Math.abs(Math.sin(wt * 10)) * .2; if (wt < 2.3) return true; scene.remove(warn); return false; });
  for (let i = 0; i < 6; i++) later(.25 + i * .28, () => { const big = i === 5, a = LR() * 6.28, rr = big ? 0 : 1.2 + LR() * 2.8, dest = new THREE.Vector3(tg.x + Math.cos(a) * rr, 0, tg.z + Math.sin(a) * rr), R = big ? 4.2 : 3;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 2.2 : 1.5, 1), glow(big ? 0xff3a0a : 0xff6a1a, 6)), shell = new THREE.Mesh(new THREE.SphereGeometry(big ? 3.2 : 2.3, 16, 12), ADD(0xffb04a)); shell.material.opacity = .25; m.add(shell);
    m.position.set(dest.x - 10, 30, dest.z - 6); scene.add(m); const v = dest.clone().sub(m.position).normalize();
    FX.push(dt => { m.position.addScaledVector(v, 44 * dt); m.rotation.x += dt * 6; m.rotation.z += dt * 4; emit(P, m.position.x, m.position.y, m.position.z, 10, 0xff8a2a, 2.5, .55, 2, 2.5); emit(PB, m.position.x, m.position.y, m.position.z, 1, 0xff5a1a, 1, .5, 0, 1);
      if (m.position.y > .5) return true; scene.remove(m);
      for (const e of alive()) if (d2(e, dest.x, dest.z) <= R * R) { e.slowT = Math.max(e.slowT, 1.2); e.slowAmt = Math.max(e.slowAmt || 0, .4); hurt(e, dmg * (big ? 1.5 : 1), '#ffb05a', true); }
      G.shake = Math.max(G.shake, big ? 1 : .5); ringFx(dest, R + 1, 0xff8a2a, .5); ringFx(dest, R * .6, 0xffe0a0, .3); emit(PB, dest.x, .5, dest.z, big ? 40 : 20, 0xff7a2a, big ? 10 : 7, .9, -4, 3); emit(P, dest.x, .5, dest.z, big ? 160 : 80, 0xffcc5a, big ? 14 : 10, 1, -14, 3);
      debris(dest.x, .5, dest.z, big ? 26 : 12, [0x3a2a2a, 0xff6a2a, 0x6a4a3a], big ? 10 : 7); scorch(dest, R); Snd.play('meteor', { pos: dest, force: true, rate: big ? .8 : 1 + i * .05 }); Snd.play('boom', { pos: dest, vol: big ? 1 : .7 });
      return false; }); });
}
function scorch(p, r) { const m = new THREE.Mesh(new THREE.CircleGeometry(r * .8, 32), new THREE.MeshBasicMaterial({ color: 0xff4a0a, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, .22, p.z); fade(m, 1.2); }
// 천지파열무: 도약 → 내려찍기 충격파 + 균열 + 띄우기(기절)
function quake(s) {
  const h = hero.g.position, tg = aim(8), from = h.clone(); let to = tg.clone(); const n = 16;
  for (let k = 0; k <= n && !passAt(to.x, to.z); k++) to = tg.clone().lerp(from, k / n); if (!passAt(to.x, to.z)) to = from.clone();
  hero.face = Math.atan2(to.x - h.x, to.z - h.z) || hero.face; hero.path = []; banner(s.pool ? '분화 일격!' : '천지파열무!', s.pool ? '#ff7a3a' : '#ffaa5a', 1000);
  play(hero.ch, hero.ch.acts.Jump_Full_Long ? 'Jump_Full_Long' : hero.ch.acts.Jump_Full_Short ? 'Jump_Full_Short' : '2H_Melee_Attack_Chop', { once: true, force: true, speed: 1.4 });
  Snd.whoosh(h, .6, 200, 1400, .5); Snd.play('stomp', { pos: h, rate: 1.3 }); emit(P, h.x, .3, h.z, 30, 0xc8b090, 4, .5, -4, 1.5);
  hero.leap = { t: 0, dur: .6, from, to, s };
}
// hero.js updHero에서 hero.leap이 있을 때만 호출
export function updLeap(dt) {
  const L = hero.leap, p = hero.g.position; L.t += dt; const k = Math.min(1, L.t / L.dur);
  p.x = L.from.x + (L.to.x - L.from.x) * k; p.z = L.from.z + (L.to.z - L.from.z) * k; p.y = groundY(p.x, p.z) + Math.sin(k * Math.PI) * 3.6; hero.g.rotation.y = hero.face;
  if (k > .55 && !L.chop) { L.chop = 1; play(hero.ch, '2H_Melee_Attack_Chop', { once: true, force: true, speed: 1.8 }); }
  emit(P, p.x, p.y + 1, p.z, 2, 0xffa04a, 1, .3, 0, .3);
  if (k < 1) return; hero.leap = null; p.y = groundY(p.x, p.z); hero.atkT = .5; smash(p.clone(), L.s);
}
function smash(c, s) {
  const R = 5.5, dmg = stat.dmg() * s.mul * AW(s) * stat.skillMul(); G.shake = Math.max(G.shake, 1.1); if (s.pool) lavaPool(c, s);
  for (const e of alive()) if (!e.E.fly && d2(e, c.x, c.z) <= R * R) { hurt(e, dmg, '#ffb07a', true); if (!e.dead) { e.stunT = e.E.boss ? .3 : .8; e.kup = { t: 0, dur: e.stunT, h: e.E.boss ? .4 : 1.6 }; e.frozen = false; } }
  for (let i = 0; i < 3; i++) later(i * .1, () => ringFx(c, R + 1.5 - i, [0xffa04a, 0xffd0a0, 0xff6a2a][i], .55));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ADD(0xffb06a)); dome.position.set(c.x, .1, c.z); dome.material.opacity = .5; scene.add(dome);
  let dt0 = 0; FX.push(dt => { dt0 += dt; dome.scale.set(1 + dt0 * 16, 1 + dt0 * 6, 1 + dt0 * 16); dome.material.opacity = .5 * (1 - dt0 / .4); if (dt0 < .4) return true; scene.remove(dome); return false; });
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28 + Math.random() * .3, len = 2.5 + Math.random() * 3, m = new THREE.Mesh(new THREE.PlaneGeometry(.22, len), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: .95, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.rotation.set(-Math.PI / 2, 0, -a); m.position.set(c.x + Math.sin(a) * len / 2, groundY(c.x, c.z) + .24, c.z + Math.cos(a) * len / 2); fade(m, 1.6);
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(.55, len * .9), new THREE.MeshBasicMaterial({ color: 0x1a1008, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide })); m2.rotation.copy(m.rotation); m2.position.copy(m.position).setY(m.position.y - .01); fade(m2, 1.8); }
  emit(PB, c.x, .4, c.z, 30, 0xc8a070, 9, 1, -6, 3); emit(P, c.x, .4, c.z, 140, 0xffb06a, 13, .8, -12, 3); debris(c.x, .3, c.z, 30, [0x7a6a5a, 0x5a4a3a, 0xa08a6a], 9);
  Snd.play('boom', { pos: c, force: true }); Snd.play('breakRock', { pos: c, force: true }); Snd.play('stomp', { pos: c, rate: .7, force: true }); Snd.play('meteor', { pos: c, vol: .5, rate: 1.4 });
}
// 매 프레임: 쿨다운 + 이펙트 (전설 스킬이 없고 이펙트도 없으면 즉시 반환)
export function updLegend(dt) {
  if (hero && hero.lsk) { if (hero.lcd > 0) hero.lcd -= dt; if (hero.licd > 0) hero.licd -= dt; }
  for (let i = FX.length - 1; i >= 0; i--) if (!FX[i](dt)) FX.splice(i, 1);
  updGun(dt); updMechFx(dt); updUnique(dt);
}
// 파티의 다른 영웅(조작 영웅 아닌): 영웅별 부분만 (이펙트 목록은 updLegend 가 한 번만 돌림)
export function updLegendHero(dt) {
  if (hero && hero.lsk) { if (hero.lcd > 0) hero.lcd -= dt; if (hero.licd > 0) hero.licd -= dt; }
  gunFlash(dt); uniqueHero(dt);
}

// ---------- 고유 무기 [E] (data/items.js UQ.sk, LSK uq:true) ----------
// 분화 일격 용암 장판: 착지점 반경 3, 0.5초마다 공격력 30% (★3 6초)
function lavaPool(c, s) {
  const dur = A3() ? 6 : s.pool, R = s.poolR, m = new THREE.Mesh(new THREE.CircleGeometry(R, 40), new THREE.MeshBasicMaterial({ color: 0xff5a0a, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(c.x, groundY(c.x, c.z) + .23, c.z); scene.add(m); let t = 0, tick = 0; const mul = s.poolMul * AW(s);
  FX.push(dt => { t += dt; tick -= dt; m.material.opacity = .4 + Math.sin(t * 8) * .12; if (LR() < .6) { const a = LR() * 6.28, rr = Math.sqrt(LR()) * R; emit(P, c.x + Math.cos(a) * rr, .4, c.z + Math.sin(a) * rr, 1, 0xff8a2a, 1.2, .5, 3, .3); }
    if (tick <= 0) { tick = .5; for (const e of alive()) if (!e.E.fly && d2(e, c.x, c.z) <= R * R) hurt(e, stat.dmg() * mul, '#ff9a4a'); G.legendPool = (G.legendPool || 0) + 1; }
    if (t < dur) return true; scene.remove(m); return false; });
}
// 절대영도: 목표 지점 반경 4.5 — 300% + 빙결 1.5초(보스 0.5, ★3 2초) + 이후 3초 50% 둔화
function zeroabs(s) {
  const tg = aim(16), h = hero.g.position, R = s.r; hero.face = Math.atan2(tg.x - h.x, tg.z - h.z); hero.path = []; banner('절대영도!', '#bfefff', 1000);
  play(hero.ch, 'Spellcast_Long', { once: true, force: true, speed: 1.4 }); hero.atkT = .8; ringFx(tg, R + .5, 0xbfefff, .6); ringFx(tg, R * .5, 0xffffff, .5);
  const warn = new THREE.Mesh(new THREE.CircleGeometry(R, 48), ADD(0x7ad8ff)); warn.rotation.x = -Math.PI / 2; warn.position.set(tg.x, .25, tg.z); warn.material.opacity = .25; scene.add(warn);
  Snd.play('magic', { pos: h, rate: 1.4, force: true }); Snd.play('glass', { pos: tg, rate: .7 }); let wt = 0;
  FX.push(dt => { wt += dt; warn.material.opacity = .2 + wt * .5; emit(P, tg.x + (LR() - .5) * R * 2, 5, tg.z + (LR() - .5) * R * 2, 2, 0xdaf6ff, .5, .6, -14, .3); if (wt < .5) return true; scene.remove(warn);
    const dmg = stat.dmg() * s.mul * AW(s) * stat.skillMul(), frz = A3() ? 2 : s.frz;
    for (const e of alive()) if (d2(e, tg.x, tg.z) <= R * R) { hurt(e, dmg, '#dff8ff', true); if (e.dead) continue; const t = e.E.boss ? s.frzBoss : frz; e.stunT = Math.max(e.stunT || 0, t); e.frozen = true; e.slowT = Math.max(e.slowT, t + 3); e.slowAmt = Math.max(e.slowAmt || 0, .5); G.legendFreeze = (G.legendFreeze || 0) + 1; }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ADD(0xbfefff)); dome.position.set(tg.x, .1, tg.z); dome.material.opacity = .45; scene.add(dome); G.fxs.push({ m: dome, t: 0, dur: .9, kind: 'fade' });
    emit(P, tg.x, 1, tg.z, 160, 0xdaf6ff, 11, .9, -6, R); emit(PB, tg.x, 1, tg.z, 20, 0x7ad8ff, 4, .7, 0, R * .6); debris(tg.x, .5, tg.z, 18, [0xdaf6ff, 0x9ae0ff, 0xffffff], 7); G.shake = Math.max(G.shake || 0, .5);
    Snd.play('glass', { pos: tg, force: true }); Snd.play('zap', { pos: tg, rate: .5 }); return false; });
}
// 왕가의 처형: 체력이 가장 높은 적(보스 우선) 1명에게 6연사(각 200%, ★3 8연사). 이 스킬로 처치하면 재사용 50% 반환(1회)
function execution(s) {
  const pick = () => alive().sort((a, b) => (!!b.E.boss - !!a.E.boss) || b.hp - a.hp)[0]; let tg = pick(); const n = A3() ? 8 : s.shots, mul = s.mul * AW(s); let refund = false;
  banner('왕가의 처형!', '#ffb0d8', 900); hero.atkT = n * .12 + .2; if (hero.ch.acts.ShootLoop) play(hero.ch, 'ShootLoop', { force: true, speed: 1.6 });
  for (let i = 0; i < n; i++) later(i * .12, () => { if (!hero || hero.dead > 0) return; if (!tg || tg.dead || tg.dying !== undefined) tg = pick(); if (!tg) return; const from = heroTip(), to = tg.g.position.clone().setY(1.3);
    hero.face = Math.atan2(to.x - hero.g.position.x, to.z - hero.g.position.z); const len = from.distanceTo(to), beam = new THREE.Mesh(new THREE.CylinderGeometry(.07, .12, len, 6, 1, true), ADD(0xffc0e0));
    const holder = new THREE.Group(); holder.add(beam); beam.rotation.x = Math.PI / 2; beam.position.z = len / 2; holder.position.copy(from); holder.lookAt(to); scene.add(holder); beam.material.opacity = .9; G.fxs.push({ m: beam, t: 0, dur: .18, kind: 'fade', holder }); later(.2, () => scene.remove(holder));
    Snd.play('bolt', { pos: from, rate: 1.6 + i * .05, force: true }); emit(P, to.x, to.y, to.z, 14, i === n - 1 ? 0xffd86a : 0xff9ac8, 4, .35);
    const e = tg; hurt(e, stat.dmg() * mul * stat.skillMul(), '#ffd0e8', true); G.legendExec = (G.legendExec || 0) + 1;
    if (e.dead && !refund) { refund = true; hero.lcd *= .5; banner('처형! 재사용 50% 반환', '#ffd86a', 700); } });
}
