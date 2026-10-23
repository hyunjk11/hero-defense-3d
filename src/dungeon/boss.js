// ================= 던전 5층 보스 '망령 여왕 모르비아' 기믹 (영혼의 창 · 망령의 원 · 해골 소환 · 50% 분노) =================
// 수치·판정 = data/dungeon.js DG_BOSS (node 테스트). 이 파일 = 예고 장판/선 메시 · 시전 · 피해 · AI 영웅 반응(피하기·막기)
// monsters/ai.js 가 E.dgBoss 몬스터만 dgBossTick 을 부르고, dungeon/run.js updDungeon 이 updBossFx 를 부름 → 일반 스테이지에는 영향 없음
import * as THREE from 'three';
import { Snd } from '../audio/audio.js';
import { G } from '../core/state.js';
import { toTile, inGrid, isBlock, T } from '../core/grid.js';
import { scene } from '../render/scene.js';
import { P as PT, PB, emit, ringFx, dmgText } from '../render/vfx.js';
import { play } from '../render/characters.js';
import { tileAt } from '../world/terrain.js';
import { heroDamage } from '../heroes/hero.js';
import { spawnEnemy } from '../monsters/enemy.js';
import { CLASSES } from '../data/heroes.js';
import { banner } from '../ui/hud.js';
import { DG_BOSS as B, FLOORS, ROLE, lanceTarget, lanceVictim, circleSpots, inCircle, summonDue, interceptPoint, dodgePoint } from '../data/dungeon.js';

const S = G.dgB = { fx: [], log: null };
const resetLog = () => (S.log = { lance: 0, lanceHit: 0, blocked: 0, lanceMiss: 0, circles: 0, circleHits: 0, summons: 0, summoned: 0, phase2: false });
resetLog();
const hs = () => G.heroes.map(h => ({ x: h.g.position.x, z: h.g.position.z, role: ROLE[h.cls], alive: h.dead <= 0 }));
// 시전 동작: Meshy 모델(ch.lich) = 전용 클립 · 대체(해골 마법사) = KayKit 클립
const ANIM = m => m.lich ? { lance: 'CastLance', circ: 'Slam', summon: 'Scream' } : { lance: 'Taunt', circ: '2H_Melee_Attack_Chop', summon: 'Cheer' };
const faceTo = (g, x, z) => { g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z); };
const glowMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

function bossInit(e) { resetLog(); return (e.bz = { lanceT: B.lance.first, circT: B.circles.first, hold: 0, done: [], phase: 1, lance2: 0, lastTgt: -1 }); }
// ai.js: 보스 차례마다. true = 시전 중(제자리 · 이동/근접 공격 안 함)
export function dgBossTick(e, dt) {
  const z = e.bz || bossInit(e), frac = e.hp / e.max;
  if (z.phase === 1 && frac <= B.phase.at) { z.phase = 2; e.spdK = B.phase.spd; S.log.phase2 = true; G.shake = Math.max(G.shake || 0, .9); Snd.roar(e.g.position);
    banner('💀 망령 여왕의 분노! — 원이 늘고 창이 두 번 날아와요', '#ff6a9a', 2400); emit(PB, e.g.position.x, 3, e.g.position.z, 60, 0xff4a9a, 9, 1, -2, 2); ringFx(e.g.position, 6, 0xff4a9a, .8);
    z.circT = Math.min(z.circT, 2.5); }
  for (const i of summonDue(frac, z.done)) { z.done.push(i); summon(e, z); }
  const cdk = z.phase === 2 ? B.phase.cd : 1;
  z.lanceT -= dt; z.circT -= dt;
  if (z.lance2 > 0) { z.lance2 -= dt; if (z.lance2 <= 0) startLance(e, z, z.lastTgt); }
  if (z.hold > 0) { z.hold -= dt; return true; }
  if (z.lanceT <= 0) { z.lanceT = B.lance.every * cdk; if (startLance(e, z, -1) && z.phase === 2) z.lance2 = 1.1; return z.hold > 0; }
  if (z.circT <= 0) { z.circT = B.circles.every * cdk; startCircles(e, z); return true; }
  return false;
}

