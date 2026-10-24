// 챕터 몬스터 능력 (데이터: ETYPES[type].ab). 모든 능력은 예고(고리/빛/아이콘) 후 발동하고, 몬스터가 없으면 아무것도 하지 않는다 (classic 기준선 불변)
//  panic   고블린: 체력 at 이하 → dur초 동안 속도 ×k (1회)
//  split   슬라임: 죽으면 type 몬스터 n마리 (부모 자리에서 튀어나옴)
//  heal    버섯 주술사·숲의 군주: every초마다 windup초 예고(갓 초록빛 + 고리) → 반경 r 동료 최대 체력 pct 회복
//  root    고목 정령·숲의 군주: every초마다 가까운 타워 n개에 windup초 예고(초록 고리) → dur초 동안 타워 공격 정지
//  pack    서리늑대: 반경 r 안에 같은 무리 need마리 이상 → 속도 ×spd, 받는 피해 ×(1-red) (발밑 파란 고리)
//  chill   설인·빙결의 군주: 반경 r 타워 공격속도 ×k (상시, 발밑 서리 고리)
//  snowball 설인·빙결의 군주: every초마다 windup초 눈덩이 들기 → 사거리 안 타워(nova: 여러 개)에 투척, 맞으면 dur초 공격속도 ×k
//  escort/shield 서리 정령: 지상 동료를 따라 날며 every초마다 반경 r 동료 n명에게 보호막(최대 체력 pct, 상한 cap×체력배수, dur초)
//  lavapool 화염의 군주: every초마다 사거리 안 타워 n개에 windup초 예고(주황 고리) → dur초 동안 타워 밑 용암 웅덩이: 공격 정지 + 초당 dps 피해
//  meteor  화염의 군주: every초마다 타워 n개(+영웅)에 빨간 원 예고 windup초 → 운석 낙하(fall초) → 반경 r 타워 tower 피해, 영웅 hero 피해 (보스가 죽어도 예고된 운석은 떨어짐)
//  enrage  화염의 군주: 체력 at 이하 1회 분노 → 속도 ×spd, 능력 주기 ×cd, 운석 +extra (2페이즈)
//  perch   석상 가고일: 껍질이 있을 때 every초마다 windup초 회색 예고 → dur초 석상(무적·정지·타워가 노리지 않음) + 껍질 피해 누적 mend 비율 회복
//  phase   폐허의 망령: every초마다 windup초 깜박임 → dur초 실체 소멸(반투명, 무적, 조준 불가)
//  shield.dark 폐허의 망령: 보호막이 보라색 '어둠 보호막'
//  summon  망국의 왕: every초마다 보스 주변 n곳에 보라 원 예고 windup초 → type 몬스터 소환 (2페이즈 +extra)
//  curse   망국의 왕: every초마다 사거리 안 가장 가까운 타워 + 반경 r 안 타워(최대 max개)에 보라 고리 예고 → dur초 봉인(공격 정지)
//  dread   망국의 왕: 체력 at 이하 1회, windup초 동안 넓어지는 보라 고리 예고 → 반경 r 타워 tower 피해 + stun초 봉인, 영웅 hero 피해, 자신에게 어둠 보호막(최대 체력 shield) → 2페이즈(능력 주기 ×cd)
//  crack   서리 골렘·빙결의 군주: 방어력 armor, 받은 피해(방어 전)가 최대 체력 at 이상이면 깨짐 → 방어력 after, 속도 ×spd (regen초 뒤 재생)
import * as THREE from 'three';
import { Snd } from '../audio/audio.js';
import { G } from '../core/state.js';
import { rand } from '../core/util.js';
import { tileX, tileZ, toTile, inGrid } from '../core/grid.js';
import { scene } from '../render/scene.js';
import { P, PB, debris, dmgText, emit, ringFx } from '../render/vfx.js';
import { play } from '../render/characters.js';
import { glow, mk, shareGeo, toon } from '../render/toon.js';
import { damageTower } from '../world/towers.js';
import { towerRateK as rateK } from '../combat/towerstatus.js';
import { nearestHero, heroesWithin } from '../core/party.js';
const party = () => (G.heroes && G.heroes.length ? G.heroes : G.hero ? [G.hero] : []); // 파티 (일반 판 = [G.hero])
import { spawnEnemy } from './enemy.js';
import { ETYPES } from '../data/monsters.js';
import { banner } from '../ui/hud.js';
import { lavaMat } from '../render/volcano.js';
const TIMED = ['heal', 'root', 'snowball', 'shield', 'lavapool', 'meteor', 'perch', 'phase', 'summon', 'curse'];
const PURPLE = 0xa050ff, DARK = 0x8a3aff;

const alive = () => G.enemies.filter(e => !e.dead && e.dying === undefined);
const st = () => G.stats;
const bump = k => { st()[k] = (st()[k] || 0) + 1; };
const twPos = tw => new THREE.Vector3(tileX(tw.c), 0, tileZ(tw.r));
const txt = (x, y, z, s, c, big) => dmgText(new THREE.Vector3(x, y, z), s, c, big);

