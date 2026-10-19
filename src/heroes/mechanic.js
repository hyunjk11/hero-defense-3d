// ================= 메카닉 버들: 로봇 팔 근접 브루저 · [Q] 변신(거대 로봇 10초) · 전설 건틀릿(과부하 드릴 / 기가 해머 낙하) =================
// 기본 공격은 드릴(3연타 다단 히트 + 불꽃)과 해머(내려찍기 + 작은 범위 넉백)를 번갈아 사용. cls === 'mechanic' 일 때만 호출됨 (다른 영웅 코드 경로 불변).
// 시각 효과 난수는 Math.random (게임 난수 rand() 미사용 → 회귀 테스트 결정성 유지)
import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { inGrid, isBlock, T, toTile } from '../core/grid.js';
import { G, later } from '../core/state.js';
import { scene } from '../render/scene.js';
import { P, PB, debris, emit, ringFx } from '../render/vfx.js';
import { makeHeroModel, play } from '../render/characters.js';
import { hurt as hurt0 } from '../monsters/enemy.js';
import { groundY } from '../monsters/ai.js';
import { tileAt } from '../world/terrain.js';
import { hpBar } from '../render/hpbars.js';
import { banner } from '../ui/hud.js';
import { hero, passAt, stat } from './hero.js';

const FX = []; const _v = new THREE.Vector3();
const alive = () => G.enemies.filter(e => !e.dead && e.dying === undefined);
const d2 = (e, x, z) => { const dx = e.g.position.x - x, dz = e.g.position.z - z; return dx * dx + dz * dz; };
const ADD = (c, o = .9) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const GREEN = 0x8aff5a, SPARK = 0xffd27a;
G.mechN = { drill: 0, drillHits: 0, hammer: 0, tf: 0, robotHits: 0, finisher: 0, overdrill: 0, giga: 0, knock: 0, absorbed: 0 }; // 테스트용 카운터
let lsk = false; const hurt = (e, d, ...a) => { if (lsk && !e.dead) G.legendDmg = (G.legendDmg || 0) + d; hurt0(e, d, ...a); };
export const ROBOT_T = 10, TF_DUR = 1.25, FIN_DUR = 1.3;

// ---------- 공통 ----------
const walk = (x, z) => { const [c, r] = toTile(x, z); if (!inGrid(c, r)) return false; const t = tileAt(c, r); return !isBlock(t.t) && t.t !== T.BEDROCK && !t.tower && !t.bar; };
// 밀쳐내기: (ox,oz)에서 바깥으로 dist 만큼 0.22초에 걸쳐 밀고 짧게 띄움. 막힌 칸으로는 밀지 않음 · 비행/보스는 약하게
export function knock(e, ox, oz, dist, up = .5) {
  if (e.dead || e.E.fly) return; if (e.E.boss) { dist *= .25; up *= .3; } let dx = e.g.position.x - ox, dz = e.g.position.z - oz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const dur = .22; let t = 0; e.stunT = Math.max(e.stunT || 0, dur + .1); if (!e.kup) e.kup = { t: 0, dur: e.stunT, h: up }; G.mechN.knock++;
  FX.push(dt => { if (e.dead) return false; const k = Math.min(dt, dur - t), st = dist / dur * k * (1.6 - 1.2 * t / dur), p = e.g.position; t += dt;
    if (walk(p.x + dx * st, p.z)) p.x += dx * st; if (walk(p.x, p.z + dz * st)) p.z += dz * st;
    if (t < dur) return true; const [c, r] = toTile(p.x, p.z); if (inGrid(c, r) && walk(p.x, p.z)) e.tile = [c, r]; e.next = null; return false; });
}
const fwd = () => new THREE.Vector3(Math.sin(hero.face), 0, Math.cos(hero.face));
// 앞쪽 부채꼴 안의 적
function cone(range, dot, ox, oz) { const f = fwd(), x0 = ox ?? hero.g.position.x, z0 = oz ?? hero.g.position.z, out = [];
  for (const e of alive()) { const dx = e.g.position.x - x0, dz = e.g.position.z - z0, d = Math.hypot(dx, dz); if (d < range && (d < .6 || (dx * f.x + dz * f.z) / d > dot)) out.push(e); } return out; }
