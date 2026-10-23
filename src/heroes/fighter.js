// ================= 격투가 진서윤: 빠른 3연타(주먹·주먹·회전 돌려차기 넉백) · 장풍 충전(0.4초 약 / 1.2초 관통) · [Q] 냥냥 진각 · 전설(냥냥 난타 / 맹호 돌진) =================
// cls === 'fighter' 일 때만 호출됨 (다른 영웅 코드 경로 불변). 수치 = data/fighter.js FT. 시각 효과 난수는 Math.random (게임 난수 rand() 미사용 → 회귀 결정성)
import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { G, later, heroFx } from '../core/state.js';
import { scene } from '../render/scene.js';
import { P, PB, debris, emit, ringFx } from '../render/vfx.js';
import { play } from '../render/characters.js';
import { hurt as hurt0 } from '../monsters/enemy.js';
import { groundY } from '../monsters/ai.js';
import { banner } from '../ui/hud.js';
import { hero, passAt, stat } from './hero.js';
import { knock } from './mechanic.js';
import { legendProc } from './legend.js';
import { FT, comboMul, isKick, isRangedFoe, jpLevel, jpMul } from '../data/fighter.js';
import { awakeMul } from '../data/items.js';

const FX = heroFx();
G.ftN = { jab: 0, kick: 0, kickHits: 0, jpWeak: 0, jpFull: 0, jpHits: 0, jpCancel: 0, charge: 0, q: 0, qHits: 0, qStun: 0, paw: 0, dash: 0 }; // 테스트용 카운터
let lsk = false; const hurt = (e, d, ...a) => { if (lsk && !e.dead) G.legendDmg = (G.legendDmg || 0) + d; hurt0(e, d, ...a); };
const alive = () => G.enemies.filter(e => !e.dead && e.dying === undefined && !(e.immT > G.t));
const d2 = (e, x, z) => { const dx = e.g.position.x - x, dz = e.g.position.z - z; return dx * dx + dz * dz; };
const ADD = (c, o = .9) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const ORANGE = 0xff9a3a, GOLD = 0xffd27a, fade = (m, dur) => { scene.add(m); G.fxs.push({ m, t: 0, dur, kind: 'fade' }); };
const fwd = () => new THREE.Vector3(Math.sin(hero.face), 0, Math.cos(hero.face));
const faceTo = p => { const h = hero.g.position; hero.face = Math.atan2(p.x - h.x, p.z - h.z); };
// 클립 안의 타격 시점(초, 속도 1) — tools: /workspace/seoyun3d/timing.mjs 로 손/발 앞 끝 정점에서 측정
const HIT = { JabLs: .30, JabRs: .34, SpinK: .51, PalmS: .40 }, LEN = { JabLs: .7, JabRs: .7, SpinK: 1, PalmS: 1.1 };

// ---------- 초기화 (spawnHero) ----------
export function fighterInit(h) {
  h.ft = { n: 0, idle: 9, jp: null, leap: null, glow: [] };
  // 장풍 충전: 두 손이 빛남 (손 뼈에 가산 구체 + 바깥 링). 모델에 손 뼈가 없으면(대체 모델) 몸 앞 한 점
  for (const b of ['LeftHand', 'RightHand']) { const bone = h.ch.root.getObjectByName(b), g = new THREE.Group(); const core = new THREE.Mesh(new THREE.SphereGeometry(.16, 14, 10), ADD(0xfff0c0, .95)), halo = new THREE.Mesh(new THREE.SphereGeometry(.3, 14, 10), ADD(ORANGE, .45));
    g.add(core, halo); g.visible = false; if (bone) { h.ch.root.updateMatrixWorld(true); const ws = bone.getWorldScale(new THREE.Vector3()).x || 1; g.scale.setScalar(1 / ws); bone.add(g); } else { g.position.set(0, 1.3, .6); h.g.add(g); } h.ft.glow.push({ g, core, halo }); }
}
function glow(on, k = 0) { for (const x of hero.ft.glow) { x.g.visible = on; if (!on) continue; const s = .6 + k * 1.2 + Math.sin(G.t * 30) * .08; x.core.scale.setScalar(s); x.halo.scale.setScalar(s * (1.1 + Math.sin(G.t * 12) * .15)); x.halo.material.color.setHex(k >= 1 ? 0xffe8a0 : ORANGE); } }
// 사망·워프·판 종료: 충전/도약 정리
export function ftStop() { const F = hero && hero.ft; if (!F) return; if (F.jp) G.ftN.jpCancel++; F.jp = null; F.leap = null; glow(false); }
// 매 프레임 (legend.js updLegend 에서): 장풍 구체/기파·발자국 이펙트 진행 (이 목록을 안 돌리면 장풍이 날아가지 않고 발자국이 장면에 쌓임)
export function updFtFx(dt) { for (let i = FX.length - 1; i >= 0; i--) if (!FX[i](dt)) FX.splice(i, 1); }