function initAbilities(e) {
  const A = e.E.ab, t = {}; e.abT = t;
  for (const k of TIMED) if (A[k]) t[k] = A[k].first ?? A[k].every * .6;
  if (A.crack) { e.armor = A.crack.armor; e.crackAcc = 0; e.cracked = false; }
}
// 이동 방해 없는 상시 능력은 매 프레임, 예고(windup) 중이면 true → 그 자리에서 시전 동작
function abilityTick(e, dt) {
  const A = e.E.ab, g = e.g, t = e.abT; let spdK = 1;
  if (A.panic) { if (!e.panicked && e.hp < e.max * A.panic.at) { e.panicked = true; e.panicT = A.panic.dur; bump('panics'); Snd.whoosh(g.position, .3, 900, 2600, .3); txt(g.position.x, e.E.h + .6, g.position.z, '겁먹음!', '#ffe27a'); }
    if (e.panicT > 0) { e.panicT -= dt; spdK *= A.panic.k; if (rand() < dt * 14) emit(P, g.position.x, e.E.h * .9, g.position.z, 1, 0x9ae0ff, 1.5, .4, -4, .4); } }
  if (A.pack) { e.packScan = (e.packScan || 0) - dt; if (e.packScan <= 0) { e.packScan = .25; let n = 0; for (const o of G.enemies) if (o !== e && !o.dead && o.E.ab && o.E.ab.pack && o.g.position.distanceToSquared(g.position) < A.pack.r * A.pack.r) n++; e.packN = n; e.packOn = n >= A.pack.need; }
    if (e.packOn) spdK *= A.pack.spd; }
  if (A.crack) { const C = A.crack; if (e.cracked) { spdK *= C.spd; if (C.regen) { e.regenT -= dt; if (e.regenT <= 0) reforge(e); } } }
  if (A.chill) chillAura(e, A.chill);
  if (A.escort) escort(e, A.escort, dt);
  if (A.perch && e.statueT > 0) { e.statueT -= dt; if (e.statueT <= 0) statue(e, false); e.spdK = 0; return true; } // 석상: 제자리 (무적)
  if (A.phase && e.phaseT > 0) { e.phaseT -= dt; if (e.phaseT <= 0) phased(e, false); }
  if (A.dread && !e.dreaded && !e.cast && e.hp > 0 && e.hp < e.max * A.dread.at) { e.dreaded = true; const p = g.position; e.cast = { k: 'dread', S: A.dread, t: A.dread.windup, mark: dreadMark(p, A.dread.r) }; e.castT = A.dread.windup;
    play(e.m, 'Taunt', { speed: .8 }); Snd.roar(p); G.shake = Math.max(G.shake || 0, .4); banner(`💀 ${e.E.n}: 어둠의 파동! — 보라 고리 안의 타워·영웅이 곧 피해를 입어요`, '#c08aff', 2600); txt(p.x, e.E.h + 1.2, p.z, '💀 어둠의 파동', '#d0a0ff', true); }
  if (A.enrage) { if (!e.enraged && e.hp > 0 && e.hp < e.max * A.enrage.at) enrage(e, A.enrage); if (e.enraged) { spdK *= A.enrage.spd; if (rand() < dt * 18) emit(P, g.position.x + (rand() - .5) * 2, e.E.h * (.3 + rand() * .6), g.position.z + (rand() - .5) * 2, 1, 0xff7a2a, 1.5, .6, 3, .4); } }
  e.spdK = spdK;
  // 예고 → 발동
  if (e.cast) { const c = e.cast; c.t -= dt; e.castT = c.t; castFx(e, c, dt); if (c.t <= 0) { e.cast = null; e.castT = 0; fire(e, c); } return !e.E.fly; }
  for (const k of TIMED) { if (!A[k]) continue; t[k] -= dt; if (t[k] > 0) continue;
    const c = begin(e, k, A[k]); if (c) { e.cast = c; t[k] = A[k].every * (e.enraged ? A.enrage.cd : e.phase2 ? A.dread.cd : 1); return !e.E.fly; } t[k] = 1; } // 대상이 없으면 1초 뒤 다시
  return false;
}
// ---- 시전 시작 (대상 선정 + 예고) ----
function towersNear(p, r, n, skip) { return G.towers.filter(tw => !tw.dead && !skip(tw)).map(tw => [tw, Math.hypot(tileX(tw.c) - p.x, tileZ(tw.r) - p.z)]).filter(x => x[1] <= r).sort((a, b) => a[1] - b[1]).slice(0, n).map(x => x[0]); }
function begin(e, k, S) {
  const g = e.g, p = g.position;
  if (k === 'root') { const tws = towersNear(p, S.r, S.n, tw => tw.rootT > 0 || tw.warnT > 0); if (!tws.length) return null;
    for (const tw of tws) { tw.warnT = S.windup; tw.warnC = 0x7aff4a; ringFx(twPos(tw), 1.6, 0x7aff4a, S.windup); } play(e.m, 'Taunt', { speed: 1.2 }); Snd.play('digWood', { pos: p, rate: .6 }); return { k, S, t: S.windup, tws }; }
  if (k === 'snowball') { const tws = towersNear(p, S.range, S.nova || 1, tw => tw.warnT > 0); if (!tws.length) return null;
    for (const tw of tws) { tw.warnT = S.windup + .6; tw.warnC = 0x8ad8ff; } if (e.m.snowball) e.m.snowball.visible = true; play(e.m, '2H_Melee_Attack_Chop', { speed: .9 }); return { k, S, t: S.windup, tws }; }
  if (k === 'heal') { const hurtN = alive().filter(o => o.hp < o.max * .98 && o.g.position.distanceToSquared(p) <= S.r * S.r).length; if (!hurtN) return null;
    ringFx(p, S.r, 0x7aff7a, S.windup); play(e.m, 'Cheer', { speed: 1.4 }); return { k, S, t: S.windup }; }
  if (k === 'shield') { const L = alive().filter(o => o !== e && !o.E.fly && o.g.position.distanceToSquared(p) <= S.r * S.r && !(o.shield > 0)); if (!L.length) return null;
    L.sort((a, b) => a.g.position.distanceToSquared(p) - b.g.position.distanceToSquared(p)); return { k, S, t: .5, tgt: L.slice(0, S.n) }; }
  if (k === 'lavapool') { const tws = towersNear(p, S.range, S.n, tw => tw.meltT > 0 || tw.warnT > 0); if (!tws.length) return null;
    for (const tw of tws) { tw.warnT = S.windup; tw.warnC = 0xff6a1a; ringFx(twPos(tw), 1.8, 0xff5a1a, S.windup); } play(e.m, 'Taunt', { speed: 1.1 }); Snd.play('meteorCast', { pos: p, rate: .6, vol: .7 }); return { k, S, t: S.windup, tws }; }
  if (k === 'meteor') { const n = S.n + (e.enraged ? e.E.ab.enrage.extra : 0), pts = towersNear(p, S.range, n, () => false).map(twPos), h = nearestHero(party(), p.x, p.z); // 파티: 가장 가까운 영웅을 노림
    if (S.heroes) { const k = S.heroes + (e.enraged ? e.E.ab.enrage.extra : 0); for (const o of party().filter(o => o.dead <= 0 && o.g.position.distanceTo(p) <= S.range).sort((a, b) => a.g.position.distanceToSquared(p) - b.g.position.distanceToSquared(p)).slice(0, k)) pts.push(o.g.position.clone().setY(0)); } // 🗼 탑 sp_fire: 가까운 영웅 여러 명
    else if (h && h.dead <= 0 && h.g.position.distanceTo(p) <= S.range) pts.push(h.g.position.clone().setY(0)); if (!pts.length) return null;
    for (const q of pts) meteors.push({ q, t: -S.windup, S, mark: meteorMark(q, S.r), m: null }); play(e.m, 'Taunt', { speed: 1.3 }); Snd.play('meteorCast', { pos: p, rate: .5 });
    txt(p.x, e.E.h + 1, p.z, '☄ 화염 운석!', '#ff8a4a', true); return { k, S, t: Math.min(1, S.windup) }; }
  if (k === 'perch') { if (e.cracked) return null; ringFx(p, 1.8, 0xb0a8c8, S.windup); txt(p.x, e.E.h + .6, p.z, '🗿 석상화', '#d8d0f0'); Snd.play('breakRock', { pos: p, rate: 1.8, vol: .35 }); return { k, S, t: S.windup }; }
  if (k === 'phase') { return { k, S, t: S.windup }; }
  if (k === 'summon') { const n = S.n + (e.phase2 ? S.extra : 0), pts = []; for (let i = 0; i < n; i++) { const a = g.rotation.y + (i - (n - 1) / 2) * .95, q = new THREE.Vector3(p.x + Math.sin(a) * S.r, 0, p.z + Math.cos(a) * S.r);
      const [c, r] = toTile(q.x, q.z); if (!inGrid(c, r)) { q.set(p.x, 0, p.z); } pts.push({ q, mark: dreadMark(q, .9, true) }); }
    play(e.m, 'Cheer', { speed: 1.1 }); Snd.play('magic', { pos: p, rate: .45 }); txt(p.x, e.E.h + 1, p.z, '💀 근위병 소환!', '#d0a0ff', true); return { k, S, t: S.windup, pts }; }
  if (k === 'curse') { const first = towersNear(p, S.range, 1, tw => tw.curseT > 0 || tw.warnT > 0)[0]; if (!first) return null; const c0 = twPos(first);
    const tws = towersNear(c0, S.r, S.max, tw => tw.curseT > 0 || tw.warnT > 0); for (const tw of tws) { tw.warnT = S.windup; tw.warnC = PURPLE; }
    ringFx(c0, S.r, PURPLE, S.windup); play(e.m, 'Taunt', { speed: 1.2 }); Snd.play('meteorCast', { pos: p, rate: .4, vol: .6 }); txt(c0.x, 3.6, c0.z, '💀 저주 예고', '#d0a0ff', true); return { k, S, t: S.windup, tws }; }
  return null;
}
// ---- 화염의 군주: 분노 · 운석 · 용암 웅덩이 ----
function enrage(e, S) { e.enraged = true; bump('enrages'); const p = e.g.position; for (const k of TIMED) if (e.abT[k] !== undefined) e.abT[k] = Math.min(e.abT[k], 2.5);
  G.shake = Math.max(G.shake || 0, .6); ringFx(p, 6, 0xff5a1a, .9); emit(PB, p.x, e.E.h * .5, p.z, 40, 0xff6a1a, 7, .9, -3, 2.5); banner(`🔥 ${e.E.n} 분노! — 더 빠르고 운석이 늘어납니다`, '#ff7a3a', 2600);
  Snd.roar(p); if (!e.m.enrRing) e.m.enrRing = groundRing(e.g, 2.4, 0xff5a1a, .55); }