// ---------- ① 영혼의 창 ----------
function startLance(e, z, skip) {
  const L = hs(), a = { x: e.g.position.x, z: e.g.position.z }, ti = lanceTarget(a, L, skip); if (ti < 0) return false;
  const h = G.heroes[ti], b = { x: L[ti].x, z: L[ti].z }, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1, len = B.lance.len;
  z.lastTgt = ti; z.hold = Math.max(z.hold, B.lance.windup + .25); faceTo(e.g, b.x, b.z); play(e.m, ANIM(e.m).lance, { once: true, force: true, speed: 1.1 });
  // 예고: 바닥 붉은 띠(보스 → 대상 너머 len) + 안쪽 채움이 windup 동안 차오름
  const grp = new THREE.Group(), w = B.lance.w * 2, edge = new THREE.Mesh(new THREE.PlaneGeometry(w, len), glowMat(0xff3a5a, .28)), fill = new THREE.Mesh(new THREE.PlaneGeometry(w * .8, len), glowMat(0xff7a9a, .5));
  edge.rotation.x = fill.rotation.x = -Math.PI / 2; edge.position.z = fill.position.z = len / 2; fill.scale.y = .01; fill.position.z = 0; grp.add(edge, fill);
  grp.position.set(a.x, .16, a.z); grp.rotation.y = Math.atan2(dx, dz); scene.add(grp);
  // 막기: 대상이 아닌 살아있는 세라/서윤 중 막기 지점에 가장 가까운 영웅 (AI 영웅이면 그리로 달려감 · 조작 중이면 직접)
  const ip = interceptPoint(a, b); let gi = -1, gd = Infinity; G.heroes.forEach((x, i) => { if (i === ti || x.dead > 0 || (ROLE[x.cls] !== 'tank' && ROLE[x.cls] !== 'bruiser')) return; const dd = Math.hypot(x.g.position.x - ip.x, x.g.position.z - ip.z); if (dd < gd) { gd = dd; gi = i; } });
  S.fx.push({ k: 'lance', t: B.lance.windup, T: B.lance.windup, a, b, tgt: ti, guard: gi, ip, grp, fill, len, dir: { x: dx / d, z: dz / d } });
  S.log.lance++; Snd.play('meteorCast', { pos: e.g.position, rate: .7 });
  const gN = gi >= 0 ? CLASSES[G.heroes[gi].cls].nm : null;
  banner(`🔱 영혼의 창 → ${CLASSES[h.cls].nm}!${gN ? ` ${gN}(이)가 앞을 막아요` : ' 선에서 비켜나세요'}`, '#ff8aa8', 1500);
  return true;
}
function fireLance(f) {
  const L = hs(), v = lanceVictim(f.a, f.b, L, B.lance.w, f.len, f.tgt);
  const end = { x: f.a.x + f.dir.x * f.len, z: f.a.z + f.dir.z * f.len };
  for (let k = 1; k <= 10; k++) { const q = k / 10; emit(PT, f.a.x + (end.x - f.a.x) * q, 1.2, f.a.z + (end.z - f.a.z) * q, 4, 0xff5a8a, 4, .5, -2, .6); }
  Snd.play('boom', { pos: f.a, rate: 1.4 }); f.fill.scale.y = 1; f.fill.position.z = f.len / 2; f.fill.material.opacity = .95; f.fill.material.color.setHex(0xffd0e0);
  if (!v) { S.log.lanceMiss++; return; }
  const h = G.heroes[v.i], p = h.g.position, dmg = B.lance.dmg * (v.blocked ? B.lance.block : 1); heroDamage(dmg, h);
  if (v.blocked) { S.log.blocked++; dmgText(p.clone().setY(3), '막음!', '#9ad4ff'); ringFx(p, 2.2, 0x9ad4ff, .5); emit(PT, p.x, 1.6, p.z, 24, 0x9ad4ff, 5, .5); Snd.play('block', { pos: p, force: true }); }
  else { S.log.lanceHit++; emit(PT, p.x, 1.4, p.z, 30, 0xff3a6a, 6, .6); G.shake = Math.max(G.shake || 0, .35); }
}

// ---------- ② 망령의 원 ----------
function startCircles(e, z) {
  const n = z.phase === 2 ? B.circles.n2 : B.circles.n, spots = circleSpots(hs(), n, G.dgRnd || Math.random); if (!spots.length) return;
  z.hold = Math.max(z.hold, B.circles.windup * .7); play(e.m, ANIM(e.m).circ, { once: true, force: true, speed: .9 }); S.log.circles++;
  for (const c of spots) { const grp = new THREE.Group(), r = B.circles.r, ring = new THREE.Mesh(new THREE.RingGeometry(r * .86, r, 48), glowMat(0xc05aff, .95)), fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), glowMat(0x9a4aff, .45));
    ring.rotation.x = fill.rotation.x = -Math.PI / 2; fill.scale.setScalar(.05); grp.add(ring, fill); grp.position.set(c.x, .15, c.z); scene.add(grp);
    S.fx.push({ k: 'circ', t: B.circles.windup, T: B.circles.windup, c, grp, fill, r }); }
  Snd.play('meteorCast', { pos: e.g.position, rate: .55 }); banner('🔮 망령의 원! 원 밖으로 피하세요', '#c8a0ff', 1200);
}
function burstCircles(list) { const hit = new Set();
  for (const f of list) { emit(PB, f.c.x, .6, f.c.z, 26, 0xb06aff, 7, .7, -2, f.r); ringFx(new THREE.Vector3(f.c.x, 0, f.c.z), f.r * 1.15, 0xd08aff, .45);
    G.heroes.forEach((h, i) => { if (h.dead > 0 || hit.has(i) || !inCircle(f.c, { x: h.g.position.x, z: h.g.position.z }, f.r)) return; hit.add(i); heroDamage(B.circles.dmg, h); S.log.circleHits++; }); }
  Snd.play('boom', { rate: .8 }); }