// ---------- 기본 공격: 3연타 ----------
// tgt = 근접 대상(지상, 사거리 안). 없으면 장풍 대상(원거리/비행)을 찾아 충전. 반환값 없음 — hero.js 가 매 프레임 호출
export function fighterTick(dt, tgt, moving) {
  const h = hero, F = h.ft; F.idle += dt; if (F.idle > FT.comboReset) F.n = 0;
  if (F.jp) return charge(dt, tgt, moving);
  if (tgt) { const want = Math.atan2(tgt.g.position.x - h.g.position.x, tgt.g.position.z - h.g.position.z); if (!moving) h.face = want;
    if (h.cd <= 0) swing(tgt, moving); return; }
  if (!moving && h.cd <= 0 && h.atkT <= 0 && !h.path.length) { const t = jpTarget(); if (t) startCharge(t); }
}
function swing(tgt, moving) {
  const h = hero, F = h.ft, n = F.n, kick = isKick(n), mul = comboMul(n); F.n++; F.idle = 0; h.cd = 1 / stat.rate() * (kick ? FT.kickCd : 1);
  const nm = kick ? 'SpinK' : n % 3 === 0 ? 'JabLs' : 'JabRs', spd = h.C.atkSpd * Math.max(1, stat.rate() / h.C.rate); let hitD = .1;
  if (!moving && h.ch.acts[nm]) { play(h.ch, nm, { once: true, force: true, speed: spd }); h.atkT = Math.min(LEN[nm] / spd, kick ? .7 : .45); hitD = HIT[nm] / spd; }
  Snd.whoosh(h.g.position, kick ? .35 : .18, kick ? 400 : 900, kick ? 1800 : 2600, kick ? .35 : .22);
  const t0 = tgt; later(hitD, () => { if (hero.dead > 0) return; if (kick) kickHit(mul); else jabHit(t0, mul, n % 3); if (hero.lsk && !t0.dead) legendProc(t0); });
}
function jabHit(t, mul, side) {
  const h = hero, f = fwd(), R = stat.range() + .4; let n = 0; G.ftN.jab++;
  for (const e of alive()) { if (e.E.fly) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = Math.hypot(dx, dz);
    if (e === t ? d < R + .6 : d < R && (dx * f.x + dz * f.z) / (d || 1) > .55) { hurt(e, stat.dmg() * mul, '#ffcf9a', false, { x: h.g.position.x, z: h.g.position.z, kind: 'melee' }); n++; } }
  const p = h.g.position.clone().addScaledVector(f, 1.3).setY(h.g.position.y + 1.3), sx = side ? .25 : -.25; p.x += f.z * sx; p.z -= f.x * sx;
  emit(P, p.x, p.y, p.z, 10, 0xffe0b0, 4, .22, 0, .2); pawMark(p, .5, .18); Snd.play(n ? 'hit' : 'sword', { pos: p, rate: 1.5 + Math.random() * .2, vol: .7 });
}
function kickHit(mul) {
  const h = hero, c = h.g.position; let n = 0; G.ftN.kick++;
  for (const e of alive()) if (!e.E.fly && d2(e, c.x, c.z) < FT.kickR * FT.kickR) { hurt(e, stat.dmg() * mul, '#ffb07a', true, { x: c.x, z: c.z, kind: 'melee' }); if (!e.dead) knock(e, c.x, c.z, FT.kickKb, .45); n++; }
  G.ftN.kickHits += n; ringFx(c, FT.kickR, ORANGE, .35); ringFx(c, FT.kickR * .6, 0xffffff, .25);
  const arc = new THREE.Mesh(new THREE.RingGeometry(FT.kickR * .45, FT.kickR, 32), ADD(0xffb06a, .6)); arc.rotation.x = -Math.PI / 2; arc.position.set(c.x, c.y + .9, c.z); fade(arc, .25);
  emit(P, c.x, c.y + .8, c.z, 24, 0xffc07a, 7, .3, 0, 1.5); Snd.play('stomp', { pos: c, rate: 1.6, vol: .6 }); if (n) Snd.play('hitArmor', { pos: c, rate: 1.3 });
}
// 작은 고양이 발자국 이펙트 (발바닥 + 발가락 4개, 바닥에 붙지 않고 타격 지점에 잠깐)
function pawMark(p, s, dur, col = ORANGE, flat = false) {
  const g = new THREE.Group(), m = ADD(col, .85); const pad = new THREE.Mesh(new THREE.CircleGeometry(.5, 18), m); pad.scale.set(1.1, .9, 1); pad.position.y = -.2; g.add(pad);
  for (const [x, y] of [[-.52, .38], [-.18, .62], [.18, .62], [.52, .38]]) { const t = new THREE.Mesh(new THREE.CircleGeometry(.2, 12), m); t.position.set(x, y, 0); g.add(t); }
  g.scale.setScalar(s); g.position.copy(p); if (flat) g.rotation.x = -Math.PI / 2; else g.lookAt(p.x + Math.sin(hero.face) * -5, p.y, p.z + Math.cos(hero.face) * -5); scene.add(g); let t = 0;
  FX.push(dt => { t += dt; const k = t / dur; m.opacity = .85 * (1 - k); g.scale.setScalar(s * (1 + k * .6)); if (k < 1) return true; scene.remove(g); m.dispose(); g.traverse(o => o.geometry && o.geometry.dispose()); return false; });
}

