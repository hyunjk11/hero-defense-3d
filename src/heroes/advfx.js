// ================= 전직 실전 효과 (design 7절) =================
// J-4 기본 공격 변형 · J-5 Q 스킬 변형 8종 · J-6 오라 링/무기 스케일. hero.adv 가 있을 때만 호출 → 전직 없으면 기존 경로 그대로 (회귀 불변)
// 확률(성기사 기절)은 Math.random — 게임 난수(rand) 소비 없음. 카운터 G.advN (테스트용), 전직 효과 피해 합계 G.advDmg
import * as THREE from 'three';
import { Snd } from '../audio/audio.js';
import { G, later } from '../core/state.js';
import { scene } from '../render/scene.js';
import { P, PB, emit, ringFx } from '../render/vfx.js';
import { glow } from '../render/toon.js';
import { Q } from '../render/quality.js';
import { play } from '../render/characters.js';
import { makeArrow, shoot } from '../combat/projectiles.js';
import { hurt } from '../monsters/enemy.js';
import { banner } from '../ui/hud.js';
import { hero, stat } from './hero.js';
import { gunSkill, ricochet, bloom, muzzle, flash } from './gunner.js';

const FX = [];
G.advN = {}; G.advDmg = 0;
const alive = () => G.enemies.filter(e => !e.dead && e.dying === undefined);
const d2 = (e, x, z) => { const dx = e.g.position.x - x, dz = e.g.position.z - z; return dx * dx + dz * dz; };
const near = (x, z, r) => alive().filter(e => d2(e, x, z) <= r * r);
const cnt = (k, n = 1) => { G.advN[k] = (G.advN[k] || 0) + n; };
const hit = (e, d, col, big) => { if (e.dead) return; G.advDmg += d; hurt(e, d, col, big); };
const ADD = (c, o = .8) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const css = c => '#' + c.toString(16).padStart(6, '0');
// 무기 스케일: 무기가 스킨된 손 뼈 (Meshy 모델은 무기가 몸 메시에 붙어 있어 손 뼈 크기로 키움 — 새 모델 없음)
const WBONE = { archer: ['LeftHand'], mage: ['RightHand'], warrior: ['RightHand'], gunner: ['LeftHand', 'RightHand'] };

// ---------- 출정 시 초기화: 발밑 오라 링 (성능 모드 1메시) + 무기 스케일 ----------
export function advInit(h) {
  G.advN = {}; G.advDmg = 0; FX.length = 0; const A = h.adv; if (!A) return;
  const g = new THREE.Group(); g.position.y = .07; g.renderOrder = 2;
  const r1 = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.38, 48), ADD(A.col, .55)); r1.rotation.x = -Math.PI / 2; g.add(r1);
  if (!Q.perf) { const r2 = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.62, 6, 1, 0, Math.PI * 2), ADD(A.col, .4)); r2.rotation.x = -Math.PI / 2; g.add(r2); } // 육각 바깥 링 (반대로 회전)
  h.g.add(g); h.aura = g; h.advBones = (WBONE[h.cls] || []).map(n => h.ch.root && h.ch.root.getObjectByName(n)).filter(Boolean);
  if (h.ch.ring) h.ch.ring.material.color.setHex(A.col);
}
// ---------- 매 프레임 (updHero 맨 앞, mixer 갱신 직후) ----------
export function advUpd(dt) {
  const h = hero, A = h.adv; if (h.aura) { h.aura.rotation.y += dt * 1.4; const [a, b] = h.aura.children; a.material.opacity = .42 + Math.sin(G.t * 3) * .14; if (b) b.rotation.z -= dt * 2.6; }
  if (A.ws && A.ws !== 1) for (const b of h.advBones) b.scale.setScalar(A.ws);
  if (h.advStunCd > 0) h.advStunCd -= dt; if (h.sanctT > 0) updSanct(dt);
  for (let i = FX.length - 1; i >= 0; i--) if (!FX[i](dt)) FX.splice(i, 1);
}
// 전직 저격수: 체력 높은 적(보스) 우선
export function advPick(rng) { const p = hero.g.position; let best = null, bh = -1;
  for (const e of G.enemies) { if (e.dead || e.immT > G.t || (hero.cls === 'warrior' && e.E.fly)) continue; if (d2(e, p.x, p.z) < rng * rng && e.hp > bh) { bh = e.hp; best = e; } } return best; }

