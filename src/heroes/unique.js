// ================= 고유 방어구·장신구 궁극기 (자동 발동) =================
// data/items.js UQ[k].tr: onSkill(Q 사용) · every(N초마다, 웨이브 중) · lowHp(체력 임계 통과) · onHit(피격) · shield(무피격 대기 → 보호막) · onDeath(쓰러질 때) · wave(웨이브 누적) · onKill(처치 수)
// 고유 무기 [E] 는 legend.js (전설 스킬 슬롯 재사용). 마을 출정(G.perm)에서 장착한 고유만 동작 → hero.uqs 가 없으면 훅은 아무것도 안 함.
// 효과는 기존 필드만 사용(hurt, slowT/slowAmt, stunT/frozen, hero.hp, 버프 타이머). 별도 시드 난수 → 게임 난수(rand) 소비 없음(회귀 결정성 유지).
import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { QS, mulberry32 } from '../core/util.js';
import { G, heroFx, asSkill } from '../core/state.js';
import { scene } from '../render/scene.js';
import { glow } from '../render/toon.js';
import { P, PB, emit, ringFx, debris } from '../render/vfx.js';
import { hurt as hurt0 } from '../monsters/enemy.js';
import { UQ, awakeMul, awakeCd } from '../data/items.js';
import { banner } from '../ui/hud.js';
import { hero, stat } from './hero.js';

let UR = mulberry32(((+QS.get('rng') || (Math.random() * 1e9 | 0)) ^ 0x5eed11) >>> 0); G.uniqueSeed = s => { UR = mulberry32(s >>> 0); };
G.uqN = {}; G.uqDmg = 0; const FX = heroFx();
const count = k => { G.uqN[k] = (G.uqN[k] || 0) + 1; };
const hurt = (e, d, ...a) => { if (!e.dead) G.uqDmg += d; hurt0(e, d, ...a); };
const alive = () => G.enemies.filter(e => !e.dead && e.dying === undefined);
const d2 = (e, x, z) => { const dx = e.g.position.x - x, dz = e.g.position.z - z; return dx * dx + dz * dz; };
const near = (x, z, r) => alive().filter(e => d2(e, x, z) <= r * r);
const ADD = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const A3 = x => x.a >= 3, pow = x => awakeMul(x.a), cdOf = (x, v) => v * awakeCd(x.a);
const has = tr => hero && hero.uqs ? hero.uqs.filter(x => x.U.tr === tr) : [];

