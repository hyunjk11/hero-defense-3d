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
import { gunSkill, ricochet, bloom, muzzle, flash, petals, tracer } from './gunner.js';

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
const WBONE = { archer: ['LeftHand'], mage: ['RightHand'], warrior: ['RightHand'], gunner: ['LeftHand', 'RightHand'] }; // 소총 몸(장미 저격수)은 ws 1 → 손 뼈 크기 그대로

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
// 로즈: 탄 색 + 결투가(6번째 탄 도탄 3명 50%). 장미 저격수는 rifleShot (gunAttack 에서 분기)
export function advBullet(t) { const A = hero.adv, a = A.atk, o = { col: A.col };
  if (a.ricoEvery) { if (++hero.advHits % a.ricoEvery === 0) { cnt('rico'); o.onHit = (tp, tg) => tg && ricochet(tg, { mul: a.ricoK }, a.ricoN, false); } }
  return o; }

// 로즈 장미 저격수: 소총 관통탄 (즉발 직선) — 목표 방향으로 사거리+1 까지, 폭 pierceW 안의 적을 가까운 순으로 최대 3명 (100/70/50%), 공중 포함
// 치명타(stat.crit) = 큰 숫자, 보스/정예 bossK. 피해는 G.advDmg 에도 합산(뒤 대상만 = 관통 추가분)
const bossy = e => !!(e.E.boss || e.elite);
export function rifleLine(from, dir, len, w, n) { const L = []; for (const e of alive()) { if (e.immT > G.t) continue; const dx = e.g.position.x - from.x, dz = e.g.position.z - from.z, along = dx * dir.x + dz * dir.z; if (along < -.4 || along > len) continue;
    const side = Math.abs(dx * dir.z - dz * dir.x); if (side <= w + (e.E.boss ? .5 : 0)) L.push([along, e]); } L.sort((a, b) => a[0] - b[0]); return n ? L.slice(0, n).map(x => x[1]) : L.map(x => x[1]); }
export function rifleShot(t) { const A = hero.adv, a = A.atk, from = muzzle(0), tp = t.g.position, hp = hero.g.position, dir = new THREE.Vector3(tp.x - hp.x, 0, tp.z - hp.z); if (dir.lengthSq() < 1e-4) return; dir.normalize();
  const base = stat.dmg(), crit = stat.crit, len = stat.range() + 1, L = rifleLine(hp, dir, len, a.pierceW, 0); if (!L.includes(t)) L.unshift(t); else { L.splice(L.indexOf(t), 1); L.unshift(t); } // 조준한 적이 항상 첫 번째(100%)
  const hits = L.slice(0, a.pierce.length); flash(0, 1.7); hero.ch.recoil = 1; G.advN.rifle = (G.advN.rifle || 0) + 1; if (crit) cnt('rifleCrit');
  hits.forEach((e, i) => { const d = base * a.pierce[i] * (bossy(e) ? a.bossK : 1), q = e.g.position; if (i) { G.advDmg += d; cnt('pierceHit'); } if (bossy(e)) cnt('bossHit');
    hurt(e, d, crit ? '#ffe08a' : i ? '#ff9ab8' : '#ffd0e4', crit, { x: hp.x, z: hp.z, kind: 'ranged' }); emit(P, q.x, 1.1, q.z, i ? 4 : 7, i ? 0xff6a9a : 0xffe0c0, 3.5, .25); });
  const last = hits[hits.length - 1].g.position, end = new THREE.Vector3(last.x, 1.1, last.z).addScaledVector(dir, hits.length > 1 ? .6 : .2), f2 = from.clone();
  tracer(f2, end, 0xfff0f4, .09); tracer(f2, end, A.col, .2); emit(P, from.x, from.y, from.z, 6, 0xffe0b0, 3, .2); emit(P, from.x, from.y, from.z, 3, 0xff6a9a, 1.5, .5, 1, .2);
  Snd.gun(from, { rate: .62, vol: 1.25, big: true }); if (crit) Snd.gun(from, { rate: 1.5, vol: .35, ping: true }); }