// ---------- J-4 기본 공격 ----------
// 실바: 순찰자 = 두 번째 대상(70%), 저격수 = 방어 무시 금빛 화살
export function advArrow(t, from, dmg) { const A = hero.adv, a = A.atk;
  if (a.ap) { shoot('arrow', from, t, dmg, { color: A.col, ap: true, big: true, spd: 46 }); cnt('ap'); return; }
  shoot('arrow', from, t, dmg, { color: A.col }); if (!(a.targets > 1)) return; const p = hero.g.position, r = stat.range();
  const L = alive().filter(e => e !== t && !(e.immT > G.t) && d2(e, p.x, p.z) <= r * r).sort((x, y) => d2(x, p.x, p.z) - d2(y, p.x, p.z)).slice(0, a.targets - 1);
  for (const e of L) { shoot('arrow', from, e, dmg * a.k2, { color: A.col }); cnt('multi'); } }
// 루나: 업화 = 착탄 지점 불꽃, 서리 = 강한 둔화 + 5번째 공격 빙결
export function advOrb(t, from, dmg) { const A = hero.adv, a = A.atk, o = { aoe: hero.C.aoe, col: A.col };
  if (a.burn) o.onHit = tp => burnField(tp, dmg * a.burn.k, a.burn.t, a.burn.r);
  else if (a.slow) { const fr = ++hero.advHits % a.freezeEvery === 0; o.onHit = (tp, tg) => frostHit(tp, tg, a, fr); }
  shoot('orb', from, t, dmg, o); emit(P, from.x, from.y, from.z, 10, A.col, 3, .3); }
function burnField(p, dps, dur, r) { cnt('burn'); const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), ADD(0xff6a1a, .5)); m.rotation.x = -Math.PI / 2; m.position.set(p.x, .12, p.z); scene.add(m);
  let t = 0, tick = .25; FX.push(dt => { t += dt; tick -= dt; if (tick <= 0 && t <= dur + .01) { tick = .25; for (const e of near(p.x, p.z, r)) { if (e.E.fly) continue; hit(e, dps * .25, '#ffb05a'); cnt('burnTick'); } }
    m.material.opacity = .5 * Math.max(0, 1 - t / dur) * (.8 + Math.sin(t * 20) * .2); if (Math.random() < .5) emit(P, p.x + (Math.random() - .5) * r * 1.4, .3, p.z + (Math.random() - .5) * r * 1.4, 1, Math.random() < .5 ? 0xff8a2a : 0xffd04a, 1, .5, 3, .2);
    if (t < dur) return true; scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; }); }
function frostHit(tp, tg, a, fr) { for (const e of near(tp.x, tp.z, hero.C.aoe)) { e.slowT = Math.max(e.slowT, a.slowT); e.slowAmt = Math.max(e.slowAmt || 0, Math.min(.7, .45 + a.slow)); }
  if (fr && tg && !tg.dead) { tg.stunT = Math.max(tg.stunT || 0, tg.E.boss ? a.freezeBoss : a.freezeT); tg.frozen = true; cnt('freeze'); ringFx(tg.g.position, 1.6, 0x8ae8ff, .35); emit(PB, tp.x, tp.y, tp.z, 8, 0x8ae8ff, 3, .6, 0, .8); Snd.play('glass', { pos: tp, vol: .4 }); } }
// 세라: 광전사 흡혈 (근접 타격 피해 합 × 4%)
export function advLeech(d) { const a = hero.adv.atk; if (!a.leech || d <= 0 || hero.dead > 0) return; const v = d * a.leech; hero.hp = Math.min(hero.max, hero.hp + v); cnt('leech'); G.advHeal = (G.advHeal || 0) + v;
  if (Math.random() < .3) emit(P, hero.g.position.x, 1.4, hero.g.position.z, 4, 0xff3a4a, 2, .4, 2, .4); }
export const advAtkMul = () => { const a = hero.adv && hero.adv.atk; return a && a.lowHp && hero.hp <= hero.max * a.lowHp ? a.lowAtk : 1; }; // 광전사: 체력 50% 이하 공격력 +20%
// 세라: 성기사 피격 시 10% 확률 주변 적 기절 (내부 쿨 2초)
export function advOnHurt() { const a = hero.adv.atk; if (!a.stunCh || hero.advStunCd > 0 || hero.dead > 0 || !(G.advForceStun || Math.random() < a.stunCh)) return; hero.advStunCd = a.stunCd; const p = hero.g.position;
  for (const e of near(p.x, p.z, a.stunR)) { if (e.E.fly) continue; e.stunT = Math.max(e.stunT || 0, e.E.boss ? a.stunT * .5 : a.stunT); e.frozen = false; cnt('stunHit'); }
  cnt('stun'); ringFx(p, a.stunR, 0xffe9a0, .35); emit(P, p.x, 1.2, p.z, 24, 0xfff0b0, 5, .4, 0, 1); Snd.play('block', { pos: p, rate: .8 }); }