// ---------- 장풍 ----------
// 대상: 원거리/비행 적 중 장풍 사거리(10) 안 · 근접 사거리 밖(비행은 근접이 안 닿으므로 가까워도 대상)
function jpTarget() { const h = hero.g.position, mr = stat.range(); let best = null, bd = FT.jpRange * FT.jpRange;
  for (const e of alive()) { if (!isRangedFoe(e.E)) continue; const d = d2(e, h.x, h.z); if (d < bd && (e.E.fly || d > mr * mr)) { bd = d; best = e; } } return best; }
function startCharge(t) { const h = hero; h.ft.jp = { t: 0, tgt: t, lvl: 'none', snd: 0 }; G.ftN.charge++; faceTo(t.g.position); h.path = [];
  play(h.ch, h.ch.acts.ChargeIn ? 'ChargeIn' : 'Idle', { once: true, force: true, speed: 1.2 }); h.atkT = .3; Snd.play('magic', { pos: h.g.position, rate: .5, vol: .5 }); }
function charge(dt, meleeTgt, moving) {
  const h = hero, J = h.ft.jp; J.t += dt; h.atkT = Math.max(h.atkT, .15);
  if (!J.tgt || J.tgt.dead || J.tgt.immT > G.t) J.tgt = jpTarget();
  if (J.tgt) faceTo(J.tgt.g.position);
  if (J.t > .45 && h.ch.cur !== h.ch.acts.ChargeHold && h.ch.acts.ChargeHold) play(h.ch, 'ChargeHold', { speed: 1 });
  const lvl = jpLevel(J.t), k = Math.min(1, J.t / FT.jpFull); glow(true, k);
  if (lvl !== J.lvl) { J.lvl = lvl; if (lvl === 'weak') Snd.play('zap', { pos: h.g.position, rate: 1.4, vol: .4 }); if (lvl === 'full') { Snd.play('magic', { pos: h.g.position, rate: 1.3, force: true }); ringFx(h.g.position, 1.6, GOLD, .35); } }
  if (Math.random() < dt * 30) { const a = Math.random() * 6.28, r = 1.2 - k * .5, p = h.g.position; emit(P, p.x + Math.cos(a) * r, p.y + 1.3 + Math.sin(a) * .5, p.z + Math.sin(a) * r, 1, k >= 1 ? 0xfff0b0 : ORANGE, -2, .25, 0, 0); }
  // 놓기: 완전 충전 · 이동 · 적이 근접 사거리에 들어옴 · 대상 없음
  if (lvl === 'full' || moving || meleeTgt || !J.tgt) { if (lvl === 'none') { ftStop(); return; } release(lvl); }
}
function release(lvl) {
  const h = hero, J = h.ft.jp, mul = jpMul(J.t), tgt = J.tgt, dir = tgt ? new THREE.Vector3(tgt.g.position.x - h.g.position.x, 0, tgt.g.position.z - h.g.position.z).normalize() : fwd();
  h.ft.jp = null; glow(false); h.ft.idle = 0; h.cd = 1 / stat.rate() * 1.4; h.face = Math.atan2(dir.x, dir.z);
  const spd = 1.7; if (h.ch.acts.PalmS) { play(h.ch, 'PalmS', { once: true, force: true, speed: spd }); h.atkT = .5; }
  later(HIT.PalmS / spd, () => { if (hero.dead > 0) return; const from = hero.g.position.clone().addScaledVector(dir, .9).setY(hero.g.position.y + 1.25); if (lvl === 'full') wave(from, dir, mul); else orb(from, tgt, dir, mul); });
}
function orb(from, tgt, dir, mul) {
  G.ftN.jpWeak++; const m = new THREE.Mesh(new THREE.SphereGeometry(.35, 14, 10), ADD(0xffc06a, .9)); m.position.copy(from); scene.add(m); const dmg = stat.dmg() * mul; let t = 0;
  Snd.play('bolt', { pos: from, rate: 1.3 }); Snd.whoosh(from, .3, 800, 2400, .3);
  FX.push(dt => { t += dt; const aim = tgt && !tgt.dead ? tgt.g.position.clone().setY(tgt.E.fly ? tgt.g.position.y + 3 : tgt.g.position.y + 1) : m.position.clone().addScaledVector(dir, 5); const v = aim.clone().sub(m.position), L = v.length(), st = 26 * dt;
    if (L <= st + .3 || t > 1.2) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); if (tgt && !tgt.dead && L <= st + .5) { hurt(tgt, dmg, '#ffd08a', false); G.ftN.jpHits++; emit(P, aim.x, aim.y, aim.z, 14, ORANGE, 4, .3); pawMark(aim, .45, .25); } return false; }
    m.position.addScaledVector(v.normalize(), st); emit(P, m.position.x, m.position.y, m.position.z, 2, ORANGE, .6, .25, 0, 0); return true; });
}
// 완전 충전: 관통 기파 (직선 길이 12 · 폭 1.3, 비행 포함 모든 적 250%) — 구간 판정(느린 프레임에서도 건너뛰지 않음)
function wave(from, dir, mul) {
  G.ftN.jpFull++; const dmg = stat.dmg() * mul, hit = new Set(), g = new THREE.Group(); let dist = 0;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.7, 18, 12), ADD(0xfff0c0, .9)), shell = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 12), ADD(ORANGE, .45)); shell.scale.set(1, 1, 1.5); g.add(ball, shell); g.position.copy(from); g.rotation.y = Math.atan2(dir.x, dir.z); scene.add(g);
  Snd.play('boom', { pos: from, vol: .5, rate: 1.5, force: true }); Snd.play('magic', { pos: from, rate: .7, force: true }); Snd.whoosh(from, .5, 300, 3000, .5); G.shake = Math.max(G.shake || 0, .25); pawMark(from, .9, .35, GOLD);
  FX.push(dt => { const st = 34 * dt, px = g.position.x, pz = g.position.z; g.position.addScaledVector(dir, st); dist += st; g.rotation.z += dt * 8; const p = g.position;
    emit(PB, p.x, p.y, p.z, 2, 0xffc84a, .6, .35, 0, .3); emit(P, p.x, p.y, p.z, 5, 0xffe0a0, 1.6, .4, 0, .4);
    const seg = e => { const ex = e.g.position.x - px, ez = e.g.position.z - pz, t = Math.max(0, Math.min(st, ex * dir.x + ez * dir.z)), qx = ex - dir.x * t, qz = ez - dir.z * t; return qx * qx + qz * qz; };
    for (const e of alive()) if (!hit.has(e) && seg(e) < FT.jpW * FT.jpW) { hit.add(e); G.ftN.jpHits++; hurt(e, dmg, '#ffd86a', true); emit(P, e.g.position.x, 1.4, e.g.position.z, 18, 0xffe08a, 6, .4); }
    if (dist < FT.jpLen) return true; scene.remove(g); g.traverse(o => { if (o.geometry) { o.geometry.dispose(); o.material.dispose(); } }); emit(P, p.x, p.y, p.z, 30, ORANGE, 7, .5); return false; });
}