function tipPos(k) { const ch = hero.ch; if (!ch.tips || !ch.tips[k]) return hero.g.position.clone().addScaledVector(fwd(), 1.2).setY(1.4); hero.g.updateMatrixWorld(true); return ch.tips[k].getWorldPosition(new THREE.Vector3()); }
function sparks(p, n = 8, col = SPARK) { emit(P, p.x, p.y, p.z, n, col, 5, .28, -12, .2); if (n >= 10) emit(P, p.x, p.y, p.z, 2, 0xffffff, 3, .12, 0, .1); }
function drillSpin(on, fast = 1) { const f = hero.ch.drillFx; if (!f) return; f.g.visible = on; f.fast = fast; }
function shock(c, R, col = GREEN, dur = .5) { ringFx(c, R, col, dur); ringFx(c, R * .6, 0xffffff, dur * .7);
  const m = new THREE.Mesh(new THREE.RingGeometry(.6, 1, 48), ADD(col, .8)); m.rotation.x = -Math.PI / 2; m.position.set(c.x, groundY(c.x, c.z) + .15, c.z); scene.add(m); let t = 0;
  FX.push(dt => { t += dt; const k = t / dur; m.scale.setScalar(.5 + k * R); m.material.opacity = .8 * (1 - k); if (k < 1) return true; scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; }); }
function cracks(c, n, len0) { for (let i = 0; i < n; i++) { const a = i / n * 6.28 + Math.random() * .4, len = len0 * (.6 + Math.random() * .6), m = new THREE.Mesh(new THREE.PlaneGeometry(.2, len), ADD(GREEN, .9));
  m.rotation.set(-Math.PI / 2, 0, -a); m.position.set(c.x + Math.sin(a) * len / 2, groundY(c.x, c.z) + .23, c.z + Math.cos(a) * len / 2); scene.add(m); G.fxs.push({ m, t: 0, dur: 1.2, kind: 'fade' }); } }

// ---------- 초기화 (spawnHero에서 호출) ----------
export function mechInit(h) {
  h.mech = { n: 0, busy: 0, rT: 0, shield: 0, shieldMax: 0, inv: false, seq: null };
  h.human = h.ch; const r = makeHeroModel('mechanic', 'mech_robot_meshy'); r.ring = h.ch.ring; r.root.visible = false; h.g.add(r.root); h.robot = r;
  h.sb = hpBar(h.g, 5.25, 2.0, 0x6ae8ff, { h: .12 }); h.sb.show(false);
}
export const robo = () => !!(hero && hero.mech && hero.mech.rT > 0);
// 받는 피해 처리: 변신 연출 중 무적 · 로봇 보호막이 먼저 흡수. 남은 피해 반환
export function mechAbsorb(d) { const M = hero.mech; if (!M) return d; if (M.inv) return 0;
  if (M.shield > 0) { const a = Math.min(M.shield, d); M.shield -= a; d -= a; G.mechN.absorbed += a; hero.flash = .06; } return d; }