// 로즈: 탄 색 + 결투가(6번째 탄 도탄 3명 50%) / 포격수(착탄 반경 1.2 소폭발 60%)
export function advBullet(t) { const A = hero.adv, a = A.atk, o = { col: A.col };
  if (a.ricoEvery) { if (++hero.advHits % a.ricoEvery === 0) { cnt('rico'); o.onHit = (tp, tg) => tg && ricochet(tg, { mul: a.ricoK }, a.ricoN, false); } }
  else if (a.splashR) { const dmg = stat.dmg() * a.splashK; o.onHit = (tp, tg) => { cnt('splash'); for (const e of near(tp.x, tp.z, a.splashR)) if (e !== tg) { hit(e, dmg, '#ff6a8a'); cnt('splashHit'); }
    ringFx(tp, a.splashR, 0xd0204a, .22); emit(P, tp.x, tp.y, tp.z, 10, 0xff4a7a, 4, .3, -3, .4); Snd.play('boom', { pos: tp, vol: .18, rate: 1.8 }); }; }
  return o; }

// ---------- J-5 Q 스킬 (castSkill 에서 목표 계산 후 호출, true 면 기본 스킬 대신) ----------
export function advSkill(tgt, mul, base) { const A = hero.adv, k = A && A.skill; if (!k) return false; const hp = hero.g.position; cnt('skill_' + k);
  if (k === 'storm') { // 폭풍 화살비: 반경 5.5 · 48발 · 1초 30% 둔화
    ringFx(tgt, 5.5, A.col, 1.4); banner('폭풍 화살비!', A.c, 900); play(hero.ch, hero.ch.acts.Ranged_Skill ? 'Ranged_Skill' : '2H_Ranged_Shoot', { once: true, force: true, speed: 1.2 }); hero.atkT = .6;
    for (let i = 0; i < 48; i++) later(i * .03, () => { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * 5.5, p = new THREE.Vector3(tgt.x + Math.cos(a) * rr, 18, tgt.z + Math.sin(a) * rr);
      const m = makeArrow(A.col); m.position.copy(p); m.rotation.x = Math.PI / 2; scene.add(m); G.projs.push({ kind: 'rain', m, dest: p.clone().setY(0), dmg: base * 1.3 * mul, spd: 40, slowT: 1, slowAmt: .3 }); });
    Snd.play('draw', { pos: hp }); Snd.whoosh(tgt, 1.1, 300, 3400, .4); for (let j = 1; j < 9; j++) Snd.play('arrow', { pos: tgt, delay: j * .12, force: true, vol: .7 }); return true; }
  if (k === 'snipe') { // 일섬 저격: 직선 관통 600% (방어 무시, 공중 포함)
    const dir = new THREE.Vector3(tgt.x - hp.x, 0, tgt.z - hp.z); if (dir.lengthSq() < .01) dir.set(Math.sin(hero.face), 0, Math.cos(hero.face)); dir.normalize(); hero.face = Math.atan2(dir.x, dir.z);
    banner('일섬 저격!', A.c, 900); play(hero.ch, '2H_Ranged_Shoot', { once: true, force: true, speed: .9 }); hero.atkT = .7; G.shake = Math.max(G.shake || 0, .3);
    later(.25, () => { if (!hero || hero.dead > 0) return; const from = hp.clone().setY(1.4), m = makeArrow(A.col); m.scale.set(3, 3, 3.2); m.position.copy(from); m.lookAt(from.clone().add(dir)); scene.add(m);
      G.projs.push({ kind: 'pierce', m, dir, left: 32, spd: 75, dmg: base * 6 * mul, hit: new Set(), tw: null, air: true, col: A.col, txt: '#ffe08a', onHit: e => { G.advDmg += base * 6 * mul; cnt('snipeHit'); } });
      ringFx(from, 2.2, A.col, .3); emit(PB, from.x, from.y, from.z, 20, A.col, 6, .4, 0, .5); Snd.play('bolt', { pos: from, rate: .6, force: true }); Snd.whoosh(from, .5, 600, 4000, .6); }); return true; }
  if (k === 'meteors') { // 유성우: 메테오 3개 (각 ×7, 0.3초 간격, 반경 3 산포)
    banner('유성우!', A.c, 900); play(hero.ch, 'Spellcast_Long', { once: true, force: true, speed: 1.4 }); hero.atkT = 1; ringFx(tgt, 5.5, 0xff6a2a, 1.2);
    for (let i = 0; i < 3; i++) later(i * .3, () => { const a = hero.face + i * 2.094, rr = i ? 2.4 : 0, d = new THREE.Vector3(tgt.x + Math.sin(a) * rr, 0, tgt.z + Math.cos(a) * rr);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.95, 1), glow(0xff5a1a, 5)); m.position.set(d.x - 8, 26, d.z - 4); scene.add(m); G.projs.push({ kind: 'meteor', m, dest: d, dmg: base * 7 * mul, spd: 32, r: 3.4 }); });
    Snd.play('meteorCast', { pos: hp, rate: .9 }); Snd.whoosh(tgt, 1.4, 150, 900, .5); return true; }
  if (k === 'glacier') { // 빙하 낙하: 얼음 혜성 12 + 반경 5 빙결 2초 (보스 0.5초)
    banner('빙하 낙하!', A.c, 900); play(hero.ch, 'Spellcast_Long', { once: true, force: true, speed: 1.4 }); hero.atkT = 1; ringFx(tgt, 5, 0x8ae8ff, 1.1);
    for (let i = 0; i < 12; i++) later(i * .05, () => comet(new THREE.Vector3(tgt.x + Math.cos(i * 2.4) * Math.sqrt((i + .5) / 12) * 4.4, 0, tgt.z + Math.sin(i * 2.4) * Math.sqrt((i + .5) / 12) * 4.4), base * 1.5 * mul));
    later(1.05, () => { for (const e of near(tgt.x, tgt.z, 5)) { e.stunT = Math.max(e.stunT || 0, e.E.boss ? .5 : 2); e.frozen = true; e.slowT = Math.max(e.slowT, 3.5); e.slowAmt = Math.max(e.slowAmt || 0, .4); cnt('glacierFreeze'); }
      ringFx(tgt, 6, 0xbff4ff, .6); emit(PB, tgt.x, .6, tgt.z, 40, 0x8ae8ff, 8, .9, -4, 3); emit(P, tgt.x, .6, tgt.z, 90, 0xe0fbff, 10, 1, -8, 3); G.shake = Math.max(G.shake || 0, .5); Snd.play('glass', { pos: tgt, force: true }); Snd.play('boom', { pos: tgt, vol: .5, rate: .7 }); });
    Snd.play('meteorCast', { pos: hp, rate: 1.3 }); return true; }
  if (k === 'sanct') { // 성역: 4초, 반경 3.5 — 적 40% 둔화 + 0.5초마다 공격력 50%, 영웅 초당 3% 회복
    hero.sanctT = 4; hero.sanctTick = 0; hero.sanctMul = mul; banner('성역!', A.c, 900); play(hero.ch, 'Cheer', { once: true, force: true }); hero.atkT = .6;
    if (!hero.sanct) { const g = new THREE.Group(), d = new THREE.Mesh(new THREE.CircleGeometry(3.5, 40), ADD(0xffe9a0, .22)), r = new THREE.Mesh(new THREE.RingGeometry(3.25, 3.5, 48), ADD(0xfff4c0, .8)); d.rotation.x = r.rotation.x = -Math.PI / 2; g.add(d, r); g.position.y = .1; hero.g.add(g); hero.sanct = g; }
    hero.sanct.visible = true; ringFx(hp, 4.2, 0xffe9a0, .5); emit(PB, hp.x, 1, hp.z, 20, 0xfff0b0, 4, .8, -2, 2); Snd.play('levelUp', { pos: hp, vol: .5, force: true }); Snd.play('magic', { pos: hp, rate: .7 }); return true; }
  if (k === 'bloodspin') { // 피의 회오리: 4초 · 반경 +20% · 이동 +30%
    hero.spinT = 4; hero.spinR = 3.6 * 1.2; hero.spinSpd = 1.3; hero.spinCol = ['#ff6a6a', 0xff3a3a]; banner('피의 회오리!', A.c, 900); play(hero.ch, '2H_Melee_Attack_Spinning', { speed: 1.4 });
    if (!hero.swirl) { hero.swirl = new THREE.Mesh(new THREE.TorusGeometry(2.8, .25, 8, 40), ADD(0xff2a3a, .6)); hero.swirl.rotation.x = Math.PI / 2; hero.swirl.position.y = 1.2; hero.swirl.scale.setScalar(1.2); hero.g.add(hero.swirl); }
    hero.swirl.visible = true; hero.spinTick = 0; Snd.whoosh(hp, .6, 300, 1400, .6); for (let j = 0; j < 6; j++) Snd.play('sword', { pos: hp, delay: j * .3, force: true, rate: 1.2 }); return true; }
  if (k === 'rose+') { gunSkill(mul, base, 1.4, 1.4 / 1.3); banner('로즈 피니시+!', A.c, 1000); return true; } // 지속 +40% · 탄 수 +30%
  if (k === 'roseshell') { // 장미 포탄: 목표 지점 3연속 장미 폭발
    hero.path = []; banner('장미 포탄!', A.c, 1000); play(hero.ch, 'ShootStand', { force: true, speed: 1.6 }); hero.atkT = 1.1; hero.gunT = 1.1; G.gunN.skill++;
    for (let i = 0; i < 3; i++) later(.1 + i * .32, () => { if (!hero || hero.dead > 0) return; const kk = i & 1, from = muzzle(kk); flash(kk, 2.2); shell(from, tgt.clone().add(new THREE.Vector3((i - 1) * .9, 0, (i % 2 ? .8 : -.5))), at => { bloom(at, { mul: 2.5 }, false); cnt('shell'); }); Snd.gun(from, { rate: .7, vol: 1.3, big: true }); });
    return true; }
  return false;
}
function comet(d, dmg) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 0), glow(0x9ae8ff, 4)); const s = new THREE.Vector3(d.x - 5, 20, d.z - 3); m.position.copy(s); scene.add(m); let t = 0;
  FX.push(dt => { t += dt; const k = Math.min(1, t / .55); m.position.lerpVectors(s, d, k); m.rotation.x += dt * 9; if (Math.random() < .7) emit(P, m.position.x, m.position.y, m.position.z, 2, 0xcff6ff, 1.5, .4, 2, .4);
    if (k < 1) return true; scene.remove(m); m.geometry.dispose(); for (const e of near(d.x, d.z, 1.7)) hit(e, dmg, '#bff4ff', false); cnt('comet'); emit(P, d.x, .4, d.z, 24, 0xbff4ff, 5, .5, -6, 1); ringFx(d, 1.7, 0x8ae8ff, .3); Snd.play('glass', { pos: d, vol: .35, rate: 1.3 }); return false; }); }