// ---------- [Q] 냥냥 진각: 도약 → 내려찍기 (반경 4.5 · 400% · 1초 기절) + 땅 갈라짐 ----------
export function fighterSkill(at, mul) {
  const h = hero; if (h.ft.leap) return false; ftStop(); const p = h.g.position, from = p.clone(); let tg = at ? at.clone().setY(0) : from.clone().addScaledVector(fwd(), 4);
  if (tg.distanceTo(from) > FT.qLeap) tg.sub(from).setY(0).setLength(FT.qLeap).add(from);
  let to = tg.clone(); for (let k = 0; k <= 16 && !passAt(to.x, to.z); k++) to = tg.clone().lerp(from, k / 16); if (!passAt(to.x, to.z)) to = from.clone();
  if (to.distanceTo(from) > .3) faceTo(to); h.path = []; h.ft.leap = { kind: 'q', t: 0, dur: FT.qAir, from, to, mul }; G.ftN.q++;
  banner('냥냥 진각!', '#ffb06a', 1000); if (h.ch.acts.SlamS) play(h.ch, 'SlamS', { once: true, force: true, speed: 1.35 }); h.atkT = FT.qAir + .35;
  Snd.whoosh(p, .6, 200, 1600, .5); Snd.play('stomp', { pos: p, rate: 1.4 }); emit(P, p.x, .3, p.z, 24, 0xc8b090, 4, .5, -4, 1.5); return true;
}
// hero.js updHero: 도약/돌진 중이면 true (나머지 갱신 생략)
export function updFtLeap(dt) {
  const L = hero.ft.leap, p = hero.g.position; L.t += dt; const k = Math.min(1, L.t / L.dur);
  p.x = L.from.x + (L.to.x - L.from.x) * k; p.z = L.from.z + (L.to.z - L.from.z) * k; hero.g.rotation.y = hero.face;
  if (L.kind === 'q') { p.y = groundY(p.x, p.z) + Math.sin(k * Math.PI) * 3.2; emit(P, p.x, p.y + 1, p.z, 1, ORANGE, 1, .3, 0, .3); }
  else { p.y = groundY(p.x, p.z); dashHits(L); emit(P, p.x, p.y + 1, p.z, 4, ORANGE, 2, .3, 0, .5); }
  if (k < 1) return; hero.ft.leap = null; p.y = groundY(p.x, p.z); if (L.kind === 'q') slam(p.clone(), L.mul); else { hero.atkT = .3; }
}
function slam(c, mul) {
  const R = FT.qR, dmg = stat.dmg() * FT.qMul * mul; let n = 0; G.shake = Math.max(G.shake || 0, 1.0); hero.atkT = .4;
  for (const e of alive()) if (d2(e, c.x, c.z) <= R * R) { hurt(e, dmg, '#ffb07a', true); n++; if (!e.dead && !e.E.fly) { const st = e.E.boss ? FT.qStunBoss : FT.qStun; e.stunT = Math.max(e.stunT || 0, st); e.kup = { t: 0, dur: st, h: e.E.boss ? .3 : 1.2 }; e.frozen = false; G.ftN.qStun++; } }
  G.ftN.qHits += n;
  for (let i = 0; i < 3; i++) later(i * .09, () => ringFx(c, R + 1 - i, [ORANGE, 0xffe0b0, 0xff6a2a][i], .55));
  const gy = groundY(c.x, c.z);
  // 땅 갈라짐: 어두운 틈 + 빛나는 주황 균열 (방사형 12줄, 꺾인 2마디)
  for (let i = 0; i < 12; i++) { let a = i / 12 * 6.28 + Math.random() * .3, x = c.x, z = c.z;
    for (let s = 0; s < 2; s++) { const len = 1.2 + Math.random() * 1.6, cx = x + Math.sin(a) * len / 2, cz = z + Math.cos(a) * len / 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.16, len), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .95, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); m.rotation.set(-Math.PI / 2, 0, -a); m.position.set(cx, gy + .25, cz); fade(m, 1.8);
      const m2 = new THREE.Mesh(new THREE.PlaneGeometry(.45, len), new THREE.MeshBasicMaterial({ color: 0x1a1008, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide })); m2.rotation.copy(m.rotation); m2.position.set(cx, gy + .24, cz); fade(m2, 2);
      x += Math.sin(a) * len; z += Math.cos(a) * len; a += (Math.random() - .5) * .9; } }
  pawMark(new THREE.Vector3(c.x, gy + .3, c.z), 2.2, .9, GOLD, true); // 큰 고양이 발자국 도장
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ADD(0xffb06a, .5)); dome.position.set(c.x, gy + .1, c.z); scene.add(dome); let t0 = 0;
  FX.push(dt => { t0 += dt; dome.scale.set(1 + t0 * 13, 1 + t0 * 5, 1 + t0 * 13); dome.material.opacity = .5 * (1 - t0 / .4); if (t0 < .4) return true; scene.remove(dome); dome.geometry.dispose(); dome.material.dispose(); return false; });
  emit(PB, c.x, .4, c.z, 30, 0xc8a070, 9, 1, -6, 3); emit(P, c.x, .4, c.z, 110, 0xffb06a, 12, .8, -12, 3); debris(c.x, .3, c.z, 24, [0x7a6a5a, 0x5a4a3a, 0xa08a6a], 8);
  Snd.play('boom', { pos: c, force: true }); Snd.play('breakRock', { pos: c, force: true }); Snd.play('stomp', { pos: c, rate: .8, force: true });
}