// ---------- 기본 공격 ----------
export function mechSwing(t, moving, proc) {
  const h = hero, M = h.mech; if (M.busy > 0) return; const R = M.rT > 0, spd = (R ? 1.25 : h.C.atkSpd) * Math.max(1, stat.rate() / h.C.rate);
  if (R) { h.face = Math.atan2(t.g.position.x - h.g.position.x, t.g.position.z - h.g.position.z); const k = M.n++ % 3; h.atkT = Math.min(1, 1.2 / spd);
    if (k === 0) { play(h.ch, 'Uppercut', { once: true, force: true, speed: spd }); later(.5 / spd, () => robotPunch(proc)); }
    else if (k === 1) { play(h.ch, 'Drill', { once: true, force: true, speed: spd }); drillCharge(t, spd, proc); }
    else { play(h.ch, 'Hammer', { once: true, force: true, speed: spd }); later(1.0 / spd, () => robotSlam(proc)); }
    return; }
  const k = M.n++ & 1;
  if (k === 0) { if (!moving) play(h.ch, 'Drill', { once: true, force: true, speed: spd }); h.atkT = Math.min(.9, 1 / stat.rate()); G.mechN.drill++; drillSpin(true);
    Snd.whoosh(h.g.position, .5, 900, 2600, .25);
    for (let i = 0; i < 3; i++) later((.5 + i * .17) / spd, () => { if (hero.dead > 0 || M.rT > 0) return; drillHit(.42); if (i === 0 && proc) proc(t); if (i === 2) drillSpin(false); }); }
  else { if (!moving) play(h.ch, 'Hammer', { once: true, force: true, speed: spd }); h.atkT = Math.min(.9, 1 / stat.rate()); G.mechN.hammer++;
    Snd.whoosh(h.g.position, .35, 300, 1200, .4); later((h.ch.hamHit || 1) / spd, () => { if (hero.dead > 0 || M.rT > 0) return; hammerHit(t); if (proc) proc(t); }); }
}
function drillHit(mul) { const from = tipPos('drill'), dmg = stat.dmg() * mul; let n = 0;
  for (const e of cone(stat.range() + .5, .35)) { hurt(e, dmg, '#c8ff9a', false, { x: hero.g.position.x, z: hero.g.position.z, kind: 'melee' }); n++; const p = e.g.position; if (n <= 4) sparks(_v.set(p.x, 1.2, p.z), 3); }
  G.mechN.drillHits += n; sparks(from, n ? 14 : 6); emit(P, from.x, from.y, from.z, 3, GREEN, 2, .3, 0, .2); Snd.play(n ? 'hitArmor' : 'sword', { pos: from, rate: 1.6 + Math.random() * .3, vol: .6 }); }
function hammerHit(t) { const h = hero, f = fwd(), c = h.g.position.clone().addScaledVector(f, 1.6), main = !t.dead && d2(t, h.g.position.x, h.g.position.z) < (stat.range() + 1) ** 2 ? t : null, dmg = stat.dmg();
  if (main) { hurt(main, dmg * 1.1, '#ffd28a', true, { x: h.g.position.x, z: h.g.position.z, kind: 'melee' }); knock(main, h.g.position.x, h.g.position.z, 1.4); }
  for (const e of alive()) if (e !== main && d2(e, c.x, c.z) < 1.8 * 1.8) { hurt(e, dmg * .55, '#ffd28a', false); knock(e, c.x, c.z, 1.1); }
  shock(c, 2.2, 0xffc04a, .35); emit(P, c.x, .3, c.z, 24, 0xd8c8a0, 5, .45, -8, .8); sparks(tipPos('fist'), 10); G.shake = Math.max(G.shake, .18);
  Snd.play('stomp', { pos: c, rate: 1.4, vol: .7 }); Snd.play('hitArmor', { pos: c, rate: .7 }); }

// 로봇: 헤비 펀치 (범위 2.6 · 220% · 넉백)
function robotPunch(proc) { if (!robo()) return; const h = hero, c = h.g.position.clone().addScaledVector(fwd(), 2.2), dmg = stat.dmg() * 2.2; let first = null;
  for (const e of alive()) if (d2(e, c.x, c.z) < 2.6 * 2.6) { hurt(e, dmg, '#9aff6a', true); knock(e, h.g.position.x, h.g.position.z, 2.2, .9); first = first || e; G.mechN.robotHits++; }
  if (first && proc) proc(first); shock(c, 3.2, GREEN, .4); sparks(tipPos('fist'), 18); emit(PB, c.x, 1.2, c.z, 8, GREEN, 3, .4, 0, .8); G.shake = Math.max(G.shake, .4);
  Snd.play('boom', { pos: c, vol: .45, rate: 1.6 }); Snd.play('hitArmor', { pos: c, rate: .55 }); }