G.uqInit = h => { h.uqs = null; uqInit(h); }; // 테스트: G.uq 바꾼 뒤 다시 적용
// 출정 시(spawnHero) — G.uq = E.uniquesOf(save, hero) { weapon?, armor?, acc? }
export function uqInit(h) {
  const q = G.perm && G.uq ? G.uq : null; if (!q) return; if (q.weapon) h.uqA = q.weapon.a || 0;
  const L = []; for (const sl of ['armor', 'acc']) { const o = q[sl], U = o && UQ[o.k]; if (U && U.tr) L.push({ k: o.k, a: o.a || 0, U, t: 0, cd: 0, n: 0, w: 0, lives: U.tr === 'onDeath' ? (o.a >= 3 ? 2 : U.p.n) : 0 }); }
  if (L.length) h.uqs = L;
}
// ---------- Q 스킬 사용 시 (skills.js castSkill 성공 후) ----------
export function uqOnSkill(tgt) {
  for (const x of has('onSkill')) { count(x.k); const p = x.U.p;
    if (x.k === 'f_acc') { hero.uqRateT = A3(x) ? 8 : p.dur; hero.uqRateM = 1 + p.rate * pow(x); banner('🧚 요정의 춤! 공격 속도 +' + Math.round(p.rate * pow(x) * 100) + '%', '#9affc8', 1000); ringFx(hero.g.position, 2.4, 0x9affc8, .6); emit(P, hero.g.position.x, 1.5, hero.g.position.z, 30, 0xc8ffe0, 4, .7, -2, 1); Snd.play('magic', { pos: hero.g.position, rate: 1.8 }); }
    else if (x.k === 's_acc') blizzard(x, tgt || hero.g.position);
    else if (x.k === 'r_acc') wraiths(x); }
}
// 눈보라 정령: 목표 지점 반경 3.5 — 50% 둔화 + 0.5초마다 공격력 20%
function blizzard(x, at) {
  const p = x.U.p, c = new THREE.Vector3(at.x, 0, at.z), dur = A3(x) ? 6 : p.dur, dmg = () => stat.dmg() * p.mul * pow(x);
  const disk = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40), ADD(0xbfefff)); disk.rotation.x = -Math.PI / 2; disk.position.set(c.x, .3, c.z); disk.material.opacity = .22; scene.add(disk);
  banner('🔔 눈보라 정령!', '#bfefff', 900); Snd.play('glass', { pos: c, rate: 1.6, vol: .6 }); Snd.whoosh(c, dur, 200, 900, .25); let t = 0, tick = 0;
  FX.push(dt => { t += dt; tick -= dt; disk.rotation.z += dt; disk.material.opacity = .16 + Math.sin(t * 6) * .05;
    for (let i = 0; i < 3; i++) { const a = UR() * 6.28, rr = Math.sqrt(UR()) * p.r; emit(P, c.x + Math.cos(a) * rr, 4 + UR() * 2, c.z + Math.sin(a) * rr, 1, 0xeaffff, .6, .9, -6, .4); }
    if (tick <= 0) { tick = .5; for (const e of near(c.x, c.z, p.r)) { e.slowT = Math.max(e.slowT, .7); e.slowAmt = Math.max(e.slowAmt || 0, p.slow); hurt(e, dmg(), '#dff6ff'); } }
    if (t < dur) return true; scene.remove(disk); return false; });
}
// 망령 행진: 망령 구체 n개가 가까운 적 n명을 추적
function wraiths(x) {
  const p = x.U.p, n = A3(x) ? 5 : p.n, h = hero.g.position, L = alive().sort((a, b) => d2(a, h.x, h.z) - d2(b, h.x, h.z)).slice(0, n); if (!L.length) return;
  banner('👑 망령 행진!', '#c8a8ff', 900); Snd.play('magic', { pos: h, rate: .7, force: true });
  L.forEach((e, i) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.4, 1), glow(0xc8a0ff, 5)), a = i / L.length * 6.28; m.position.set(h.x + Math.cos(a) * 1.2, 2, h.z + Math.sin(a) * 1.2); scene.add(m); let t = 0, tg = e;
    FX.push(dt => { t += dt; if (tg.dead || tg.dying !== undefined) { const nx = alive()[0]; if (!nx) { scene.remove(m); return false; } tg = nx; }
      const q = tg.g.position, v = new THREE.Vector3(q.x - m.position.x, 1.4 - m.position.y, q.z - m.position.z), L2 = v.length(), sp = Math.min(L2, (8 + t * 14) * dt);
      m.position.addScaledVector(v.normalize(), sp); emit(P, m.position.x, m.position.y, m.position.z, 2, 0xa07aff, .5, .4, 0, .2);
      if (L2 > .6 && t < 3) return true; scene.remove(m); hurt(tg, stat.dmg() * p.mul * pow(x), '#d8c0ff', true); emit(PB, q.x, 1.4, q.z, 12, 0xb08aff, 4, .5, 0, 1); ringFx(q, 1.2, 0xc8a0ff, .3); return false; }); });
}
// ---------- 피격 (hero.js heroDamage: 방어·메카닉 흡수 이후) ----------
export function uqPreHit(d) {
  for (const x of hero.uqs) { if (x.U.tr === 'shield') { x.t = 0; if (hero.uqShield) { hero.uqShield = false; showShield(false); count(x.k); const p = hero.g.position; debris(p.x, 1.2, p.z, 10, [0x9a9488, 0x6a665e], 5); Snd.play('hitArmor', { pos: p, rate: .7, force: true }); return 0; } } }
  if (hero.uqBarT > 0) d *= 1 - hero.uqBarR; return d;
}
export function uqPostHit(prev) {
  for (const x of hero.uqs) { const p = x.U.p, h = hero.g.position;
    if (x.U.tr === 'onHit' && x.cd <= 0 && UR() < (G.uqForce ? 1 : A3(x) ? .35 : p.chance)) { x.cd = p.icd; count(x.k); ringFx(h, p.r, 0xff6a2a, .4); emit(PB, h.x, .6, h.z, 18, 0xff5a1a, 6, .5, -3, 1.2); Snd.play('boom', { pos: h, vol: .5, rate: 1.4 });
      for (const e of near(h.x, h.z, p.r)) hurt(e, stat.dmg() * p.mul * pow(x), '#ffb05a'); }
    if (x.U.tr === 'lowHp' && x.cd <= 0 && hero.hp > 0 && prev / hero.max > p.th && hero.hp / hero.max <= p.th) { x.cd = cdOf(x, A3(x) ? 30 : p.cd); count(x.k); hero.uqBarT = p.dur; hero.uqBarR = p.red; showBarrier(true);
      banner('🐻 얼음 장벽!', '#bfefff', 1000); Snd.play('glass', { pos: h, force: true }); ringFx(h, p.r, 0xbfefff, .5);
      for (const e of near(h.x, h.z, p.r)) { e.stunT = Math.max(e.stunT || 0, e.E.boss ? .3 : p.frz * pow(x)); e.frozen = true; } }
  }
}
// 쓰러질 때: 불사조 부활 (판당 1회, ★3 2회) → true 면 사망 처리 생략
export function uqOnDeath() {
  const x = has('onDeath').find(o => o.lives > 0); if (!x) return false; x.lives--; count(x.k); const p = x.U.p, h = hero.g.position;
  hero.hp = Math.round(hero.max * p.hp); hero.flash = .2; banner('🦅 불사조 부활!', '#ffb05a', 1400); Snd.play('meteor', { pos: h, force: true, rate: 1.3 }); Snd.play('levelUp', { force: true });
  ringFx(h, p.r + 1, 0xff8a2a, .6); ringFx(h, p.r * .6, 0xffe0a0, .4); emit(PB, h.x, 1, h.z, 40, 0xff6a1a, 9, .9, -4, 2.5); emit(P, h.x, 1, h.z, 120, 0xffc04a, 12, 1, -10, 3); G.shake = Math.max(G.shake || 0, .6);
  for (const e of near(h.x, h.z, p.r)) hurt(e, stat.dmg() * p.mul * pow(x), '#ffb05a', true); return true;
}
// 처치 (enemy.js killEnemy → G.uqKill)
G.uqKill = () => { for (const x of has('onKill')) { x.n++; if (x.n < (A3(x) ? 30 : x.U.p.n)) continue; x.n = 0; count(x.k); hero.skillCd *= .5; if (hero.lsk) hero.lcd = 0;
  banner('♾️ 끝없는 순환! 스킬 재사용 단축', '#ffe08a', 1000); ringFx(hero.g.position, 2.2, 0xffe08a, .5); Snd.play('upgrade', { pos: hero.g.position }); } };