// ---------- 전설 무기 ----------
// 냥냥 난타 (proc): 앞쪽 부채꼴 6연타 (각 45%)
export function pawstorm(t, s) { G.ftN.paw++; const h = hero;
  for (let i = 0; i < (s.hits || 6); i++) later(.06 + i * .07, () => { if (hero.dead > 0) return; lsk = true; try { const f = fwd(), R = stat.range() + 1, c = hero.g.position;
    for (const e of alive()) { if (e.E.fly) continue; const dx = e.g.position.x - c.x, dz = e.g.position.z - c.z, d = Math.hypot(dx, dz); if (d < R && (d < .8 || (dx * f.x + dz * f.z) / d > .4)) hurt(e, stat.dmg() * s.mul, '#ffc0e0', false, { x: c.x, z: c.z, kind: 'melee' }); }
    const p = c.clone().addScaledVector(f, 1.4 + Math.random() * .6).setY(c.y + .9 + Math.random() * .9); p.x += (Math.random() - .5) * 1.2; pawMark(p, .55, .2, i % 2 ? 0xffb0d0 : ORANGE); Snd.play('hit', { pos: p, rate: 1.7 + i * .05, vol: .5 }); } finally { lsk = false; } });
  if (h.ch.acts.PunchCombo) { play(h.ch, 'PunchCombo', { once: true, force: true, speed: 2.2 }); h.atkT = .55; } }
