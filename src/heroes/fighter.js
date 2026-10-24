// ================= 격투가 진서윤: 3연타(주먹·주먹·회전 돌려차기 · 넉백 없음) · 장풍 충전(0.4초 약 / 1.2초 관통) · [Q] 냥냥 진각 · 전설(냥냥 난타 / 맹호 돌진) =================
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
import { FT, comboMul, isKick, jpLevel, jpMul, ftOpt, comboHeal, TQ, DW, steer, jpWants, ftSkillId } from '../data/fighter.js';
import { Q } from '../render/quality.js';
import { toon } from '../render/toon.js';
import { awakeMul } from '../data/items.js';

const FX = heroFx();
G.ftN = { jab: 0, kick: 0, kickHits: 0, jpWeak: 0, jpFull: 0, jpHits: 0, jpCancel: 0, charge: 0, q: 0, qHits: 0, qStun: 0, paw: 0, dash: 0, fin: 0, leech: 0, jpSlow: 0, tf: 0, tfHits: 0, tfFin: 0, dw: 0, dwHits: 0, dwStun: 0 }; // 테스트용 카운터 (fin~dw* = 전직)
const dealt = (e, d, ...a) => { const h0 = Math.max(0, e.hp); hurt(e, d, ...a); return h0 - Math.max(0, e.hp); }; // 실제로 깎은 체력 (백호권성 콤보 회복)
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
  h.ft = { n: 0, idle: 9, jp: null, leap: null, glow: [], o: ftOpt(h.adv), fin: false, dealt: 0 }; // o = 전직 수치(없으면 FT 그대로) · fin = 백호권성 피니시 대기 · dealt = 이번 콤보 피해 합
  // 장풍 충전: 두 손이 빛남 (손 뼈에 가산 구체 + 바깥 링). 모델에 손 뼈가 없으면(대체 모델) 몸 앞 한 점
  for (const b of ['LeftHand', 'RightHand']) { const bone = h.ch.root.getObjectByName(b), g = new THREE.Group(); const core = new THREE.Mesh(new THREE.SphereGeometry(.16, 14, 10), ADD(0xfff0c0, .95)), halo = new THREE.Mesh(new THREE.SphereGeometry(.3, 14, 10), ADD(ORANGE, .45));
    g.add(core, halo); g.visible = false; if (bone) { h.ch.root.updateMatrixWorld(true); const ws = bone.getWorldScale(new THREE.Vector3()).x || 1; g.scale.setScalar(1 / ws); bone.add(g); } else { g.position.set(0, 1.3, .6); h.g.add(g); } h.ft.glow.push({ g, core, halo }); }
}
function glow(on, k = 0) { for (const x of hero.ft.glow) { x.g.visible = on; if (!on) continue; const s = .6 + k * 1.2 + Math.sin(G.t * 30) * .08; x.core.scale.setScalar(s); x.halo.scale.setScalar(s * (1.1 + Math.sin(G.t * 12) * .15)); x.halo.material.color.setHex(k >= 1 ? 0xffe8a0 : jc()); } }
const jc = () => (hero.ft && hero.ft.o.slow ? hero.adv.col : ORANGE); // 장풍 색: 천기권사 = 청록
// 천기권사: 장풍 맞은 적 둔화 (기존 둔화와 같은 규칙: 지속은 긴 쪽, 진행 중이면 강한 쪽 · 끝난 둔화의 옛 세기는 이어받지 않음)
function jpSlow(e) { const o = hero.ft.o; if (!o.slow || e.dead) return; e.slowAmt = e.slowT > 0 ? Math.max(e.slowAmt || 0, o.slow) : o.slow; e.slowT = Math.max(e.slowT || 0, o.slowT); G.ftN.jpSlow++; }
// 사망·워프·판 종료: 충전/도약 정리
export function ftStop() { const F = hero && hero.ft; if (!F) return; if (F.jp) G.ftN.jpCancel++; F.jp = null; F.leap = null; glow(false); }
// 매 프레임 (legend.js updLegend 에서): 장풍 구체/기파·발자국 이펙트 진행 (이 목록을 안 돌리면 장풍이 날아가지 않고 발자국이 장면에 쌓임)
export function updFtFx(dt) { for (let i = FX.length - 1; i >= 0; i--) if (!FX[i](dt)) FX.splice(i, 1); }

// ---------- 기본 공격: 3연타 ----------
// tgt = 근접 대상(지상, 사거리 안). 없으면 장풍 대상(원거리/비행)을 찾아 충전. 반환값 없음 — hero.js 가 매 프레임 호출
export function fighterTick(dt, tgt, moving) {
  const h = hero, F = h.ft; F.idle += dt; if (F.idle > FT.comboReset) { F.n = 0; F.dealt = 0; F.fin = false; } // 콤보가 끊기면 백호권성 피니시 대기·피해 합도 초기화
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
  const h = hero, F = h.ft, f = fwd(), R = stat.range() + .4, fk = F.fin ? 1 + F.o.fin : 1; let n = 0; G.ftN.jab++;
  for (const e of alive()) { if (e.E.fly) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = Math.hypot(dx, dz);
    if (e === t ? d < R + .6 : d < R && (dx * f.x + dz * f.z) / (d || 1) > .55) { F.dealt += dealt(e, stat.dmg() * mul * fk, F.fin ? '#ff8a5a' : '#ffcf9a', F.fin, { x: h.g.position.x, z: h.g.position.z, kind: 'melee' }); n++; } }
  if (n && F.fin) finUsed(); // 백호권성: 맞혔을 때만 피니시 소비 (빗나가면 유지)
  const p = h.g.position.clone().addScaledVector(f, 1.3).setY(h.g.position.y + 1.3), sx = side ? .25 : -.25; p.x += f.z * sx; p.z -= f.x * sx;
  emit(P, p.x, p.y, p.z, 10, 0xffe0b0, 4, .22, 0, .2); pawMark(p, .5, .18); Snd.play(n ? 'hit' : 'sword', { pos: p, rate: 1.5 + Math.random() * .2, vol: .7 });
}
function kickHit(mul) {
  const h = hero, F = h.ft, c = h.g.position, fk = F.fin ? 1 + F.o.fin : 1; let n = 0; G.ftN.kick++;
  for (const e of alive()) if (!e.E.fly && d2(e, c.x, c.z) < FT.kickR * FT.kickR) { F.dealt += dealt(e, stat.dmg() * mul * fk, F.fin ? '#ff8a5a' : '#ffb07a', true, { x: c.x, z: c.z, kind: 'melee' }); n++; } // 2026-10-24 패치: 넉백 없음 (FT.kickKb = 0)
  G.ftN.kickHits += n; if (n && F.fin) finUsed(); if (n) comboDone(c); ringFx(c, FT.kickR, ORANGE, .35); ringFx(c, FT.kickR * .6, 0xffffff, .25);
  const arc = new THREE.Mesh(new THREE.RingGeometry(FT.kickR * .45, FT.kickR, 32), ADD(0xffb06a, .6)); arc.rotation.x = -Math.PI / 2; arc.position.set(c.x, c.y + .9, c.z); fade(arc, .25);
  emit(P, c.x, c.y + .8, c.z, 24, 0xffc07a, 7, .3, 0, 1.5); Snd.play('stomp', { pos: c, rate: 1.6, vol: .6 }); if (n) Snd.play('hitArmor', { pos: c, rate: 1.3 });
}
// 백호권성: 3연타(돌려차기)가 맞으면 콤보 완성 → 다음 유효 근접 타격 +35% 대기 + 콤보 피해 2% 회복(상한 최대 체력 2%). 전직 없으면 o.fin = o.leech = 0 → 아무 일 없음
function comboDone(c) { const h = hero, F = h.ft, o = F.o; if (o.fin > 0) { F.fin = true; ringFx(c, 1.3, h.adv.col, .25); }
  const v = comboHeal(F.dealt, h.max, o); F.dealt = 0; if (v > 0 && h.dead <= 0) { h.hp = Math.min(h.max, h.hp + v); G.advHeal = (G.advHeal || 0) + v; G.ftN.leech++; emit(P, c.x, 1.4, c.z, 6, 0xff5a3a, 2, .4, 2, .4); } }