const meteors = []; let _mg, _mm, _rg, _dg;
function meteorMark(q, r) { const g = new THREE.Group(); g.position.set(q.x, .14, q.z);
  const ring = new THREE.Mesh(_rg ||= new THREE.RingGeometry(.86, 1, 40), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: .9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const disc = new THREE.Mesh(_dg ||= new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0xff2a0a, transparent: true, opacity: .2, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  ring.rotation.x = disc.rotation.x = -Math.PI / 2; g.add(ring, disc); g.scale.setScalar(r); g.userData = { ring, disc }; scene.add(g); return g; }
function updMeteors(dt) { for (let i = meteors.length - 1; i >= 0; i--) { const o = meteors[i], S = o.S; o.t += dt; const q = o.q;
  if (o.mark) { const u = o.mark.userData, k = Math.min(1, Math.max(0, (o.t + S.windup) / (S.windup + S.fall))); u.disc.material.opacity = .14 + .22 * k + .1 * Math.abs(Math.sin(G.t * 12)); u.ring.scale.setScalar(1.25 - .25 * k); }
  if (o.t >= 0 && !o.m) { o.m = mk(_mg ||= new THREE.SphereGeometry(.6, 14, 10), _mm ||= glow(0xff7a2a, 1.3), q.x + 4, 20, q.z - 3, scene, .03); Snd.whoosh(q, .5, 200, 900, .5); }
  if (o.m) { const f = Math.min(1, o.t / S.fall); o.m.position.set(q.x + 4 * (1 - f), .4 + 19.6 * (1 - f), q.z - 3 * (1 - f)); emit(P, o.m.position.x, o.m.position.y, o.m.position.z, 2, 0xff8a3a, 1, .45, 2, .5); }
  if (o.t >= S.fall) { meteors.splice(i, 1); if (o.m) scene.remove(o.m); if (o.mark) scene.remove(o.mark); bump('meteors');
    emit(P, q.x, .6, q.z, 40, 0xff7a2a, 7, .6, -8, 1.5); emit(PB, q.x, 1, q.z, 14, 0xff5a1a, 5, .7, -4, 1.4); debris(q.x, .5, q.z, 10, [0x2a2020, 0xff7a2a, 0x5a3a30], 6); ringFx(q, S.r, 0xff6a2a, .4);
    G.shake = Math.max(G.shake || 0, .3); Snd.play('boom', { pos: q, vol: .7 });
    for (const tw of G.towers) if (!tw.dead && Math.hypot(tileX(tw.c) - q.x, tileZ(tw.r) - q.z) <= S.r) { damageTower(tw, S.tower, { x: q.x, z: q.z, kind: 'fire' }); bump('meteorHits'); }
    if (G.heroDamage) for (const h of heroesWithin(party(), q.x, q.z, S.r)) { G.heroDamage(S.hero, h); bump('meteorHero'); } } } } // 파티: 맞은 영웅마다
function castFx(e, c) { const p = e.g.position;
  if (c.k === 'heal' && e.m.capMat) { const f = 1 - c.t / c.S.windup; e.m.capMat.emissive.setHex(0x3aff3a).multiplyScalar(.3 + f * .9); if (e.m.cap) e.m.cap.scale.setScalar((e.m.cap.userData.s0 ??= e.m.cap.scale.x) * (1 + f * .25)); }
  if (c.k === 'heal' && rand() < .5) emit(P, p.x + (rand() - .5) * 2, .4, p.z + (rand() - .5) * 2, 1, 0x8aff6a, 1.2, .6, 2, .3);
  if (c.k === 'root' && rand() < .6) for (const tw of c.tws) emit(P, tileX(tw.c) + (rand() - .5) * 1.4, .2, tileZ(tw.r) + (rand() - .5) * 1.4, 1, 0x6ad03a, 2, .5, 3, .3);
  if (c.k === 'shield' && rand() < .5) emit(P, p.x, e.m.inner ? e.m.inner.position.y : 2, p.z, 2, 0xbff4ff, 2, .4, 0, .4);
  if (c.k === 'lavapool' && rand() < .7) for (const tw of c.tws) emit(P, tileX(tw.c) + (rand() - .5) * 1.6, .2, tileZ(tw.r) + (rand() - .5) * 1.6, 1, 0xff6a1a, 1.5, .5, 3, .3);
  if (c.k === 'phase' && e.m.inner) e.m.inner.visible = Math.sin(G.t * 40) > -.2; // 깜박임 = 곧 실체 소멸
  if (c.k === 'perch' && rand() < .6) emit(P, p.x + (rand() - .5) * 1.4, e.E.h * rand(), p.z + (rand() - .5) * 1.4, 1, 0xb0a8c8, 1, .5, -2, .3);
  if (c.k === 'curse' && rand() < .7) for (const tw of c.tws) emit(P, tileX(tw.c) + (rand() - .5) * 1.4, 3 + rand(), tileZ(tw.r) + (rand() - .5) * 1.4, 1, PURPLE, 1, .6, -1, .3);
  if (c.k === 'summon') for (const o of c.pts) { o.mark.userData.disc.material.opacity = .2 + .25 * (1 - c.t / c.S.windup); if (rand() < .4) emit(P, o.q.x, .3, o.q.z, 1, 0x6affe8, 1.5, .6, 3, .4); }
  if (c.k === 'dread') { const f = 1 - c.t / c.S.windup, u = c.mark.userData; c.mark.scale.setScalar(c.S.r * (.25 + .75 * f)); u.disc.material.opacity = .1 + .2 * f + .08 * Math.abs(Math.sin(G.t * 10)); if (rand() < .8) emit(P, p.x + (rand() - .5) * 3, e.E.h * .7, p.z + (rand() - .5) * 3, 2, DARK, 3, .6, 1, .6); }
  if ((c.k === 'lavapool' || c.k === 'meteor') && rand() < .5) emit(P, p.x, e.E.h * .8, p.z, 2, 0xff8a3a, 2.5, .5, 2, .8);
}
// ---- 발동 ----
function fire(e, c) {
  const S = c.S, p = e.g.position;
  if (c.k === 'root') { for (const tw of c.tws) { if (tw.dead) continue; tw.rootT = S.dur; tw.warnT = 0; const q = twPos(tw); bump('roots');
      emit(PB, q.x, .5, q.z, 16, 0x6ad03a, 4, .6, -4, 1.2); debris(q.x, .6, q.z, 8, [0x6a4a2a, 0x4aa83a], 4); txt(q.x, 3.4, q.z, '🌿 속박!', '#9aff6a', true); Snd.play('breakWood', { pos: q, rate: .8, vol: .7 }); } }
  if (c.k === 'snowball') { if (e.m.snowball) e.m.snowball.visible = false; const from = p.clone(); from.y = e.E.h * .9;
    for (const tw of c.tws) if (!tw.dead) throwBall(from, tw, S); Snd.whoosh(p, .35, 400, 1600, .4); }
  if (c.k === 'lavapool') { for (const tw of c.tws) { if (tw.dead) continue; tw.meltT = S.dur; tw.meltDps = S.dps; tw.meltAcc = 0; tw.warnT = 0; const q = twPos(tw); bump('pools');
      emit(PB, q.x, .4, q.z, 14, 0xff6a1a, 4, .6, -4, 1.2); emit(P, q.x, .4, q.z, 20, 0xffa040, 4, .5, -6, 1.2); txt(q.x, 3.4, q.z, '🔥 용암 웅덩이!', '#ffa060', true); Snd.play('boom', { pos: q, rate: 1.5, vol: .45 }); } }
  if (c.k === 'heal') { if (e.m.capMat) { e.m.capMat.emissive.copy(e.m.capMat.userData.e); e.m.cap.scale.setScalar(e.m.cap.userData.s0); } let n = 0;
    for (const o of alive()) { if (o.g.position.distanceToSquared(p) > S.r * S.r || o.hp >= o.max) continue; const h = Math.min(o.max - o.hp, o.max * S.pct); o.hp += h; n++; st().healed = (st().healed || 0) + h;
      const q = o.g.position; emit(P, q.x, (o.E.fly ? 3 : o.E.h * .6), q.z, 8, 0x7aff6a, 2.5, .6, 2, .8); if (n <= 6) txt(q.x, (o.E.fly ? 3.6 : o.E.h + .4), q.z, '+' + Math.round(h), '#8aff7a'); }
    ringFx(p, S.r, 0x9aff7a, .45); Snd.play('meteorCast', { pos: p, rate: 1.6, vol: .45 }); bump('heals'); }
  if (c.k === 'shield') { for (const o of c.tgt) { if (o.dead || o.dying !== undefined) continue; const amt = Math.min(o.max * S.pct, S.cap * (G.hpMul || 1)); o.shield = amt; o.shieldMax = amt; o.shieldT = S.dur; o.shDark = !!S.dark; bubble(o, true);
      const a = e.g.position.clone(); a.y = e.m.inner.position.y; const b = o.g.position.clone(); b.y = o.E.h * .6; beam(a, b); bump('shields'); }
    Snd.play('magic', { pos: p, rate: .7, vol: .6 }); }
  if (c.k === 'perch') { statue(e, true, S.dur); e.crackAcc = Math.max(0, (e.crackAcc || 0) * (1 - S.mend)); bump('perches'); }
  if (c.k === 'phase') { phased(e, true, S.dur); bump('phases'); }
  if (c.k === 'summon') { for (const o of c.pts) { scene.remove(o.mark); const [cc, rr] = toTile(o.q.x, o.q.z), ch = spawnEnemy(S.type, (G.hpMul || 1) * S.hp, { x: o.q.x, z: o.q.z, tile: inGrid(cc, rr) ? [cc, rr] : e.tile.slice() });
      ch.stunT = .6; ch.kup = { t: 0, dur: .6, h: 1.2 }; emit(PB, o.q.x, .5, o.q.z, 16, DARK, 4, .6, -3, 1); emit(P, o.q.x, .4, o.q.z, 12, 0x6affe8, 3, .5, 2, .8); bump('summons'); } Snd.play('bones', { pos: p, rate: .7 }); }
  if (c.k === 'curse') { for (const tw of c.tws) { if (tw.dead) continue; tw.curseT = S.dur; tw.warnT = 0; const q = twPos(tw); bump('curses');
      emit(PB, q.x, 1.5, q.z, 16, DARK, 3, .7, 2, 1.2); txt(q.x, 3.6, q.z, '💀 봉인!', '#d0a0ff', true); } Snd.play('glass', { pos: p, rate: .5, vol: .5 }); }
  if (c.k === 'dread') { scene.remove(c.mark); e.phase2 = true; bump('dreads'); for (const k of TIMED) if (e.abT[k] !== undefined) e.abT[k] = Math.min(e.abT[k], 3);
    G.shake = Math.max(G.shake || 0, .8); ringFx(p, S.r, DARK, .7); ringFx(p, S.r * .6, 0x6affe8, .5); emit(PB, p.x, 1.5, p.z, 60, DARK, 9, .9, -2, 3); Snd.play('boom', { pos: p, force: true });
    for (const tw of G.towers) if (!tw.dead && Math.hypot(tileX(tw.c) - p.x, tileZ(tw.r) - p.z) <= S.r) { damageTower(tw, S.tower, { x: p.x, z: p.z, kind: 'dark' }); if (!tw.dead) tw.curseT = Math.max(tw.curseT || 0, S.stun); bump('dreadHits'); }
    if (G.heroDamage) for (const h of heroesWithin(party(), p.x, p.z, S.r)) { G.heroDamage(S.hero, h); bump('dreadHero'); }
    const amt = e.max * S.shield; e.shield = amt; e.shieldMax = amt; e.shieldT = 9; e.shDark = true; bubble(e, true); banner(`💀 ${e.E.n} 2페이즈 — 어둠 보호막 · 소환이 늘어납니다`, '#c08aff', 2400);
    if (!e.m.enrRing) e.m.enrRing = groundRing(e.g, 2.6, DARK, .55); }
}
// 석상(가고일) · 실체 소멸(망령): 무적(immT) + 타워/영웅이 노리지 않음. 석상은 회색 돔, 망령은 반투명
let _domeG, _domeM;
function statue(e, on, dur = 0) { const p = e.g.position; e.statueT = on ? dur : 0; e.immT = on ? G.t + dur : 0;
  if (on && !e.m.dome) { _domeG ||= shareGeo(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * .55)); _domeM ||= toon(0x8a849a, { transparent: true, opacity: .78 }); const d = new THREE.Mesh(_domeG, _domeM); d.scale.set(e.E.h * .42, e.E.h * .95, e.E.h * .42); e.g.add(d); e.m.dome = d; }
  if (e.m.dome) e.m.dome.visible = on; if (on) { debris(p.x, e.E.h * .5, p.z, 6, [0x8a849a, 0x6a6478], 3); Snd.play('breakRock', { pos: p, rate: 1.2, vol: .45 }); txt(p.x, e.E.h + .7, p.z, '🗿 석상 (무적)', '#d8d0f0', true); }
  else { emit(P, p.x, e.E.h * .6, p.z, 14, 0xb0a8c8, 4, .5, -6, 1); } }
function phased(e, on, dur = 0) { e.phaseT = on ? dur : 0; e.immT = on ? G.t + dur : 0; const inner = e.m.inner; if (!inner) return; inner.visible = true;
  inner.traverse(o => { if (!o.isMesh) return; if (o.userData.ol) { o.visible = !on; return; } o.material.transparent = on || o.material.userData.tr; o.material.opacity = on ? .28 : 1; o.material.depthWrite = !on; });
  if (on) { const p = e.g.position; emit(P, p.x, inner.position.y, p.z, 12, PURPLE, 3, .5, 0, .6); } }
// 보라 원 예고 (어둠의 파동 / 소환 자리) — 운석 표시와 같은 구조, 색만 보라
function dreadMark(q, r, small) { const g = new THREE.Group(); g.position.set(q.x, .15, q.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 48), new THREE.MeshBasicMaterial({ color: small ? 0x6affe8 : PURPLE, transparent: true, opacity: .9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: DARK, transparent: true, opacity: .15, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  ring.rotation.x = disc.rotation.x = -Math.PI / 2; g.add(ring, disc); g.scale.setScalar(r); g.userData = { ring, disc, dread: 1 }; scene.add(g); return g; }
// 눈덩이 (포물선) — 맞은 타워: 빙결(공격속도 ×k) + 약한 피해
const balls = [];
function throwBall(from, tw, S) { const m = mk(geoBall(), matBall(), from.x, from.y, from.z, scene, .02); balls.push({ m, from: from.clone(), tw, to: twPos(tw).setY(2.2), t: 0, dur: .65, S }); }
let _gb, _mb; const geoBall = () => _gb || (_gb = new THREE.SphereGeometry(.32, 14, 10)), matBall = () => _mb || (_mb = toon(0xffffff, { emissive: 0x8ac8ff, emissiveIntensity: .35 }));
function updBalls(dt) { for (let i = balls.length - 1; i >= 0; i--) { const b = balls[i]; b.t += dt; const f = Math.min(1, b.t / b.dur);
  b.m.position.lerpVectors(b.from, b.to, f); b.m.position.y += Math.sin(f * Math.PI) * 2.4; b.m.rotation.x += dt * 9;
  if (rand() < .5) emit(P, b.m.position.x, b.m.position.y, b.m.position.z, 1, 0xffffff, .6, .4, -2, .2);
  if (f >= 1) { scene.remove(b.m); balls.splice(i, 1); const tw = b.tw; if (tw.dead) continue; tw.frostT = b.S.dur; tw.frostK = b.S.k; tw.warnT = 0; bump('frosts'); const q = b.to;
    emit(PB, q.x, q.y, q.z, 18, 0xdaf6ff, 5, .6, -6, 1.2); emit(P, q.x, q.y, q.z, 24, 0xffffff, 4, .5, -8, 1); txt(q.x, 3.4, q.z, '❄ 빙결!', '#bfe8ff', true); Snd.play('glass', { pos: q, vol: .45, rate: 1.3 }); damageTower(tw, 12, { x: q.x, z: q.z, kind: 'snow' }); } } }
function chillAura(e, S) { const p = e.g.position; for (const tw of G.towers) { if (tw.dead) continue; const d = Math.hypot(tileX(tw.c) - p.x, tileZ(tw.r) - p.z); if (d > S.r) continue;
  if (!(tw.chillT > G.t) || S.k < tw.chillK) tw.chillK = S.k; tw.chillT = G.t + .12; } if (!e.m.chillRing) e.m.chillRing = groundRing(e.g, S.r, 0x9ad8ff, .35); }
// 비행 호위: 가장 가까운 지상 동료 위로 (없으면 코어로)
function escort(e, S, dt) { e.escT = (e.escT || 0) - dt; if (e.escT <= 0 || (e.esc && (e.esc.dead || e.esc.dying !== undefined))) { e.escT = .5; let best = null, bd = S.r * S.r;
  for (const o of G.enemies) { if (o === e || o.dead || o.E.fly || o.dying !== undefined || o.state === 'spawn') continue; const d = o.g.position.distanceToSquared(e.g.position); if (d < bd) { bd = d; best = o; } } e.esc = best; }
  e.flyTo = e.esc ? e.esc.g.position : null; }
// ---- 방어력 / 보호막 / 갑옷 깨짐 ----
function armorOf(e) { const base = e.armor !== undefined ? e.armor : (e.E.armor || 0); return e.packOn ? 1 - (1 - base) * (1 - e.E.ab.pack.red) : base; }
function crackHit(e, raw) { const C = e.E.ab.crack; if (e.cracked) return; e.crackAcc += raw; const f = e.crackAcc / (e.max * C.at);
  if (e.m.iceMat) e.m.iceMat.userData.e.setHex(e.E.crystal ? e.E.crystal[1] : 0x3aa8ff).multiplyScalar(.7 * (1 - Math.min(1, f) * .7));
  if (f >= 1) { e.cracked = true; e.armor = C.after; e.regenT = C.regen || 0; bump('cracks'); if (e.m.iceParts) e.m.iceParts.forEach(x => x.visible = false); const p = e.g.position;
    const lava = !!e.E.crystal; debris(p.x, e.E.h * .7, p.z, 16, lava ? [0x3a2420, 0xff7a2a, 0x5a3a30] : [0xc8f0ff, 0x8ad8ff, 0xffffff], 6); emit(PB, p.x, e.E.h * .6, p.z, 24, lava ? 0xff7a2a : 0x9ae0ff, 6, .6, -6, 1.5); txt(p.x, e.E.h + .7, p.z, (e.E.shell || '갑옷') + ' 파괴!', lava ? '#ffb070' : '#9ae8ff', true); Snd.play('glass', { pos: p, force: true }); Snd.play('breakRock', { pos: p, rate: 1.4, vol: .6 }); } }
function reforge(e) { const C = e.E.ab.crack; e.cracked = false; e.armor = C.armor; e.crackAcc = 0; if (e.m.iceParts) e.m.iceParts.forEach(x => x.visible = true); if (e.m.iceMat) e.m.iceMat.userData.e.setHex(e.E.crystal ? e.E.crystal[1] : 0x3aa8ff).multiplyScalar(.7);
  const p = e.g.position; emit(PB, p.x, e.E.h * .6, p.z, 30, 0xbff4ff, 3, .8, 2, 2); txt(p.x, e.E.h + .7, p.z, (e.E.shell || '얼음 갑옷') + ' 재생', '#bff4ff', true); Snd.play('magic', { pos: p, rate: .5 }); }
function absorbShield(e, dmg) { const a = Math.min(e.shield, dmg); e.shield -= a; st().absorbed = (st().absorbed || 0) + a; if (e.shBub) e.shBub.userData.hit = .15;
  if (e.shield <= 0) { e.shield = 0; bubble(e, false); const p = e.g.position; emit(P, p.x, e.E.h * .6, p.z, 14, 0xbff4ff, 4, .4, -4, 1); Snd.play('glass', { pos: p, vol: .35, rate: 1.6 }); }
  else if (!(e.shTxt > G.t)) { e.shTxt = G.t + .7; const p = e.g.position; txt(p.x, e.E.h + .5, p.z, e.shDark ? '어둠 보호막' : '보호막', e.shDark ? '#d0a0ff' : '#bff4ff'); } return dmg - a; }
// 죽음: 분열
const pend = [];
function onKilled(e) { const S = e.E.ab && e.E.ab.split; if (!S) return; const [c, r] = toTile(e.g.position.x, e.g.position.z);
  pend.push({ S, x: e.g.position.x, z: e.g.position.z, tile: inGrid(c, r) ? [c, r] : e.tile.slice(), hpMul: e.max / e.E.hp, rot: e.g.rotation.y }); }
const pendingSpawns = () => pend.length;
function spawnPending() { while (pend.length) { const o = pend.shift(); bump('splits');
  for (let k = 0; k < o.S.n; k++) { const a = o.rot + Math.PI / 2 + (k / Math.max(1, o.S.n - 1) - .5) * Math.PI * .9 * (o.S.n > 1 ? 1 : 0), ch = spawnEnemy(o.S.type, o.hpMul, { x: o.x + Math.sin(a) * .45, z: o.z + Math.cos(a) * .45, tile: o.tile });
    ch.stunT = .4; ch.kup = { t: 0, dur: .4, h: .9 }; }
  emit(P, o.x, .6, o.z, 18, ETYPES[o.S.type]?.col || 0x8aff6a, 4, .5, -8, 1); Snd.play('digSoft', { pos: { x: o.x, z: o.z }, rate: 1.7, vol: .6 }); } }
// ---- 표시 (보호막 거품, 고리, 타워 상태) ----
let _bubG, _bubM; function bubble(e, on) { if (on && !e.shBub) { _bubG ||= shareGeo(new THREE.SphereGeometry(1, 20, 14)); _bubM ||= new THREE.MeshBasicMaterial({ color: 0x7ac8ff, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const b = new THREE.Mesh(_bubG, _bubM.clone()); if (e.shDark) b.material.color.setHex(DARK); b.scale.setScalar(Math.max(.8, e.E.h * .55)); b.position.y = e.E.h * .5; b.userData.hit = 0; e.g.add(b); e.shBub = b; }
  if (e.shBub) { e.shBub.visible = on; if (on) e.shBub.material.color.setHex(e.shDark ? DARK : 0x7ac8ff); } }
function groundRing(g, r, color, op) { const m = new THREE.Mesh(new THREE.RingGeometry(r * .93, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .12; g.add(m); return m; }
function beam(a, b) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); scene.add(l); G.fxs.push({ m: l, t: 0, dur: .3, kind: 'fade' }); }
// 타워 위 상태 장식: 뿌리(속박), 얼음(빙결/한기), 예고 고리 — 타워 anchor 에 붙임, 공유 재질
const TM = {}; const tm = (k, f) => TM[k] || (TM[k] = f());
function towerFx(tw) { if (tw.dfx) return tw.dfx; const g = new THREE.Group(); tw.anchor.add(g);
  const roots = new THREE.Group(), bark = tm('bark', () => toon(0x6a4a2a)), leaf = tm('leaf', () => toon(0x4aa83a));
  for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28, p = new THREE.Group(); p.position.set(Math.cos(a) * .95, 0, Math.sin(a) * .95); p.rotation.y = -a; roots.add(p);
    const v = mk(tm('rootG', () => new THREE.TorusGeometry(.6, .1, 6, 12, Math.PI * .9)), bark, 0, .1, 0, p, .02); v.rotation.y = Math.PI / 2; v.rotation.z = Math.PI / 2 + .3;
    mk(tm('leafG', () => new THREE.SphereGeometry(.16, 8, 6)), leaf, 0, 1.15, -.35, p, .015).scale.set(1, .5, 1.4); }
  const ice = new THREE.Group(), im = tm('ice', () => toon(0xd8f4ff, { emissive: 0x3a9ae0, emissiveIntensity: .6, transparent: true, opacity: .85 }));
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28, c = mk(tm('iceG', () => new THREE.OctahedronGeometry(.3)), im, Math.cos(a) * .85, .3 + (k % 3) * .35, Math.sin(a) * .85, ice, .02); c.scale.set(.6, 1.8, .6); c.rotation.z = Math.cos(a) * .3; c.rotation.x = Math.sin(a) * .3; }
  const flake = mk(tm('flakeG', () => new THREE.OctahedronGeometry(.22)), tm('flake', () => glow(0xbff4ff, 1.4)), 0, 4.3, 0, g, .015);
  const warn = new THREE.Mesh(tm('warnG', () => new THREE.RingGeometry(1.15, 1.4, 40)), new THREE.MeshBasicMaterial({ color: 0x7aff4a, transparent: true, opacity: .8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); warn.rotation.x = -Math.PI / 2; warn.position.y = .15;
  const pool = new THREE.Mesh(tm('poolG', () => new THREE.CircleGeometry(1.3, 28)), lavaMat); pool.rotation.x = -Math.PI / 2; pool.position.y = .09;
  const curse = new THREE.Group(), cm = tm('curseM', () => glow(DARK, 1.1)), sk = tm('skullM', () => toon(0xe8e0ff, { emissive: 0x6a3ad0, emissiveIntensity: .6 })); // 저주: 머리 위 해골 + 보라 결정 고리
  mk(tm('skG', () => new THREE.SphereGeometry(.34, 14, 10)), sk, 0, 0, 0, curse, .02); for (const sx of [-1, 1]) mk(tm('skE', () => new THREE.SphereGeometry(.09, 8, 6)), cm, sx * .13, .02, .28, curse, 0);
  for (let k = 0; k < 4; k++) { const a = k / 4 * 6.28, o = mk(tm('cOct', () => new THREE.OctahedronGeometry(.14)), cm, Math.cos(a) * .6, -.1, Math.sin(a) * .6, curse, .015); o.scale.y = 1.8; }
  const cring = new THREE.Mesh(tm('cRingG', () => new THREE.RingGeometry(1.2, 1.45, 40)), new THREE.MeshBasicMaterial({ color: DARK, transparent: true, opacity: .6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); cring.rotation.x = -Math.PI / 2; cring.position.y = .17;
  g.add(roots, ice, warn, pool, curse, cring); roots.visible = ice.visible = flake.visible = warn.visible = pool.visible = curse.visible = cring.visible = false; return (tw.dfx = { g, roots, ice, flake, warn, pool, curse, cring }); }
// 타워 공격 속도 배수 (속박 = 0). 디버프가 한 번도 없던 타워는 항상 정확히 1
const towerRateK = tw => rateK(tw, G.t); // 디버그·테스트용 (G.towerRateK) — 기준은 combat/towerstatus.js
function updTowerFx(dt) { for (const tw of G.towers) { if (!(tw.rootT > 0 || tw.frostT > 0 || tw.warnT > 0 || tw.chillT > G.t || tw.meltT > 0 || tw.curseT > 0 || tw.dfx)) continue;
  if (tw.curseT > 0) tw.curseT -= dt;
  if (tw.meltT > 0) { tw.meltT -= dt; tw.meltAcc += dt; if (tw.meltAcc >= .5) { tw.meltAcc -= .5; damageTower(tw, tw.meltDps * .5, { kind: 'lava' }); } if (tw.dead) continue; }
  if (tw.rootT > 0) tw.rootT -= dt; if (tw.frostT > 0) tw.frostT -= dt; if (tw.warnT > 0) tw.warnT -= dt; const F = towerFx(tw);
  F.roots.visible = tw.rootT > 0; if (F.roots.visible) F.roots.scale.set(1, Math.min(1, (F.roots.userData.k = Math.min(1, (F.roots.userData.k || 0) + dt * 5))), 1); else F.roots.userData.k = 0;
  F.pool.visible = tw.meltT > 0; if (F.pool.visible) { F.pool.scale.setScalar(Math.min(1, tw.meltT * 2, (F.pool.userData.k = Math.min(1, (F.pool.userData.k || 0) + dt * 4)))); if (rand() < dt * 6) { const q = twPos(tw); emit(P, q.x + (rand() - .5) * 2, .2, q.z + (rand() - .5) * 2, 1, 0xff8a3a, .8, .9, 2, .3); } } else F.pool.userData.k = 0;
  F.curse.visible = tw.curseT > 0; if (F.curse.visible) { F.curse.rotation.y += dt * 1.5; F.curse.position.y = 4.4 + Math.sin(G.t * 4) * .15; F.cring.visible = true; F.cring.material.opacity = .45 + .25 * Math.sin(G.t * 6); } else F.cring.visible = false;
  F.ice.visible = tw.frostT > 0; F.flake.visible = tw.frostT > 0 || tw.chillT > G.t; if (F.flake.visible) { F.flake.rotation.y += dt * 2; F.flake.position.y = 4.3 + Math.sin(G.t * 3) * .12; }
  F.warn.visible = tw.warnT > 0; if (F.warn.visible) { F.warn.material.color.setHex(tw.warnC || 0x7aff4a); F.warn.material.opacity = .45 + .45 * Math.abs(Math.sin(G.t * 10)); F.warn.scale.setScalar(1 + Math.max(0, tw.warnT) * .25); } } }
function updAbilities(dt) {
  if (pend.length) spawnPending(); if (balls.length) updBalls(dt); if (meteors.length) updMeteors(dt); updTowerFx(dt);
  for (const e of G.enemies) { if (e.dead && e.cast) { if (e.cast.mark) scene.remove(e.cast.mark); if (e.cast.pts) e.cast.pts.forEach(o => scene.remove(o.mark)); e.cast = null; }
    if (e.shBub) { if (e.shieldT > 0) { e.shieldT -= dt; if (e.shieldT <= 0 && e.shield > 0) { e.shield = 0; bubble(e, false); } } const b = e.shBub; if (b.visible) { b.userData.hit = Math.max(0, b.userData.hit - dt); b.material.opacity = .13 + b.userData.hit * 1.2 + Math.sin(G.t * 4) * .03; b.rotation.y += dt; } if (e.dying !== undefined) b.visible = false; }
    if (e.m.chillRing) { e.m.chillRing.visible = e.dying === undefined; e.m.chillRing.rotation.z += dt * .5; }
    if (e.m.enrRing) { e.m.enrRing.visible = e.dying === undefined; e.m.enrRing.material.opacity = .4 + Math.sin(G.t * 9) * .2; } }
}
function clearAbilities() { pend.length = 0; for (const m of scene.children.filter(o => o.userData && o.userData.dread)) scene.remove(m); for (const b of balls) scene.remove(b.m); balls.length = 0; for (const o of meteors) { if (o.m) scene.remove(o.m); if (o.mark) scene.remove(o.mark); } meteors.length = 0; }
export { initAbilities, abilityTick, armorOf, crackHit, absorbShield, onKilled, pendingSpawns, updAbilities, towerRateK, clearAbilities };