// 로봇: 드릴 돌진 (앞으로 최대 3 이동하며 4연타 · 각 70%)
function drillCharge(t, spd, proc) { const h = hero, from = h.g.position.clone(), dist = Math.max(0, Math.min(3, Math.sqrt(d2(t, from.x, from.z)) - 1.4)), f = fwd(); drillSpin(true, 2);
  let el = 0, hits = 0; const D = .55 / spd; Snd.whoosh(from, .6, 600, 3000, .45);
  FX.push(dt => { if (!robo() || hero.dead > 0) { drillSpin(false); return false; } el += dt; const p = h.g.position, k = Math.min(1, el / D), want = from.clone().addScaledVector(f, dist * k);
    if (passAt(want.x, p.z)) p.x = want.x; if (passAt(p.x, want.z)) p.z = want.z; const tp = tipPos('drill'); if (Math.random() < .8) sparks(tp, 3);
    if (el > (hits + 1) * D / 4 + .05 && hits < 4) { hits++; let n = 0; for (const e of cone(4.4, .25)) { hurt(e, stat.dmg() * .7, '#c8ff9a', false); n++; G.mechN.robotHits++; if (hits === 4) knock(e, p.x, p.z, 1.2); if (hits === 1 && proc && n === 1) proc(e); }
      sparks(tp, n ? 16 : 6); Snd.play('hitArmor', { pos: tp, rate: 1.3 + hits * .1, vol: .6 }); G.shake = Math.max(G.shake, .15); }
    if (hits < 4 || el < D) return true; drillSpin(false); return false; }); }
// 로봇: 해머 내려찍기 (범위 3.4 · 260% · 충격파 · 넉백)
function robotSlam(proc) { if (!robo()) return; const h = hero, c = h.g.position.clone().addScaledVector(fwd(), 2.4), R = 3.4, dmg = stat.dmg() * 2.6; let first = null;
  for (const e of alive()) if (d2(e, c.x, c.z) < R * R) { hurt(e, dmg, '#9aff6a', true); knock(e, c.x, c.z, 2.5, 1.2); first = first || e; G.mechN.robotHits++; }
  if (first && proc) proc(first); shock(c, R + 1, GREEN, .5); shock(c, R * .5, 0xffc04a, .3); cracks(c, 8, 2.6); debris(c.x, .3, c.z, 14, [0x6a5a4a, 0x8a7a5a, 0xff9a3a], 7);
  emit(PB, c.x, .4, c.z, 16, 0xc8b090, 6, .8, -5, 2); emit(P, c.x, .4, c.z, 60, GREEN, 9, .5, -10, 1.6); G.shake = Math.max(G.shake, .7);
  Snd.play('boom', { pos: c, vol: .8 }); Snd.play('stomp', { pos: c, rate: .7, force: true }); }