function finUsed() { const h = hero, p = h.g.position; h.ft.fin = false; G.ftN.fin++; const q = p.clone().addScaledVector(fwd(), 1.3).setY(p.y + 1.2); clawFx(q, h.adv ? h.adv.col : ORANGE, 1); Snd.play('hitArmor', { pos: q, rate: .9, vol: .6 }); }
// 발톱 자국 3줄 (백호권성 피니시)
function clawFx(p, col, s = 1) { const g = new THREE.Group(), m = ADD(col, .95); for (let i = -1; i <= 1; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(.12, 1.5), m); b.position.x = i * .32; b.rotation.z = .5; g.add(b); }
  g.position.copy(p); g.scale.setScalar(s); g.lookAt(p.x - Math.sin(hero.face) * 5, p.y, p.z - Math.cos(hero.face) * 5); scene.add(g); let t = 0;
  FX.push(dt => { t += dt; const k = t / .22; m.opacity = .95 * (1 - k); g.scale.setScalar(s * (1 + k * .4)); if (k < 1) return true; scene.remove(g); m.dispose(); g.traverse(o => o.geometry && o.geometry.dispose()); return false; }); }
// 작은 고양이 발자국 이펙트 (발바닥 + 발가락 4개, 바닥에 붙지 않고 타격 지점에 잠깐)
function pawMark(p, s, dur, col = ORANGE, flat = false) {
  const g = new THREE.Group(), m = ADD(col, .85); const pad = new THREE.Mesh(new THREE.CircleGeometry(.5, 18), m); pad.scale.set(1.1, .9, 1); pad.position.y = -.2; g.add(pad);
  for (const [x, y] of [[-.52, .38], [-.18, .62], [.18, .62], [.52, .38]]) { const t = new THREE.Mesh(new THREE.CircleGeometry(.2, 12), m); t.position.set(x, y, 0); g.add(t); }
  g.scale.setScalar(s); g.position.copy(p); if (flat) g.rotation.x = -Math.PI / 2; else g.lookAt(p.x + Math.sin(hero.face) * -5, p.y, p.z + Math.cos(hero.face) * -5); scene.add(g); let t = 0;
  FX.push(dt => { t += dt; const k = t / dur; m.opacity = .85 * (1 - k); g.scale.setScalar(s * (1 + k * .6)); if (k < 1) return true; scene.remove(g); m.dispose(); g.traverse(o => o.geometry && o.geometry.dispose()); return false; });
}

// ---------- 장풍 ----------
// 대상 (2026-10-24 패치): 공격 사거리(기본 2.6) 밖 ~ 장풍 사거리 10 의 가장 가까운 적 — 종류 무관 (비행은 근접이 안 닿으므로 가까워도 대상). 사거리 안 지상 적은 주먹·발차기
function jpTarget() { const h = hero.g.position, mr = stat.range(); let best = null, bd = Infinity;
  for (const e of alive()) { const d = Math.sqrt(d2(e, h.x, h.z)); if (d < bd && jpWants(d, mr, !!e.E.fly)) { bd = d; best = e; } } return best; }
function startCharge(t) { const h = hero; h.ft.jp = { t: 0, tgt: t, lvl: 'none', snd: 0 }; G.ftN.charge++; faceTo(t.g.position); h.path = [];
  play(h.ch, h.ch.acts.ChargeIn ? 'ChargeIn' : 'Idle', { once: true, force: true, speed: 1.2 }); h.atkT = .3; Snd.play('magic', { pos: h.g.position, rate: .5, vol: .5 }); }