// 맹호 돌진 (active): 목표 방향 최대 9 돌진, 지나가는 모든 적 300% + 밀쳐내기
export function tigerdash(s, tg) { const h = hero, from = h.g.position.clone(); let to = tg.clone().setY(0); if (to.distanceTo(from) > 9) to.sub(from).setY(0).setLength(9).add(from);
  const n = 18; let ok = from.clone(); for (let k = 1; k <= n; k++) { const q = from.clone().lerp(to, k / n); if (!passAt(q.x, q.z)) break; ok = q; } to = ok; ftStop();
  if (to.distanceTo(from) > .3) faceTo(to); h.path = []; h.ft.leap = { kind: 'dash', t: 0, dur: .32, from, to, s, hit: new Set() }; G.ftN.dash++;
  banner('맹호 돌진!', '#ffb06a', 900); if (h.ch.acts.SpinK) play(h.ch, 'SpinK', { once: true, force: true, speed: 1.8 }); Snd.whoosh(from, .4, 300, 2600, .55); Snd.play('stomp', { pos: from, rate: 1.5 }); }
function dashHits(L) { const c = hero.g.position, dmg = stat.dmg() * L.s.mul; lsk = true;
  try { for (const e of alive()) if (!L.hit.has(e) && d2(e, c.x, c.z) < 2.2 * 2.2) { L.hit.add(e); hurt(e, dmg, '#ffb07a', true, { x: c.x, z: c.z, kind: 'melee' }); if (!e.dead) knock(e, c.x, c.z, 1.6, .6); emit(P, e.g.position.x, 1.3, e.g.position.z, 12, ORANGE, 5, .3); } } finally { lsk = false; } }