function shell(from, dest, done) { const m = new THREE.Mesh(new THREE.SphereGeometry(.28, 10, 8), glow(0xd0204a, 3)), s = from.clone(); m.position.copy(s); scene.add(m); let t = 0;
  FX.push(dt => { t += dt; const k = Math.min(1, t / .38); m.position.lerpVectors(s, dest, k); m.position.y = s.y + (0 - s.y) * k + Math.sin(k * Math.PI) * 2.6; if (Math.random() < .8) emit(P, m.position.x, m.position.y, m.position.z, 1, 0xff4a7a, .5, .3, 0, 0);
    if (k < 1) return true; scene.remove(m); m.geometry.dispose(); done(dest); return false; }); }
function updSanct(dt) { const h = hero, p = h.g.position; h.sanctT -= dt; h.sanctTick -= dt; h.hp = Math.min(h.max, h.hp + h.max * .03 * dt); G.advHeal = (G.advHeal || 0) + h.max * .03 * dt;
  if (h.sanctTick <= 0) { h.sanctTick = .5; for (const e of near(p.x, p.z, 3.5)) { e.slowT = Math.max(e.slowT, .6); e.slowAmt = Math.max(e.slowAmt || 0, .4); hit(e, stat.dmg() * .5 * (h.sanctMul || 1), '#fff0b0'); cnt('sanctHit'); } emit(P, p.x, .3, p.z, 10, 0xfff0b0, 3, .6, 3, 3); }
  if (h.sanct) { h.sanct.rotation.y += dt; h.sanct.children[1].material.opacity = .6 + Math.sin(G.t * 8) * .2; }
  if (h.sanctT <= 0 || h.dead > 0) { h.sanctT = 0; if (h.sanct) h.sanct.visible = false; } }
export { css };