// 관통 저격 (Q): 0.6초 조준(레이저 조준선) → 직선 위 모든 적 600% (보스 포함, 감쇠 없음) — 굵은 장미빛 빔 + 총구 섬광 + 꽃잎
const SNIPE_AIM = .6, SNIPE_LEN = 32;
function pierceShot(tgt, mul, base) { const A = hero.adv, hp = hero.g.position, dir = new THREE.Vector3(tgt.x - hp.x, 0, tgt.z - hp.z); if (dir.lengthSq() < .01) dir.set(Math.sin(hero.face), 0, Math.cos(hero.face)); dir.normalize();
  const ang = hero.face = Math.atan2(dir.x, dir.z), id = (hero.snipeId || 0) + 1; hero.snipeId = id; hero.snipeA = ang; hero.snipeT = SNIPE_AIM + .3; hero.gunT = SNIPE_AIM + .35; hero.path = []; G.gunN.skill++;
  banner('관통 저격!', A.c, 1000); play(hero.ch, 'ShootStand', { force: true }); ringFx(hp, 1.8, A.col, SNIPE_AIM); Snd.play('draw', { pos: hp, rate: .8, force: true }); Snd.whoosh(hp, SNIPE_AIM, 200, 1800, .3);
  // 조준선: 총구에서 앞으로 가는 가는 붉은 선 (깜빡이며 굵어짐)
  const sight = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1, 5).rotateX(Math.PI / 2).translate(0, 0, .5), ADD(0xff2a5a, .5)); scene.add(sight); let t = 0;
  FX.push(dt => { t += dt; if (!hero || hero.dead > 0 || hero.snipeId !== id || t >= SNIPE_AIM) { scene.remove(sight); sight.geometry.dispose(); sight.material.dispose(); return false; }
    const f = muzzle(0); sight.position.copy(f); sight.lookAt(f.clone().addScaledVector(dir, 10)); sight.scale.set(1 + t * 3, 1 + t * 3, SNIPE_LEN * .6); sight.material.opacity = .25 + .35 * (t / SNIPE_AIM) + Math.sin(t * 40) * .1; return true; });
  later(SNIPE_AIM, () => { if (!hero || hero.dead > 0 || hero.snipeId !== id || !(hero.snipeT > 0)) return; hero.face = ang; const from = muzzle(0), d = base * 6 * mul;
    let n = 0; for (const e of rifleLine(hero.g.position, dir, SNIPE_LEN, 1.1, 0)) { hit(e, d, '#ffe08a', true); n++; cnt('snipeHit'); const q = e.g.position; emit(P, q.x, 1.2, q.z, 12, 0xff6a9a, 5, .4, -3, .6); }
    const end = from.clone().addScaledVector(dir, SNIPE_LEN); end.y = from.y; flash(0, 3); hero.ch.recoil = 1.6; G.shake = Math.max(G.shake || 0, .45); cnt('pierceshot');
    tracer(from, end, 0xffffff, .16); tracer(from, end, A.col, .4); beam(from, end, A.col); ringFx(from, 2.4, A.col, .35); emit(PB, from.x, from.y, from.z, 18, A.col, 6, .45, 0, .6);
    for (let i = 0; i < 6; i++) petals(from.clone().addScaledVector(dir, 3 + i * 4.5).setY(.3), 5, 2.5); petals(from.clone().setY(.2), 10, 3);
    Snd.gun(from, { rate: .45, vol: 1.6, big: true }); Snd.play('boom', { pos: from, vol: .35, rate: 1.7 }); Snd.whoosh(from, .5, 600, 4200, .6); G.advN.snipeN = n; });
  return true; }
function beam(a, b, col) { const L = a.distanceTo(b), m = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5), ADD(col, .85)); m.position.copy(a); m.lookAt(b); m.scale.set(1, 1, L); scene.add(m); let t = 0;
  FX.push(dt => { t += dt; const k = t / .45; m.scale.set(1 + k * 1.5, 1 + k * 1.5, L); m.material.opacity = .85 * (1 - k); if (k < 1) return true; scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; }); }

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
  if (k === 'pierceshot') return pierceShot(tgt, mul, base); // 관통 저격: 0.6초 조준 → 직선 600% 관통
  return false;
}
function comet(d, dmg) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 0), glow(0x9ae8ff, 4)); const s = new THREE.Vector3(d.x - 5, 20, d.z - 3); m.position.copy(s); scene.add(m); let t = 0;
  FX.push(dt => { t += dt; const k = Math.min(1, t / .55); m.position.lerpVectors(s, d, k); m.rotation.x += dt * 9; if (Math.random() < .7) emit(P, m.position.x, m.position.y, m.position.z, 2, 0xcff6ff, 1.5, .4, 2, .4);
    if (k < 1) return true; scene.remove(m); m.geometry.dispose(); for (const e of near(d.x, d.z, 1.7)) hit(e, dmg, '#bff4ff', false); cnt('comet'); emit(P, d.x, .4, d.z, 24, 0xbff4ff, 5, .5, -6, 1); ringFx(d, 1.7, 0x8ae8ff, .3); Snd.play('glass', { pos: d, vol: .35, rate: 1.3 }); return false; }); }
function updSanct(dt) { const h = hero, p = h.g.position; h.sanctT -= dt; h.sanctTick -= dt; h.hp = Math.min(h.max, h.hp + h.max * .03 * dt); G.advHeal = (G.advHeal || 0) + h.max * .03 * dt;
  if (h.sanctTick <= 0) { h.sanctTick = .5; for (const e of near(p.x, p.z, 3.5)) { e.slowT = Math.max(e.slowT, .6); e.slowAmt = Math.max(e.slowAmt || 0, .4); hit(e, stat.dmg() * .5 * (h.sanctMul || 1), '#fff0b0'); cnt('sanctHit'); } emit(P, p.x, .3, p.z, 10, 0xfff0b0, 3, .6, 3, 3); }
  if (h.sanct) { h.sanct.rotation.y += dt; h.sanct.children[1].material.opacity = .6 + Math.sin(G.t * 8) * .2; }
  if (h.sanctT <= 0 || h.dead > 0) { h.sanctT = 0; if (h.sanct) h.sanct.visible = false; } }
export { css };