function showBarrier(on) { if (!hero.uqBar) { const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), ADD(0xbfefff)); m.material.opacity = .28; m.position.y = 1.2; hero.uqBar = m; hero.g.add(m); } hero.uqBar.visible = on; }
function showShield(on) { if (!hero.uqSh) { const m = new THREE.Mesh(new THREE.TorusGeometry(1.25, .1, 6, 28), ADD(0xd8d0b8)); m.rotation.x = Math.PI / 2; m.position.y = .5; m.material.opacity = .75; hero.uqSh = m; hero.g.add(m); } hero.uqSh.visible = on; }
// ---------- 매 프레임 (legend.js updLegend 에서) ----------
export function updUnique(dt) {
  for (let i = FX.length - 1; i >= 0; i--) if (!FX[i](dt)) FX.splice(i, 1);
  uniqueHero(dt);
}
export function uniqueHero(dt) { // 영웅별: 고유 장비 쿨다운·트리거
  const h = hero; if (!h || !h.uqs) return; if (h.uqRateT > 0) h.uqRateT -= dt; if (h.uqBarT > 0) { h.uqBarT -= dt; if (h.uqBarT <= 0) showBarrier(false); else h.uqBar.rotation.y += dt * 2; }
  if (h.uqSh && h.uqSh.visible) h.uqSh.rotation.z += dt * 3;
  for (const x of h.uqs) { if (x.cd > 0) x.cd -= dt; const p = x.U.p;
    if (x.U.tr === 'wave' && G.wave !== x.w) { x.w = G.wave; const st = Math.min(p.max, Math.floor(Math.max(0, G.wave - 1) / p.per) * (A3(x) ? 4 : p.add)) * pow(x); if (st > (h.uqAtkP || 0)) { h.uqAtkP = st; h.uqAtk = 1 + st / 100; count(x.k); banner(`🌑 심연 적응 · 공격력 +${Math.round(st)}%`, '#b89aff', 1200); } }
    if (h.dead > 0 || G.phase === 'over') continue;
    if (x.U.tr === 'shield' && !h.uqShield) { x.t += dt; if (x.t >= (A3(x) ? 3.5 : p.wait)) { h.uqShield = true; showShield(true); } }
    if (x.U.tr === 'every' && (G.phase === 'wave' || G.uqForce)) { x.t += dt; if (x.t >= cdOf(x, p.cd)) { x.t = 0; count(x.k); asSkill(x.k === 'c_acc' ? timeStop : spores, x); } }
  }
}
// 포자 구름: 주변 적 공격력 80% + 2초 40% 둔화
function spores(x) { const p = x.U.p, h = hero.g.position, r = A3(x) ? 4.5 : p.r; ringFx(h, r, 0xa8ff6a, .6); ringFx(h, r * .6, 0xd08aff, .45); emit(P, h.x, .8, h.z, 60, 0xb8ff8a, r * 1.6, .9, -1, 1.2); emit(PB, h.x, .5, h.z, 10, 0xc08aff, 3, .8, 1, 1);
  Snd.play('poof', { pos: h, rate: .8, force: true }); for (const e of near(h.x, h.z, r)) { hurt(e, stat.dmg() * p.mul * pow(x), '#c8ff9a'); e.slowT = Math.max(e.slowT, p.slowT); e.slowAmt = Math.max(e.slowAmt || 0, p.slow); } }
// 시간 정지: 맵의 모든 적 1.5초 정지 (보스 0.5초)
function timeStop(x) { const p = x.U.p, t = (A3(x) ? 2 : p.stop) * pow(x); banner('⏳ 시간 정지!', '#ffe9a0', 1200); Snd.play('glass', { rate: .5, force: true }); Snd.play('magic', { rate: .5, force: true }); ringFx(hero.g.position, 8, 0xffe9a0, .8);
  for (const e of alive()) { e.stunT = Math.max(e.stunT || 0, e.E.boss ? .5 : t); emit(P, e.g.position.x, 1.5, e.g.position.z, 6, 0xffe9a0, 1.5, .5, 0, .2); } }
// stat.rate 버프 (hero.js): 요정의 춤
export const uqRate = () => (hero && hero.uqRateT > 0 ? hero.uqRateM : 1);