// ---------- 고유 무기 [E] 묘신 냥발 장풍 (data/items.js UQ.d_fist · LSK.catpaw) ----------
// 거대한 고양이 발 기파: 직선 len(14) · 폭 w(2.4) 관통 — 비행 포함 모든 적 360% + 밀쳐내기 + vulnT초 받는 피해 +vuln (enemy.js vulnT/vulnAmt)
// ★3: 끝에서 냥발 도장 폭발 (반경 boomR · boomMul · 기절 1초, 보스 0.3초). 각성 위력 = awakeMul(hero.uqA)
export function catpaw(s, tg) { const h = hero; ftStop(); const p = h.g.position; let dir = new THREE.Vector3(tg.x - p.x, 0, tg.z - p.z); if (dir.lengthSq() < .01) dir = fwd(); dir.normalize();
  h.face = Math.atan2(dir.x, dir.z); h.path = []; h.ft.idle = 0; G.ftN.catpaw = (G.ftN.catpaw || 0) + 1; banner('묘신 냥발 장풍!', '#ffd27a', 1000);
  const spd = 1.5; if (h.ch.acts.PalmS) play(h.ch, 'PalmS', { once: true, force: true, speed: spd }); h.atkT = HIT.PalmS / spd + .25; glow(true, 1);
  Snd.play('magic', { pos: p, rate: 1.2, force: true }); emit(P, p.x, 1.2, p.z, 30, GOLD, 3, .4, 0, 1.2); ringFx(p, 1.8, GOLD, .35);
  later(HIT.PalmS / spd, () => { glow(false); if (!hero || hero.dead > 0) return; const from = hero.g.position.clone().addScaledVector(dir, 1).setY(hero.g.position.y + 1.2); pawWave(from, dir, s); }); }