// ---------- [Q] 변신 ----------
// 0초: 로봇 부품이 사방에서 날아와 모임(슬로 모션) → 0.55초: 섬광 + 모델 교체, 로봇이 공중에서 낙하 → 0.8초: 착지 충격파(밀쳐내기·화면 흔들림) → 1.25초: 조작 가능 (10초)
export function mechTransform(mul, base) {
  const h = hero, M = h.mech; if (!M || M.busy > 0 || M.rT > 0) return false;
  M.busy = TF_DUR; M.inv = true; M.seq = { kind: 'tf', t: 0, mul, base, swap: 0, land: 0 }; h.path = []; G.mechN.tf++; G.slowT = .55; G.slowF = .35; G.slowN = (G.slowN || 0) + 1;
  play(h.ch, 'FistPump', { once: true, force: true, speed: 1.4 }); banner('변신!', '#9aff6a', 1100); const p = h.g.position;
  ringFx(p, 3, GREEN, .6); ringFx(p, 1.8, 0xffffff, .4); emit(PB, p.x, 1.4, p.z, 14, GREEN, 3, .6, 2, 1); Snd.whoosh(p, 1, 200, 3200, .55); Snd.play('magic', { pos: p, rate: .5, force: true }); Snd.play('levelUp', { vol: .5, force: true });
  parts(p); return true;
}
// 부품 비행: 주황/검정 판 조각들이 나선을 그리며 영웅에게 모임
const partGeo = [new THREE.BoxGeometry(.5, .35, .25), new THREE.BoxGeometry(.3, .6, .3), new THREE.CylinderGeometry(.22, .22, .4, 10), new THREE.BoxGeometry(.7, .2, .4)];
const partMat = [new THREE.MeshToonMaterial({ color: 0xf08a1a }), new THREE.MeshToonMaterial({ color: 0x2a2a30 }), new THREE.MeshToonMaterial({ color: 0x6aff4a, emissive: 0x2a8a10 })];
function parts(c) { for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(partGeo[i % 4], partMat[i % 3]), a = i / 16 * 6.28, r0 = 6 + Math.random() * 3, y0 = 1 + Math.random() * 5, dur = .42 + Math.random() * .12, delay = Math.random() * .06; let t = -delay;
  m.position.set(c.x + Math.cos(a) * r0, y0, c.z + Math.sin(a) * r0); m.visible = false; scene.add(m); const rx = Math.random() * 8, rz = Math.random() * 8;
  FX.push(dt => { t += dt; if (t < 0) return true; m.visible = true; const k = Math.min(1, t / dur), e = k * k, aa = a + k * 2.5, rr = r0 * (1 - e) + .2, p = hero.g.position;
    m.position.set(p.x + Math.cos(aa) * rr, y0 * (1 - e) + 1.6 * e, p.z + Math.sin(aa) * rr); m.rotation.x += dt * rx; m.rotation.z += dt * rz; m.scale.setScalar(1 + e * .4);
    if (Math.random() < .6) emit(P, m.position.x, m.position.y, m.position.z, 1, GREEN, .4, .3, 0, .05);
    if (k < 1) return true; scene.remove(m); emit(P, m.position.x, m.position.y, m.position.z, 6, SPARK, 3, .25, 0, .2); return false; }); } }
function flashBall(c, col, R, dur) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), ADD(col, .95)); m.position.copy(c); scene.add(m); let t = 0;
  FX.push(dt => { t += dt; const k = t / dur; m.scale.setScalar(.3 + R * Math.sqrt(k)); m.material.opacity = .95 * (1 - k); if (k < 1) return true; scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; }); }
function swapTo(robot) { const h = hero; h.human.root.visible = !robot; h.robot.root.visible = robot; h.ch = robot ? h.robot : h.human; h.ch.cur = null; h.hb.y = robot ? 5 : 3.1; h.sb.show(robot);
  if (h.ch.drillFx) h.ch.drillFx.g.visible = false; play(h.ch, 'Idle', { fade: 0 }); }
function landing(s) { const h = hero, c = h.g.position.clone(), R = 4.8, dmg = s.base * 2.5 * s.mul;
  for (const e of alive()) if (d2(e, c.x, c.z) < R * R) { hurt0(e, dmg, '#9aff6a', true); knock(e, c.x, c.z, 3, 1.4); }
  shock(c, R + 1.5, GREEN, .6); shock(c, R, 0xffc04a, .45); later(.1, () => shock(c, R + 3, 0xffffff, .5)); cracks(c, 12, 3.4); debris(c.x, .3, c.z, 30, [0x6a5a4a, 0x8a7a5a, 0xff9a3a, 0x2a2a30], 10);
  emit(PB, c.x, .4, c.z, 30, 0xc8b090, 9, 1, -6, 3); emit(P, c.x, .4, c.z, 140, GREEN, 13, .7, -12, 3); G.shake = Math.max(G.shake, 1.2);
  Snd.play('boom', { pos: c, force: true }); Snd.play('stomp', { pos: c, rate: .6, force: true }); Snd.play('breakRock', { pos: c, force: true }); }

// ---------- 로봇 종료: 로켓 펀치 피니시 → 원래 모습 ----------
function finisher() { const h = hero, M = h.mech; M.busy = FIN_DUR; M.inv = true; M.seq = { kind: 'fin', t: 0, fired: 0, back: 0 }; h.path = []; G.mechN.finisher++;
  let best = null, bd = 16 * 16; for (const e of alive()) { const d = d2(e, h.g.position.x, h.g.position.z); if (d < bd) { bd = d; best = e; } }
  if (best) h.face = Math.atan2(best.g.position.x - h.g.position.x, best.g.position.z - h.g.position.z); play(h.ch, 'Rocket', { once: true, force: true, speed: 1.3 }); banner('로켓 펀치!', '#9aff6a', 1000); Snd.play('draw', { pos: h.g.position, rate: .6 }); }