function charge(dt, meleeTgt, moving) {
  const h = hero, J = h.ft.jp; J.t += dt; h.atkT = Math.max(h.atkT, .15);
  if (!J.tgt || J.tgt.dead || J.tgt.immT > G.t) J.tgt = jpTarget();
  if (J.tgt) faceTo(J.tgt.g.position);
  if (J.t > .45 && h.ch.cur !== h.ch.acts.ChargeHold && h.ch.acts.ChargeHold) play(h.ch, 'ChargeHold', { speed: 1 });
  const o = h.ft.o, lvl = jpLevel(J.t, o), k = Math.min(1, J.t / o.jpFull); glow(true, k); // o = 전직 수치 (천기권사: 완전 충전 0.8초)
  if (lvl !== J.lvl) { J.lvl = lvl; if (lvl === 'weak') Snd.play('zap', { pos: h.g.position, rate: 1.4, vol: .4 }); if (lvl === 'full') { Snd.play('magic', { pos: h.g.position, rate: 1.3, force: true }); ringFx(h.g.position, 1.6, GOLD, .35); } }
  if (Math.random() < dt * 30) { const a = Math.random() * 6.28, r = 1.2 - k * .5, p = h.g.position; emit(P, p.x + Math.cos(a) * r, p.y + 1.3 + Math.sin(a) * .5, p.z + Math.sin(a) * r, 1, k >= 1 ? 0xfff0b0 : ORANGE, -2, .25, 0, 0); }
  // 놓기: 완전 충전 · 이동 · 적이 근접 사거리에 들어옴 · 대상 없음
  if (lvl === 'full' || moving || meleeTgt || !J.tgt) { if (lvl === 'none') { ftStop(); return; } release(lvl); }
}
function release(lvl) {
  const h = hero, J = h.ft.jp, mul = jpMul(J.t, h.ft.o), tgt = J.tgt, dir = tgt ? new THREE.Vector3(tgt.g.position.x - h.g.position.x, 0, tgt.g.position.z - h.g.position.z).normalize() : fwd();
  h.ft.jp = null; glow(false); h.ft.idle = 0; h.cd = 1 / stat.rate() * 1.4; h.face = Math.atan2(dir.x, dir.z);
  const spd = 1.7; if (h.ch.acts.PalmS) { play(h.ch, 'PalmS', { once: true, force: true, speed: spd }); h.atkT = .5; }
  later(HIT.PalmS / spd, () => { if (hero.dead > 0) return; const from = hero.g.position.clone().addScaledVector(dir, .9).setY(hero.g.position.y + 1.25); if (lvl === 'full') wave(from, dir, mul); else orb(from, tgt, dir, mul); });
}
function orb(from, tgt, dir, mul) {
  G.ftN.jpWeak++; const m = new THREE.Mesh(new THREE.SphereGeometry(.35, 14, 10), ADD(hero.ft.o.slow ? 0x9af0ff : 0xffc06a, .9)); m.position.copy(from); scene.add(m); const dmg = stat.dmg() * mul; let t = 0;
  Snd.play('bolt', { pos: from, rate: 1.3 }); Snd.whoosh(from, .3, 800, 2400, .3);
  FX.push(dt => { t += dt; const aim = tgt && !tgt.dead ? tgt.g.position.clone().setY(tgt.E.fly ? tgt.g.position.y + 3 : tgt.g.position.y + 1) : m.position.clone().addScaledVector(dir, 5); const v = aim.clone().sub(m.position), L = v.length(), st = 26 * dt;
    if (L <= st + .3 || t > 1.2) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); if (tgt && !tgt.dead && L <= st + .5) { hurt(tgt, dmg, '#ffd08a', false); G.ftN.jpHits++; jpSlow(tgt); emit(P, aim.x, aim.y, aim.z, 14, ORANGE, 4, .3); pawMark(aim, .45, .25); } return false; }
    m.position.addScaledVector(v.normalize(), st); emit(P, m.position.x, m.position.y, m.position.z, 2, ORANGE, .6, .25, 0, 0); return true; });
}
// 완전 충전: 관통 기파 (직선 길이 12 · 폭 1.3, 비행 포함 모든 적 250%) — 구간 판정(느린 프레임에서도 건너뛰지 않음)
function wave(from, dir, mul) {
  G.ftN.jpFull++; const o = hero.ft.o, W = o.jpW / FT.jpW, dmg = stat.dmg() * mul, hit = new Set(), g = new THREE.Group(); let dist = 0; // W = 판정 폭 배수 (천기권사 1.2 → 겉모양도 같은 비율)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.7, 18, 12), ADD(0xfff0c0, .9)), shell = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 12), ADD(jc(), .45)); shell.scale.set(W, W, 1.5); ball.scale.setScalar(W); g.add(ball, shell); g.position.copy(from); g.rotation.y = Math.atan2(dir.x, dir.z); scene.add(g);
  Snd.play('boom', { pos: from, vol: .5, rate: 1.5, force: true }); Snd.play('magic', { pos: from, rate: .7, force: true }); Snd.whoosh(from, .5, 300, 3000, .5); G.shake = Math.max(G.shake || 0, .25); pawMark(from, .9, .35, GOLD);
  FX.push(dt => { const st = 34 * dt, px = g.position.x, pz = g.position.z; g.position.addScaledVector(dir, st); dist += st; g.rotation.z += dt * 8; const p = g.position;
    emit(PB, p.x, p.y, p.z, 2, 0xffc84a, .6, .35, 0, .3); emit(P, p.x, p.y, p.z, 5, 0xffe0a0, 1.6, .4, 0, .4);
    const seg = e => { const ex = e.g.position.x - px, ez = e.g.position.z - pz, t = Math.max(0, Math.min(st, ex * dir.x + ez * dir.z)), qx = ex - dir.x * t, qz = ez - dir.z * t; return qx * qx + qz * qz; };
    for (const e of alive()) if (!hit.has(e) && seg(e) < o.jpW * o.jpW) { hit.add(e); G.ftN.jpHits++; hurt(e, dmg, '#ffd86a', true); jpSlow(e); emit(P, e.g.position.x, 1.4, e.g.position.z, 18, 0xffe08a, 6, .4); }
    if (dist < o.jpLen) return true; scene.remove(g); g.traverse(o => { if (o.geometry) { o.geometry.dispose(); o.material.dispose(); } }); emit(P, p.x, p.y, p.z, 30, ORANGE, 7, .5); return false; });
}

// ---------- [Q] 냥냥 진각: 도약 → 내려찍기 (반경 4.5 · 400% · 1초 기절) + 땅 갈라짐 ----------
export function fighterSkill(at, mul) {
  const h = hero; if (h.ft.leap) return false; const k = ftSkillId(h.adv && h.adv.skill); if (k === 'tigerquake') return tigerQuake(at, mul); if (k === 'dragonwave') return dragonWave(at, mul); // 전직 Q (옛 id tigerfury → tigerquake 별칭)
  ftStop(); const p = h.g.position, from = p.clone(); let tg = at ? at.clone().setY(0) : from.clone().addScaledVector(fwd(), 4);
  if (tg.distanceTo(from) > FT.qLeap) tg.sub(from).setY(0).setLength(FT.qLeap).add(from);
  let to = tg.clone(); for (let k = 0; k <= 16 && !passAt(to.x, to.z); k++) to = tg.clone().lerp(from, k / 16); if (!passAt(to.x, to.z)) to = from.clone();
  if (to.distanceTo(from) > .3) faceTo(to); h.path = []; h.ft.leap = { kind: 'q', t: 0, dur: FT.qAir, from, to, mul }; G.ftN.q++;
  banner('냥냥 진각!', '#ffb06a', 1000); if (h.ch.acts.SlamS) play(h.ch, 'SlamS', { once: true, force: true, speed: 1.35 }); h.atkT = FT.qAir + .35;
  Snd.whoosh(p, .6, 200, 1600, .5); Snd.play('stomp', { pos: p, rate: 1.4 }); emit(P, p.x, .3, p.z, 24, 0xc8b090, 4, .5, -4, 1.5); return true;
}
// hero.js updHero: 도약/돌진 중이면 true (나머지 갱신 생략)
export function updFtLeap(dt) {
  const L = hero.ft.leap, p = hero.g.position; L.t += dt; if (L.kind === 'quake') return quakeTick(L, p); const k = Math.min(1, L.t / L.dur);
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

// ---------- 전직 Q ① 🐯 백호진천권 (백호권성, 2026-10-24 — 백호난무 대체) ----------
// 제자리(도약·이동 없음): 0 ~ windT 기 모으기(주먹을 머리 위로 · 백호 기운이 모임) → windT 땅 내려치기: 반경 R 지상 적 500% + 0.8초 기절(보스 제외)
// → 화면 흔들림 · 히트스톱(G.slowT 짧은 슬로 모션 = 게임 시간 전체가 같이 느려짐 → 로직 안전) · 빛나는 땅 균열 · 충격파 고리(waveR 까지 퍼지며 지상 적마다 1회 200%) · 바위 파편/솟는 바위/흙먼지 · 포효하는 백호 기운
// 넉백 없음 · 시전 중 받는 피해 -30% (ftGuard). hero.ft.leap(kind 'quake') 로 진행 → 사망·워프·판 종료 때 ftStop 이 정리 (이미 생긴 이펙트는 FX 목록이 수명대로 정리·dispose)
// 메시: 공유 지오메트리(QG, 한 번 만들고 재사용 — dispose 안 함) + 시전마다 재질 몇 개(끝나면 dispose). G.ftN.tqLive = 장면에 남은 진천권 이펙트 수 (테스트: 끝나면 0)
const ground = () => alive().filter(e => !e.E.fly);
let QG = null, ROCKM = null;
const qgeo = () => QG || (QG = { plane: new THREE.PlaneGeometry(1, 1).translate(0, .5, 0), ring: new THREE.RingGeometry(.84, 1, 72), ring2: new THREE.RingGeometry(.55, 1, 72), wall: new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, .5, 0),
  disc: new THREE.CircleGeometry(1, 48), sph: new THREE.SphereGeometry(1, 20, 14), spike: new THREE.ConeGeometry(.42, 1.9, 5).translate(0, .95, 0), pillar: new THREE.CylinderGeometry(1, 1.4, 1, 32, 1, true).translate(0, .5, 0) });