// ---------- ③ 해골 소환 ----------
function summon(e, z) { const n = z.phase === 2 ? B.summon.n2 : B.summon.n, L = G.dg.floors || FLOORS, F = L[G.dg.floor] || L[L.length - 1], p = e.g.position;
  play(e.m, ANIM(e.m).summon, { once: true, force: true }); z.hold = Math.max(z.hold, 1.1); S.log.summons++; G.shake = Math.max(G.shake || 0, .5);
  banner('💀 해골 소환! 졸개부터 정리하세요', '#d8c8ff', 1500); Snd.roar(p);
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + .4; let x = p.x + Math.cos(a) * 2.6, zz = p.z + Math.sin(a) * 2.6; x = Math.max(-20, Math.min(20, x)); zz = Math.max(-12, Math.min(12, zz));
    let [c, r] = toTile(x, zz); if (!inGrid(c, r) || isBlock(tileAt(c, r).t) || tileAt(c, r).t === T.BEDROCK) { x = p.x; zz = p.z; [c, r] = toTile(x, zz); }
    const m = spawnEnemy(B.summon.types[k % B.summon.types.length], F.hpMul * B.summon.hpMul, { x, z: zz, tile: [c, r] }); m.summoned = true; S.log.summoned++;
    emit(PT, x, .4, zz, 18, 0xb08aff, 4, .6, -6, 1.2); ringFx(new THREE.Vector3(x, 0, zz), 1.4, 0xb08aff, .5); } }

// ---------- 매 프레임 (run.js updDungeon): 예고 진행 · 발동 · 보스가 없으면 정리 ----------
export function updBossFx(dt) {
  if (!S.fx.length) return; const boss = G.enemies.some(e => e.E.dgBoss && !e.dead);
  const due = [];
  for (let i = S.fx.length - 1; i >= 0; i--) { const f = S.fx[i]; f.t -= dt;
    if (!boss && !f.fired) { killFx(f); S.fx.splice(i, 1); continue; } // 보스 처치: 남은 예고 취소
    if (f.fired) { f.life -= dt; const o = Math.max(0, f.life / .3); f.grp.traverse(m => { if (m.material) m.material.opacity *= o > 0 ? .85 : 0; }); if (f.life <= 0) { killFx(f); S.fx.splice(i, 1); } continue; }
    const q = 1 - Math.max(0, f.t / f.T);
    if (f.k === 'lance') { f.fill.scale.y = Math.max(.01, q); f.fill.position.z = f.len * q / 2; f.fill.material.opacity = .35 + .4 * q; }
    else { f.fill.scale.setScalar(Math.max(.05, q)); f.fill.material.opacity = .3 + .4 * q; }
    if (f.t <= 0) { f.fired = true; f.life = .3; if (f.k === 'lance') fireLance(f); else due.push(f); } }
  if (due.length) burstCircles(due);
}
function killFx(f) { scene.remove(f.grp); f.grp.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); }
export function clearBossFx() { for (const f of S.fx) killFx(f); S.fx.length = 0; }
G.dgBossClear = clearBossFx;

// ---------- AI 영웅 반응 (run.js partyAI 가 조작하지 않는 영웅마다): 이동 목표 {x,z} 또는 null ----------
// 원: 예고 후 react 초가 지나면 원 밖으로 · 창: 막기 담당(세라/서윤)은 대상 앞 막기 지점으로
export function bossDodge(h) { if (!S.fx.length) return null; const i = G.heroes.indexOf(h), p = { x: h.g.position.x, z: h.g.position.z };
  for (const f of S.fx) { if (f.fired) continue;
    if (f.k === 'lance' && f.guard === i) { const tp = G.heroes[f.tgt]; const ip = tp && tp.dead <= 0 ? interceptPoint(f.a, { x: f.b.x, z: f.b.z }) : f.ip; return ip; }
    if (f.k === 'circ' && f.T - f.t >= B.circles.react && inCircle(f.c, p, f.r + .3)) return dodgePoint(f.c, p, f.r); }
  return null; }