const fistGeo = new THREE.BoxGeometry(.9, .9, 1.2), cuffGeo = new THREE.CylinderGeometry(.42, .5, .6, 12).rotateX(Math.PI / 2);
function rocketPunch() { const h = hero, from = tipPos('fist').setY(2.2), f = fwd(), dmg = stat.dmg() * 6 * stat.skillMul(), g = new THREE.Group(), hit = new Set(); let dist = 0;
  g.add(new THREE.Mesh(fistGeo, partMat[0])); const cuff = new THREE.Mesh(cuffGeo, partMat[1]); cuff.position.z = -.8; g.add(cuff); const jet = new THREE.Mesh(new THREE.ConeGeometry(.45, 1.6, 12).rotateX(-Math.PI / 2).translate(0, 0, -1.8), ADD(GREEN, .8)); g.add(jet);
  g.position.copy(from); g.lookAt(_v.copy(from).add(f)); scene.add(g); Snd.play('boom', { pos: from, vol: .5, rate: 1.8 }); Snd.whoosh(from, .7, 300, 2600, .55); G.shake = Math.max(G.shake, .4);
  FX.push(dt => { const st = 30 * dt; g.position.addScaledVector(f, st); dist += st; const p = g.position; jet.scale.set(1, 1, .8 + Math.random() * .5); emit(P, p.x - f.x * 1.6, p.y, p.z - f.z * 1.6, 4, GREEN, 2, .35, 0, .3); emit(P, p.x - f.x * 1.6, p.y, p.z - f.z * 1.6, 2, SPARK, 1.5, .3, 0, .2);
    for (const e of alive()) if (!hit.has(e) && d2(e, p.x, p.z) < 1.6 * 1.6) { hit.add(e); hurt0(e, dmg, '#9aff6a', true); knock(e, p.x - f.x, p.z - f.z, 1.8, 1); sparks(_v.set(e.g.position.x, 1.4, e.g.position.z), 14); }
    const blocked = !walk(p.x, p.z) && dist > 2; if (dist < 16 && !blocked) return true; scene.remove(g); boom(p.clone().setY(0)); return false; }); }
function boom(c) { const R = 3.6, dmg = stat.dmg() * 3 * stat.skillMul(); for (const e of alive()) if (d2(e, c.x, c.z) < R * R) { hurt0(e, dmg, '#ffd06a', true); knock(e, c.x, c.z, 2, 1); }
  flashBall(c.clone().setY(1), 0xffe0a0, 4, .35); shock(c, R + 1, 0xffa04a, .5); shock(c, R, GREEN, .4); emit(PB, c.x, 1, c.z, 30, 0xff7a2a, 8, .8, -4, 2); emit(P, c.x, 1, c.z, 110, 0xffcc5a, 12, .7, -12, 2);
  debris(c.x, .5, c.z, 16, [0x2a2a30, 0xff9a3a, 0x6a5a4a], 8); G.shake = Math.max(G.shake, .9); Snd.play('boom', { pos: c, force: true }); Snd.play('meteor', { pos: c, vol: .5, rate: 1.3 }); }
// 사망 등으로 즉시 원래 모습 (피니시 없음)
export function mechRevert() { const h = hero, M = h && h.mech; if (!M) return; const was = M.rT > 0 || M.busy > 0; M.rT = 0; M.busy = 0; M.inv = false; M.seq = null; M.shield = 0; h.robo = false; if (h.ch !== h.human) swapTo(false); if (was && h.robot.root.visible) h.robot.root.visible = false; h.robot.root.position.y = 0; }