const qAdd = o => { scene.add(o); G.ftN.tqLive = (G.ftN.tqLive || 0) + 1; G.ftN.tqFx = (G.ftN.tqFx || 0) + 1; return o; };
const qRm = (o, ...mats) => { scene.remove(o); G.ftN.tqLive--; for (const m of mats) if (m) { m.map = null; m.dispose(); } };
const NORM = (c, o = .9) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
function tigerQuake(at, mul) { const h = hero, c = h.g.position.clone(); ftStop();
  if (at && (at.x - c.x) ** 2 + (at.z - c.z) ** 2 > .25) faceTo(at); else { const t = furyPick(c.x, c.z, 8); if (t) faceTo(t.g.position); } h.g.rotation.y = h.face; // 바라보는 방향만 (제자리)
  h.path = []; h.ft.idle = 0; h.ft.leap = { kind: 'quake', t: 0, dur: TQ.dur, c, mul, hit: false }; G.ftN.q++; G.ftN.tq = (G.ftN.tq || 0) + 1;
  banner('백호진천권!', h.adv.c, 1100);
  // 모션: GroundSlam 하위 클립 QuakeS (주먹을 머리 위로 → 땅에 내리꽂음 · 타격 = 클립 1.15초) — windT 에 맞춰 속도. 대체 모델은 SlamS/PalmS
  const nm = h.ch.acts.QuakeS ? 'QuakeS' : h.ch.acts.PalmS ? 'PalmS' : null, hitAt = nm === 'QuakeS' ? 1.15 : HIT.PalmS; h.ft.leap.act = nm ? play(h.ch, nm, { once: true, force: true, speed: hitAt / TQ.windT }) : null; h.atkT = TQ.dur + .1;
  glow(true, 1); for (const x of h.ft.glow) x.halo.material.color.setHex(0xfff4e0);
  Snd.play('magic', { pos: c, rate: .55, vol: .8, force: true }); Snd.whoosh(c, TQ.windT, 180, 1400, .45);
  const gy = groundY(c.x, c.z); qPillar(c, gy); ringFx(c, 3.2, h.adv.col, TQ.windT); ringFx(c, 2, 0xffffff, TQ.windT * .8); return true; }
function furyPick(x, z, r) { let b = null, bd = r * r; for (const e of ground()) { const d = d2(e, x, z); if (d < bd) { bd = d; b = e; } } return b; }
function quakeTick(L, p) { const h = hero; p.x = L.c.x; p.z = L.c.z; p.y = groundY(p.x, p.z); h.g.rotation.y = h.face; // 제자리 고정 (점프 없음)
  if (!L.hit) { const k = Math.min(1, L.t / TQ.windT); glow(true, .4 + k); // 기 모으기: 주변에서 빛 알갱이가 빨려 들어옴
    if (Math.random() < (Q.perf ? .5 : 1)) { const a = Math.random() * 6.28, r = 3.2 - k * 1.8; emit(P, p.x + Math.cos(a) * r, p.y + .3 + Math.random() * 2.2, p.z + Math.sin(a) * r, 1, k > .7 ? 0xffffff : h.adv.col, -3.5, .22, 0, 0); }
    if (L.t >= TQ.windT) { L.hit = true; glow(false); quakeImpact(L); } }
  if (L.t >= L.dur) { h.ft.leap = null; h.atkT = .12; h.ft.idle = 0; } }
function quakeImpact(L) { const h = hero, c = L.c, gy = groundY(c.x, c.z), R = TQ.R, dmg = stat.dmg() * TQ.mul * L.mul, col = h.adv.col; let n = 0; G.ftN.tqImpact = (G.ftN.tqImpact || 0) + 1;
  const f = fwd(), fist = new THREE.Vector3(c.x + f.x * .9, gy + .15, c.z + f.z * .9);
  for (const e of ground()) if (d2(e, c.x, c.z) <= R * R) { hurt(e, dmg, '#ffe6b0', true, { x: c.x, z: c.z, kind: 'melee' }); n++; if (!e.dead && !e.E.boss) { e.stunT = Math.max(e.stunT || 0, TQ.stun); e.frozen = false; G.ftN.tqStun = (G.ftN.tqStun || 0) + 1; } } // 넉백 없음
  G.ftN.tqHits = (G.ftN.tqHits || 0) + n;
  // 화면 흔들림 + 히트스톱 (이미 다른 슬로 모션 중이면 건드리지 않음)
  G.shake = Math.max(G.shake || 0, 1.4); if (!(G.slowT > 0)) { G.slowF = .12; G.slowT = TQ.hitStop * .12; G.ftN.tqStop = (G.ftN.tqStop || 0) + 1; }
  if (L.act) L.act.timeScale = 1.5; // 내리꽂은 자세를 잠깐 유지하듯 남은 동작은 천천히
  Snd.play('boom', { pos: c, force: true }); Snd.play('breakRock', { pos: c, force: true, rate: .8 }); Snd.play('stomp', { pos: c, rate: .6, force: true }); Snd.play('hitArmor', { pos: c, rate: .7, force: true }); if (Snd.roar) later(.05, () => Snd.roar(c));
  qFlash(fist); qGlow(c, gy, R); qCracks(c, gy); qShock(c, gy, L.mul); qSpikes(c, gy); qDust(c, gy); tigerSpirit(c, gy);
  debris(c.x, gy + .3, c.z, Q.perf ? 16 : 34, [0x7a6a5a, 0x5a4a3a, 0xa08a6a, 0x8a7a62], 11);
  emit(PB, fist.x, gy + .4, fist.z, Q.perf ? 14 : 30, 0xffd27a, 10, .7, -10, 2); emit(P, c.x, gy + .4, c.z, Q.perf ? 50 : 120, 0xffe6c0, 13, .7, -14, 3.5); emit(P, c.x, gy + .4, c.z, Q.perf ? 20 : 50, col, 9, .6, -8, 2.5);
  pawMark(new THREE.Vector3(c.x, gy + .32, c.z), 1.6, .8, 0xfff0d0, true); }