function pawPaw(col) { const g = new THREE.Group(), pad = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), ADD(col, .85)); pad.scale.set(1.15, .9, .45); g.add(pad);
  for (let i = 0; i < 4; i++) { const a = (i - 1.5) * .55, b = new THREE.Mesh(new THREE.SphereGeometry(.42, 14, 10), ADD(0xfff0d0, .9)); b.position.set(Math.sin(a) * 1.35, Math.cos(a) * 1.25 + .1, .05); b.scale.set(1, 1.15, .5); g.add(b); }
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.9, 18, 12), ADD(ORANGE, .3)); halo.scale.set(1, .9, .5); g.add(halo); return g; }
function pawWave(from, dir, s) {
  const A = awakeMul(hero.uqA), a3 = (hero.uqA || 0) >= 3, dmg = stat.dmg() * s.mul * A * stat.skillMul(), hit = new Set(), g = pawPaw(GOLD); let dist = 0;
  g.position.copy(from); g.rotation.y = Math.atan2(dir.x, dir.z); g.scale.setScalar(.5); scene.add(g);
  Snd.play('boom', { pos: from, vol: .7, rate: 1.2, force: true }); Snd.whoosh(from, .6, 250, 3200, .6); G.shake = Math.max(G.shake || 0, .45); pawMark(from, 1.3, .4, GOLD);
  FX.push(dt => { const st = 30 * dt, px = g.position.x, pz = g.position.z; g.position.addScaledVector(dir, st); dist += st; g.scale.setScalar(Math.min(1.25, .5 + dist * .12)); const p = g.position;
    emit(PB, p.x, p.y, p.z, 3, 0xffc84a, 1, .4, 0, .8); emit(P, p.x, p.y, p.z, 6, 0xffe0a0, 2, .45, 0, 1);
    const seg = e => { const ex = e.g.position.x - px, ez = e.g.position.z - pz, t = Math.max(0, Math.min(st, ex * dir.x + ez * dir.z)), qx = ex - dir.x * t, qz = ez - dir.z * t; return qx * qx + qz * qz; };
    lsk = true; try { for (const e of alive()) if (!hit.has(e) && seg(e) < s.w * s.w) { hit.add(e); G.ftN.catpawHits = (G.ftN.catpawHits || 0) + 1; hurt(e, dmg, '#ffe08a', true);
      if (!e.dead) { e.vulnT = G.t + s.vulnT; e.vulnAmt = Math.max(e.vulnAmt || 0, s.vuln); knock(e, e.g.position.x - dir.x, e.g.position.z - dir.z, 1.8, .5); } emit(P, e.g.position.x, 1.4, e.g.position.z, 20, GOLD, 6, .45); } } finally { lsk = false; }
    if (dist < s.len) return true; scene.remove(g); g.traverse(o => { if (o.geometry) { o.geometry.dispose(); o.material.dispose(); } });
    emit(P, p.x, p.y, p.z, 40, ORANGE, 8, .5); if (a3) pawBoom(new THREE.Vector3(p.x, 0, p.z), s, A); return false; });
}
function pawBoom(c, s, A) { const R = s.boomR, gy = groundY(c.x, c.z), dmg = stat.dmg() * s.boomMul * A * stat.skillMul(); G.ftN.catpawBoom = (G.ftN.catpawBoom || 0) + 1; G.shake = Math.max(G.shake || 0, .7);
  lsk = true; try { for (const e of alive()) if (d2(e, c.x, c.z) <= R * R) { hurt(e, dmg, '#ffd27a', true); if (!e.dead) { const st = e.E.boss ? .3 : 1; e.stunT = Math.max(e.stunT || 0, st); e.frozen = false; } } } finally { lsk = false; }
  pawMark(new THREE.Vector3(c.x, gy + .3, c.z), R * .8, .9, GOLD, true); ringFx(c, R + .5, GOLD, .5); ringFx(c, R * .6, 0xfff0d0, .4);
  emit(PB, c.x, .5, c.z, 24, 0xffb84a, 8, .8, -4, 2.5); emit(P, c.x, .5, c.z, 90, 0xffe0a0, 11, .8, -10, 2.5); Snd.play('boom', { pos: c, force: true }); Snd.play('stomp', { pos: c, rate: .9, force: true }); }