// ---------- 매 프레임 (updHero에서): true = 연출 중 (이동·공격 막음) ----------
export function updMech(dt) {
  const h = hero, M = h.mech; if (!M) return false; if (h.ch.drillFx && h.ch.drillFx.g.visible) { const f = h.ch.drillFx; f.c1.rotation.y += dt * 40 * (f.fast || 1); f.c2.rotation.y -= dt * 25 * (f.fast || 1); }
  if (h.sb) h.sb.set(M.shieldMax ? M.shield / M.shieldMax : 0);
  if (M.busy > 0) { const S = M.seq; S.t += dt; M.busy -= dt; const p = h.g.position;
    if (S.kind === 'tf') {
      if (S.t < .55 && Math.random() < .7) { const a = Math.random() * 6.28; emit(P, p.x + Math.cos(a) * 1.4, .2, p.z + Math.sin(a) * 1.4, 2, GREEN, 1.5, .5, 6, .2); }
      if (!S.swap && S.t >= .55) { S.swap = 1; flashBall(p.clone().setY(1.8), 0xeaffd8, 5.5, .4); emit(P, p.x, 2, p.z, 80, GREEN, 10, .6, 0, 2); swapTo(true); h.robot.root.position.y = 3.2; Snd.play('magic', { pos: p, rate: 1.4, force: true }); G.shake = Math.max(G.shake, .3); }
      if (S.swap && !S.land) { const k = Math.min(1, (S.t - .55) / .25); h.robot.root.position.y = 3.2 * (1 - k * k); if (k >= 1) { S.land = 1; h.robot.root.position.y = 0; play(h.ch, 'StompS', { once: true, force: true, speed: 1.4 }); landing(S); } }
      if (M.busy <= 0) { M.busy = 0; M.inv = false; M.seq = null; M.rT = ROBOT_T; M.shieldMax = M.shield = Math.round(h.max * .6); h.robo = true; h.atkT = 0; banner(`거대 로봇 ${ROBOT_T}초 · 보호막 ${M.shield}`, '#9aff6a', 1200); }
    } else if (S.kind === 'fin') {
      if (!S.fired && S.t >= .42) { S.fired = 1; rocketPunch(); }
      if (!S.back && S.t >= 1.05) { S.back = 1; flashBall(p.clone().setY(2), 0xeaffd8, 4, .35); emit(P, p.x, 2, p.z, 50, GREEN, 7, .5, 0, 1.5); emit(PB, p.x, 1.5, p.z, 12, 0xc8c8c8, 3, .7, 2, 1); M.shield = 0; M.shieldMax = 0; h.robo = false; swapTo(false); play(h.ch, 'FistPump', { once: true, force: true, speed: 1.5 }); Snd.play('magic', { pos: p, rate: 1.1 }); }
      if (M.busy <= 0) { M.busy = 0; M.inv = false; M.seq = null; h.atkT = .3; }
    }
    return true; }
  if (M.rT > 0) { M.rT -= dt; if (Math.random() < .25) { const p = h.g.position; emit(P, p.x, 4.2, p.z - .2, 1, 0xc8c8c8, .6, .8, 3, .3); } if (M.rT <= 0) { M.rT = 0; finisher(); return true; } }
  return false;
}

// ---------- 전설 건틀릿 ----------
// 과부하 드릴 (proc): 앞쪽 부채꼴 6연속 갈기 (각 45%) + 40% 둔화 1.2초
export function overdrill(t, s) { const dmg = stat.dmg() * s.mul; G.mechN.overdrill++; drillSpin(true, 3); banner('과부하 드릴!', '#c8ff6a', 700); Snd.whoosh(hero.g.position, .6, 1200, 4000, .4);
  for (let i = 0; i < 6; i++) later(.05 + i * .08, () => { if (!hero || hero.dead > 0) return; const tp = tipPos('drill'); let n = 0;
    for (const e of cone(stat.range() + 1.4, .3)) { lsk = true; hurt(e, dmg, '#e0ff7a', false); lsk = false; if (!e.dead) { e.slowT = Math.max(e.slowT, 1.2); e.slowAmt = Math.max(e.slowAmt || 0, .4); } n++; if (n <= 4) sparks(_v.set(e.g.position.x, 1.2, e.g.position.z), 4, 0xfff07a); }
    sparks(tp, 18, 0xfff07a); emit(P, tp.x, tp.y, tp.z, 6, GREEN, 4, .3, 0, .3); Snd.play('hitArmor', { pos: tp, rate: 1.8 + i * .08, vol: .5 }); if (i === 5) drillSpin(false); }); }