// 기 모으기 빛기둥 (windT 동안 커지다 내려칠 때 사라짐)
function qPillar(c, gy) { const m = NORM(0xfff6e0, 0); m.blending = THREE.AdditiveBlending; const o = qAdd(new THREE.Mesh(qgeo().pillar, m)); o.position.set(c.x, gy, c.z); o.scale.set(.4, 7, .4); let t = 0;
  FX.push(dt => { t += dt; const k = t / TQ.windT; if (k < 1) { m.opacity = .35 * k; o.scale.set(1.3 - k * .8, 7 + k * 2, 1.3 - k * .8); o.rotation.y += dt * 3; return true; }
    const k2 = (t - TQ.windT) / .25; m.opacity = .6 * (1 - k2); o.scale.set(.5 + k2 * 2.5, 9, .5 + k2 * 2.5); if (k2 < 1) return true; qRm(o, m); return false; }); }
// 내려친 순간 섬광 (주먹 위치)
function qFlash(p) { const m = ADD(0xffffff, 1), o = qAdd(new THREE.Mesh(qgeo().sph, m)); o.position.copy(p); o.scale.setScalar(.4); let t = 0;
  FX.push(dt => { t += dt; const k = t / .22; o.scale.set(.4 + k * 3.6, .3 + k * 1.6, .4 + k * 3.6); m.opacity = 1 - k; if (k < 1) return true; qRm(o, m); return false; }); }
// 바닥 열기 (빛나는 원형 — 캔버스 방사 그라디언트, 한 번 만들어 재사용)
let glowTex = null;
function qGlowTex() { if (glowTex) return glowTex; const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(.25, 'rgba(255,214,140,.9)'); g.addColorStop(.6, 'rgba(255,120,50,.45)'); g.addColorStop(1, 'rgba(255,80,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(cv); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex; }
function qGlow(c, gy, R) { const m = new THREE.MeshBasicMaterial({ map: qGlowTex(), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), o = qAdd(new THREE.Mesh(qgeo().disc, m));
  o.rotation.x = -Math.PI / 2; o.position.set(c.x, gy + .2, c.z); o.scale.setScalar(R * .5); let t = 0;
  FX.push(dt => { t += dt; o.scale.setScalar(R * (.5 + Math.min(1, t / .15) * .7)); m.opacity = t < .3 ? 1 : Math.max(0, 1 - (t - .3) / 1.1); if (t < 1.4) return true; qRm(o, m); return false; }); }
// 땅 균열: 방사형 갈라짐(꺾인 3마디 + 곁가지) — 어두운 틈 위에 빛나는 금. 바깥으로 자라며 생기고 천천히 식음
function qCracks(c, gy) { const G0 = qgeo().plane, mg = NORM(0xffc45a, 1), mw = NORM(0xfffbe8, 1), md = NORM(0x1a0e06, .85), segs = [], N = Q.perf ? 10 : 16;
  const seg = (x, z, a, len, w, delay) => { const cx = x, cz = z; for (const [m, ww, yo] of [[md, w * 2.6, .21], [mg, w, .23], [mw, w * .35, .24]]) { if (m === mw && Q.perf) continue; const o = qAdd(new THREE.Mesh(G0, m)); o.rotation.set(-Math.PI / 2, 0, Math.PI + a); /* 평면 +Y(길이) → 월드 (sin a, 0, cos a) */ o.position.set(cx, gy + yo, cz); o.scale.set(ww, .001, 1); segs.push({ o, len, delay }); } };
  for (let i = 0; i < N; i++) { let a = i / N * 6.28 + Math.random() * .25, x = c.x, z = c.z, w = .26;
    for (let s = 0; s < 3; s++) { const len = (s ? 1.1 : 1.6) + Math.random() * 1.2; seg(x, z, a, len, w, s * .05);
      if (s === 1 && !Q.perf && Math.random() < .6) { const b = a + (Math.random() < .5 ? -1 : 1) * (.5 + Math.random() * .4); seg(x + Math.sin(a) * len * .5, z + Math.cos(a) * len * .5, b, .8 + Math.random() * .8, w * .6, .1); }
      x += Math.sin(a) * len; z += Math.cos(a) * len; a += (Math.random() - .5) * .8; w *= .72; } }
  let t = 0;
  FX.push(dt => { t += dt; for (const s of segs) s.o.scale.y = s.len * Math.min(1, Math.max(.001, (t - s.delay) / .12));
    const k = Math.max(0, (t - .6) / 1.4); mg.opacity = 1 - k; mw.opacity = 1 - Math.min(1, k * 1.6); md.opacity = .85 * Math.max(0, 1 - Math.max(0, (t - .9) / 1.5)); mg.color.setHex(t < .5 ? 0xffd27a : 0xff8a3a);
    if (t < 2.4) return true; for (const s of segs) { scene.remove(s.o); G.ftN.tqLive--; } mg.dispose(); mw.dispose(); md.dispose(); return false; }); }
// 충격파: 흰 고리 + 백호색 굵은 고리 + 낮은 충격 벽이 waveR 까지 퍼짐 · 고리가 지나가는 지상 적마다 1회 200% (넉백 없음)
function qShock(c, gy, mul) { const q = qgeo(), col = hero.adv.col, dmg = stat.dmg() * TQ.waveMul * mul, hit = new Set(), T = TQ.waveR / TQ.waveSpd;
  const m1 = ADD(0xfff4e0, 1), m2 = NORM(col, .85), m3 = ADD(0xffe0b0, .5), r1 = qAdd(new THREE.Mesh(q.ring, m1)), r2 = qAdd(new THREE.Mesh(q.ring2, m2)), w = qAdd(new THREE.Mesh(q.wall, m3));
  for (const o of [r1, r2]) { o.rotation.x = -Math.PI / 2; o.position.set(c.x, gy + .26, c.z); } w.position.set(c.x, gy, c.z); let t = 0; G.ftN.tqWave = (G.ftN.tqWave || 0) + 1;
  FX.push(dt => { t += dt; const k = Math.min(1, t / T), r = .5 + k * (TQ.waveR - .5), k2 = Math.min(1, t / (T * 1.35)), rr = .5 + k2 * (TQ.waveR * .85);
    r1.scale.setScalar(r); m1.opacity = 1 - k * k; r2.scale.setScalar(rr); m2.opacity = .85 * (1 - k2); w.scale.set(r, 1.8 * (1 - k * .6), r); m3.opacity = .5 * (1 - k);
    if (k < 1) for (const e of ground()) { if (hit.has(e)) continue; if (d2(e, c.x, c.z) <= r * r) { hit.add(e); hurt(e, dmg, '#ffcf8a', false, { x: c.x, z: c.z, kind: 'melee' }); G.ftN.tqWaveHits = (G.ftN.tqWaveHits || 0) + 1; if (!Q.perf) emit(P, e.g.position.x, gy + .5, e.g.position.z, 6, 0xd8c0a0, 4, .4, -6, .8); } }
    if (Math.random() < (Q.perf ? .3 : .8)) { const a = Math.random() * 6.28; emit(P, c.x + Math.cos(a) * r, gy + .3, c.z + Math.sin(a) * r, 2, 0xd8c4a0, 3, .45, -5, .4); }
    if (k2 < 1) return true; qRm(r1, m1); qRm(r2, m2); qRm(w, m3); return false; }); }
// 솟구치는 바위: 균열 사이로 뾰족 바위가 순간 솟았다가 가라앉음 (공유 지오메트리·재질)
function qSpikes(c, gy) { if (!ROCKM) ROCKM = toon(0x7d6b56); const N = Q.perf ? 6 : 11, L = [];
  for (let i = 0; i < N; i++) { const a = i / N * 6.28 + Math.random() * .4, r = 1.7 + Math.random() * 1.7, s = .7 + Math.random() * .6, o = qAdd(new THREE.Mesh(qgeo().spike, ROCKM));
    o.position.set(c.x + Math.sin(a) * r, gy - 2, c.z + Math.cos(a) * r); o.rotation.set(Math.cos(a) * .45, Math.random() * 3, -Math.sin(a) * .45); o.scale.set(s, s * (.8 + Math.random() * .7), s); if (!Q.perf) o.castShadow = true; L.push({ o, d: Math.random() * .08 }); }
  let t = 0; FX.push(dt => { t += dt; for (const x of L) { const u = t - x.d, y = u < 0 ? -2 : u < .09 ? -2 + 2 * (u / .09) : u < .55 ? 0 : -2 * Math.min(1, (u - .55) / .45); x.o.position.y = gy + y - .05; }
    if (t < 1.1) return true; for (const x of L) { scene.remove(x.o); G.ftN.tqLive--; } return false; }); }
// 흙먼지: 보통 혼합 스프라이트가 바깥으로 퍼지며 커지고 옅어짐
let dustTex = null;
function qDustTex() { if (dustTex) return dustTex; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.55, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); dustTex = new THREE.CanvasTexture(cv); return dustTex; }
function qDust(c, gy) { const N = Q.perf ? 6 : 14, L = [];
  for (let i = 0; i < N; i++) { const a = i / N * 6.28 + Math.random() * .4, m = new THREE.SpriteMaterial({ map: qDustTex(), color: i % 3 ? 0xb8a184 : 0xd6c6aa, transparent: true, opacity: .8, depthWrite: false }), o = qAdd(new THREE.Sprite(m));
    o.position.set(c.x + Math.sin(a) * 1.2, gy + .6 + Math.random() * .6, c.z + Math.cos(a) * 1.2); o.scale.setScalar(1.6); L.push({ o, m, vx: Math.sin(a) * (4 + Math.random() * 3), vz: Math.cos(a) * (4 + Math.random() * 3), vy: .8 + Math.random() * 1.6 }); }
  let t = 0; FX.push(dt => { t += dt; const k = t / 1.3, drag = Math.max(0, 1 - dt * 2.5); for (const x of L) { x.o.position.x += x.vx * dt; x.o.position.z += x.vz * dt; x.o.position.y += x.vy * dt; x.vx *= drag; x.vz *= drag; x.o.scale.setScalar(1.6 + k * 3.4); x.m.opacity = .8 * (1 - k); }
    if (k < 1) return true; for (const x of L) qRm(x.o, x.m); return false; }); }
// 포효하는 백호 기운: 캔버스로 그린 흰 호랑이 머리(입 벌림 · 검은 줄무늬 · 빛나는 눈) + 가산 혼합 잔상 — 솟아오르며 커졌다 사라짐 (새 모델·텍스처 파일 없음)
let tigerTex = null;
function tigerTexture() { if (tigerTex) return tigerTex; const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); x.scale(2, 2);
  const og = x.createRadialGradient(128, 136, 30, 128, 136, 128); og.addColorStop(0, 'rgba(190,240,255,.55)'); og.addColorStop(.7, 'rgba(120,200,255,.25)'); og.addColorStop(1, 'rgba(120,200,255,0)'); x.fillStyle = og; x.fillRect(0, 0, 256, 256); // 기운
  const hg = x.createLinearGradient(0, 30, 0, 240); hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#cfe6ff'); x.fillStyle = hg; x.strokeStyle = '#7fd4ff'; x.lineWidth = 5;
  x.beginPath(); x.moveTo(44, 78); x.lineTo(62, 22); x.lineTo(102, 56); x.quadraticCurveTo(128, 48, 154, 56); x.lineTo(194, 22); x.lineTo(212, 78); x.quadraticCurveTo(246, 120, 226, 168); x.lineTo(200, 200); x.quadraticCurveTo(128, 250, 56, 200); x.lineTo(30, 168); x.quadraticCurveTo(10, 120, 44, 78); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#ffc0cc'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(128 + s * 64, 36); x.lineTo(128 + s * 52, 62); x.lineTo(128 + s * 80, 62); x.fill(); } // 귀 안쪽
  x.strokeStyle = '#141820'; x.lineCap = 'round'; x.lineWidth = 8; // 줄무늬
  for (const [a, b, c2, d] of [[128, 60, 128, 92], [108, 62, 114, 88], [148, 62, 142, 88], [40, 112, 80, 122], [34, 140, 76, 146], [42, 168, 78, 166], [216, 112, 176, 122], [222, 140, 180, 146], [214, 168, 178, 166], [84, 84, 96, 104], [172, 84, 160, 104]]) { x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo((a + c2) / 2 + 4, (b + d) / 2, c2, d); x.stroke(); }
  for (const s of [-1, 1]) { const ex = 128 + s * 36; x.fillStyle = '#141820'; x.beginPath(); x.ellipse(ex, 120, 20, 11, s * -.4, 0, 6.3); x.fill(); x.fillStyle = '#7ff0ff'; x.shadowColor = '#7ff0ff'; x.shadowBlur = 14; x.beginPath(); x.ellipse(ex, 120, 14, 7, s * -.4, 0, 6.3); x.fill(); x.shadowBlur = 0; x.fillStyle = '#0a1a2a'; x.beginPath(); x.ellipse(ex, 120, 3, 6, 0, 0, 6.3); x.fill(); } // 눈
  x.fillStyle = '#3a2028'; x.beginPath(); x.moveTo(116, 142); x.lineTo(140, 142); x.lineTo(128, 154); x.fill(); // 코
  x.fillStyle = '#5a0e1a'; x.beginPath(); x.moveTo(84, 168); x.quadraticCurveTo(128, 150, 172, 168); x.quadraticCurveTo(168, 222, 128, 228); x.quadraticCurveTo(88, 222, 84, 168); x.fill(); // 포효하는 입
  x.fillStyle = '#ff7a8a'; x.beginPath(); x.ellipse(128, 210, 22, 10, 0, 0, 6.3); x.fill(); x.fillStyle = '#ffffff'; // 송곳니
  for (const [px, py, dy] of [[96, 166, 22], [160, 166, 22], [104, 222, -16], [152, 222, -16]]) { x.beginPath(); x.moveTo(px - 6, py); x.lineTo(px + 6, py); x.lineTo(px, py + dy); x.fill(); }
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(128 + s * 30, 150 + i * 6); x.lineTo(128 + s * 78, 140 + i * 12); x.stroke(); } // 수염
  tigerTex = new THREE.CanvasTexture(cv); tigerTex.colorSpace = THREE.SRGBColorSpace; return tigerTex; }