// 기가 해머 낙하 (active): 목표 지점에 거대 해머 → 400% · 밀쳐내기 · 1초 기절
const hammerG = (() => { const g = new THREE.Group(), o = new THREE.MeshToonMaterial({ color: 0xf08a1a }), d = new THREE.MeshToonMaterial({ color: 0x2a2a30 }), gl = new THREE.MeshBasicMaterial({ color: 0x8aff5a, toneMapped: false });
  const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 1.8), o); g.add(head); for (const s of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, .4, 16).rotateZ(Math.PI / 2), d); cap.position.x = s * 1.8; g.add(cap); const l = new THREE.Mesh(new THREE.BoxGeometry(.12, .9, 1.4), gl); l.position.x = s * 1.0; l.position.z = 0; l.scale.z = 1.02; g.add(l); }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, 4, 10), d); handle.position.y = 2.8; g.add(handle); return g; })();
export function gigahammer(s, tg) {
  const h = hero, c = tg.clone().setY(0), dmg = stat.dmg() * s.mul * stat.skillMul(), R = 3.6; G.mechN.giga++; h.face = Math.atan2(c.x - h.g.position.x, c.z - h.g.position.z); h.path = [];
  banner('기가 해머 낙하!', '#9aff6a', 1000); play(h.ch, 'Hammer', { once: true, force: true, speed: 1.6 }); h.atkT = .7; Snd.whoosh(c, .6, 150, 900, .6);
  const warn = new THREE.Mesh(new THREE.CircleGeometry(R, 40), ADD(GREEN, .25)); warn.rotation.x = -Math.PI / 2; warn.position.set(c.x, groundY(c.x, c.z) + .2, c.z); scene.add(warn); ringFx(c, R + .5, GREEN, .6);
  const m = hammerG.clone(); m.position.set(c.x, 16, c.z); m.rotation.set(0, h.face + Math.PI / 2, -.9); scene.add(m); let t = 0;
  FX.push(dt => { t += dt; const k = Math.min(1, t / .5); m.position.y = 16 - 15 * k * k + 0; m.rotation.z = -.9 + 1.4 * k; warn.material.opacity = .2 + Math.abs(Math.sin(t * 20)) * .15;
    emit(P, m.position.x, m.position.y, m.position.z, 2, GREEN, .6, .3, 0, .6); if (k < 1) return true; scene.remove(warn);
    lsk = true; for (const e of alive()) if (d2(e, c.x, c.z) <= R * R) { hurt(e, dmg, '#9aff6a', true); if (!e.dead) { knock(e, c.x, c.z, 2.4, 1.2); e.stunT = Math.max(e.stunT, e.E.boss ? .35 : 1); if (e.kup) e.kup.dur = e.stunT; } } lsk = false;
    shock(c, R + 1.5, GREEN, .55); shock(c, R, 0xffc04a, .4); cracks(c, 10, 3); debris(c.x, .3, c.z, 22, [0x6a5a4a, 0xf08a1a, 0x2a2a30], 9); emit(PB, c.x, .4, c.z, 24, 0xc8b090, 8, .9, -6, 2.5); emit(P, c.x, .5, c.z, 120, GREEN, 12, .6, -12, 2.5);
    G.shake = Math.max(G.shake, 1); Snd.play('boom', { pos: c, force: true }); Snd.play('stomp', { pos: c, rate: .6, force: true });
    let ft = 0; FX.push(dt2 => { ft += dt2; m.position.y = 1 + ft * 3; m.scale.setScalar(Math.max(.01, 1 - ft * 2.5)); if (ft < .4) return true; scene.remove(m); return false; }); return false; });
}
export function updMechFx(dt) { for (let i = FX.length - 1; i >= 0; i--) if (!FX[i](dt)) FX.splice(i, 1); }