function tigerSpirit(c, gy) { const f = fwd(), m1 = new THREE.SpriteMaterial({ map: tigerTexture(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }),
    m2 = new THREE.SpriteMaterial({ map: tigerTexture(), color: 0x9adfff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const s1 = qAdd(new THREE.Sprite(m1)), s2 = qAdd(new THREE.Sprite(m2)); s1.renderOrder = 6; s2.renderOrder = 7; G.ftN.tiger = (G.ftN.tiger || 0) + 1; let t = 0; const D = Q.perf ? .9 : 1.15;
  FX.push(dt => { t += dt; const k = t / D, grow = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3), roar = 1 + Math.sin(Math.min(1, k * 3) * Math.PI) * .12; // 튀어나오며 커지고 포효하듯 한 번 부풂
    const sc = (2.6 + grow * 4.4) * roar, y = gy + 2.4 + grow * 1.8; s1.position.set(c.x + f.x * grow * .8, y, c.z + f.z * grow * .8); s1.scale.setScalar(sc); s2.position.copy(s1.position); s2.scale.setScalar(sc * (1.15 + k * .5));
    const a = k < .12 ? k / .12 : Math.max(0, 1 - (k - .45) / .55); m1.opacity = .95 * a; m2.opacity = .55 * a * (1 - k * .5);
    if (k < 1) return true; qRm(s1, m1); qRm(s2, m2); return false; }); }
// hero.js 피격: 백호진천권 시전 중이면 받는 피해 ×0.7
export const ftGuard = () => (hero && hero.ft && hero.ft.leap && hero.ft.leap.kind === 'quake' ? 1 - TQ.guard : 1);
// ---------- 전직 Q ② 🐉 천룡파 (천기권사, 2026-10-24 강화): 거대한 푸른 용(×1.6)이 가장 가까운 '아직 안 맞은' 적을 쫓아 날아감 — 비행 24 · 반폭 1.9 관통 500% (적마다 1회) · 일반 적 1초 기절 / 보스 2초 25% 둔화 ----------
function dragonWave(at, mul) { const h = hero; ftStop(); const p = h.g.position; let dir = at ? new THREE.Vector3(at.x - p.x, 0, at.z - p.z) : fwd(); if (dir.lengthSq() < .01) dir = fwd(); dir.normalize();
  h.face = Math.atan2(dir.x, dir.z); h.path = []; h.ft.idle = 0; G.ftN.q++; G.ftN.dw++; banner('천룡파!', h.adv.c, 1000);
  const spd = HIT.PalmS / DW.castT; if (h.ch.acts.PalmS) play(h.ch, 'PalmS', { once: true, force: true, speed: spd }); h.atkT = DW.castT + .4; glow(true, 1);
  Snd.play('magic', { pos: p, rate: .8, force: true }); ringFx(p, 2.6, h.adv.col, DW.castT); emit(P, p.x, 1.2, p.z, Q.perf ? 12 : 30, h.adv.col, -3, .35, 0, 1.2);
  later(DW.castT, () => { glow(false); if (!hero || hero.dead > 0) return; dragonFly(hero.g.position.clone(), dir, mul); }); return true; }
const SOLID = (c, o = .9) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false }); // 보통 혼합 (밝은 바닥에서 가산 혼합은 하얗게 날아감)
function dragonHead(col) { const g = new THREE.Group(), m = SOLID(0x1a8ad8, .97), m2 = SOLID(0x2ab8f0, .95), w = SOLID(0xf4fbff, 1), gold = SOLID(0xffe27a, 1);
  const head = new THREE.Mesh(new THREE.ConeGeometry(.75, 2, 10).rotateX(Math.PI / 2), m); g.add(head); const jaw = new THREE.Mesh(new THREE.SphereGeometry(.85, 14, 10), m2); jaw.scale.set(1, .8, 1.2); jaw.position.z = -.5; g.add(jaw);
  const low = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.5, 8).rotateX(Math.PI / 2), m2); low.position.set(0, -.42, .25); low.rotation.x = .35; g.add(low); // 벌린 아래턱
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 10), ADD(col, .32)); halo.scale.set(1, .8, 1.5); g.add(halo);
  for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(.13, 1.6, 6), w); horn.position.set(sx * .45, .75, -.95); horn.rotation.x = -1.15; horn.rotation.z = sx * -.35; g.add(horn);
    const tine = new THREE.Mesh(new THREE.ConeGeometry(.08, .6, 5), w); tine.position.set(sx * .62, .95, -1.05); tine.rotation.z = sx * -1.1; g.add(tine); // 사슴뿔 곁가지
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.17, 8, 6), gold); eye.position.set(sx * .4, .34, .1); g.add(eye);
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(.025, .05, 2.4, 4), w); wh.position.set(sx * .75, -.05, .1); wh.rotation.set(1.2, 0, sx * .9); g.add(wh); // 수염
    const fin = new THREE.Mesh(new THREE.ConeGeometry(.22, .9, 4), m2); fin.position.set(sx * .7, .25, -.8); fin.rotation.set(-1.3, 0, sx * -.9); g.add(fin); } // 귀 지느러미
  for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(.14, .7, 5), w); sp.position.set(0, .7 - i * .05, -.6 - i * .45); sp.rotation.x = -.7; g.add(sp); } // 갈기
  g.scale.setScalar(DW.scale); return g; }
function dragonFly(start, dir0, mul) { const col = hero.adv.col, S = DW.scale, dmg = stat.dmg() * DW.mul * mul, hit = new Set(), y = start.y + 1.6, N = Q.perf ? 9 : 16, head = dragonHead(col), body = [], hist = [], SP = .5;
  let dist = 0, t = 0, px = start.x, pz = start.z, dx = dir0.x, dz = dir0.z, done = false, tgt = null; G.ftN.dwLive = (G.ftN.dwLive || 0) + 1;
  head.position.set(px, y, pz); head.lookAt(px + dx, y, pz + dz); scene.add(head); hist.push(head.position.clone());
  for (let i = 0; i < N; i++) { const r = .66 * S * (1 - i / (N + 3)), b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), SOLID(i % 2 ? 0x1a8ad8 : 0x42c8f4, .93 - i * .02)); b.position.copy(head.position); b.visible = false;
    if (!Q.perf && i % 2 === 0 && i < N - 2) { const fin = new THREE.Mesh(new THREE.ConeGeometry(r * .35, r * 1.3, 4), SOLID(0xf4fbff, .95)); fin.position.y = r * .95; b.add(fin); } // 등지느러미
    if (i === N - 1) { const tail = new THREE.Mesh(new THREE.ConeGeometry(r * 1.4, r * 2.6, 6), SOLID(0x9af0ff, .9)); tail.rotation.x = Math.PI / 2; b.add(tail); } scene.add(b); body.push(b); }
  G.shake = Math.max(G.shake || 0, .6); Snd.play('boom', { pos: start, vol: .6, rate: 1.1, force: true }); Snd.whoosh(start, .9, 200, 3600, .7); Snd.play('magic', { pos: start, rate: 1.4, force: true }); if (Snd.roar) Snd.roar(start);
  const pick = () => { let b = null, bd = DW.seek * DW.seek; for (const e of alive()) { if (hit.has(e)) continue; const ex = e.g.position.x - px, ez = e.g.position.z - pz, d = ex * ex + ez * ez; if (d >= bd || ex * dx + ez * dz < DW.cone * Math.sqrt(d)) continue; bd = d; b = e; } return b; }; // 유도 대상: 머리 앞쪽(±80°) seek 안의 가장 가까운 '안 맞은' 적 (뒤로 U턴하며 맴돌지 않게)
  FX.push(dt => { t += dt;
    if (!done) { if (!tgt || tgt.dead || hit.has(tgt) || tgt.immT > G.t || (tgt.g.position.x - px) * dx + (tgt.g.position.z - pz) * dz < 0) tgt = pick();
      if (tgt) { const [nx, nz] = steer(dx, dz, tgt.g.position.x - px, tgt.g.position.z - pz, DW.turn * dt); G.ftN.dwTurn = (G.ftN.dwTurn || 0) + Math.abs(Math.atan2(dx * nz - dz * nx, dx * nx + dz * nz)); dx = nx; dz = nz; G.ftN.dwHome = (G.ftN.dwHome || 0) + 1; }
      const st = Math.min(DW.spd * dt, DW.len - dist), x0 = px, z0 = pz; dist += st; px += dx * st; pz += dz * st;
      const wob = Math.sin(dist * .9) * .5; head.position.set(px + dz * wob, y + Math.sin(dist * .6) * .35, pz - dx * wob); head.lookAt(head.position.x + dx, head.position.y, head.position.z + dz);
      // 판정: 이번 프레임 이동 구간(x0,z0 → px,pz) 에서 반폭 DW.w 안 (흔들림은 겉모양만)
      for (const e of alive()) { if (hit.has(e)) continue; const ex = e.g.position.x - x0, ez = e.g.position.z - z0, k = Math.max(0, Math.min(st, ex * dx + ez * dz)), qx = ex - dx * k, qz = ez - dz * k; if (qx * qx + qz * qz > DW.w * DW.w) continue;
        hit.add(e); G.ftN.dwHits++; hurt(e, dmg, '#9af0ff', true); if (!e.dead) { if (e.E.boss) { e.slowAmt = e.slowT > 0 ? Math.max(e.slowAmt || 0, DW.bossSlow) : DW.bossSlow; e.slowT = Math.max(e.slowT || 0, DW.bossSlowT); } else { e.stunT = Math.max(e.stunT || 0, DW.stun); e.frozen = false; G.ftN.dwStun++; } }
        emit(P, e.g.position.x, 1.4, e.g.position.z, Q.perf ? 8 : 18, col, 6, .45); ringFx(e.g.position, 1.4, col, .25); }
      if (!Q.perf || Math.random() < .5) { emit(PB, head.position.x, head.position.y, head.position.z, 2, col, .8, .5, 0, .6); emit(P, head.position.x, head.position.y, head.position.z, 5, 0xe0fbff, 1.8, .45, 0, .9); }
      if (dist >= DW.len) { done = true; t = 0; ringFx(new THREE.Vector3(px, 0, pz), 3, col, .45); emit(P, px, y, pz, Q.perf ? 16 : 44, col, 9, .55); Snd.play('glass', { pos: head.position, vol: .4, rate: .8 }); } }
    { const last = hist[0], L = head.position.distanceTo(last); if (L >= SP) { const n = Math.min(8, Math.floor(L / SP)); for (let k = 1; k <= n; k++) hist.unshift(last.clone().lerp(head.position, k * SP / L)); } if (hist.length > N * 2 + 4) hist.length = N * 2 + 4; } // 거리 간격으로 꼬리 궤적 (프레임 속도 무관)
    for (let i = 0; i < N; i++) { const j = (i + 1) * 2; body[i].position.copy(hist[Math.min(hist.length - 1, j)]); body[i].visible = hist.length > j || done; if (j + 1 < hist.length) body[i].lookAt(hist[j - 1]); }
    if (done) { const k = Math.min(1, t / .35); head.scale.setScalar(S * (1 + k)); for (const o of [head, ...body]) o.traverse(m => { if (m.material) m.material.opacity *= .82; });
      if (k < 1) return true; for (const o of [head, ...body]) { scene.remove(o); o.traverse(m => { if (m.geometry) { m.geometry.dispose(); m.material.dispose(); } }); } G.ftN.dwLive--; return false; }
    return true; }); }
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
