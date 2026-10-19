// ================= 총사 로즈: 쌍권총 연사 · 로즈 피니시(Q) · 전설 쌍권총(도탄 난사 / 장미 탄막) =================
// 기본 공격은 왼손·오른손 총을 번갈아 쏨(총구 섬광 + 탄피 불꽃 + 합성 총성). 다른 영웅 코드 경로는 건드리지 않음 (cls === 'gunner' 일 때만 호출)
import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { G, later } from '../core/state.js';
import { scene } from '../render/scene.js';
import { P, PB, emit, ringFx } from '../render/vfx.js';
import { play } from '../render/characters.js';
import { shoot } from '../combat/projectiles.js';
import { hurt as hurt0 } from '../monsters/enemy.js';
import { banner } from '../ui/hud.js';
import { hero, stat } from './hero.js';

const FX = []; let side = 0; const _v = new THREE.Vector3();
const alive = () => G.enemies.filter(e => !e.dead && e.dying === undefined);
const d2 = (e, x, z) => { const dx = e.g.position.x - x, dz = e.g.position.z - z; return dx * dx + dz * dz; };
const ADD = (c, o = .9) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const bulletGeo = new THREE.CylinderGeometry(.05, .05, 1, 6).rotateX(Math.PI / 2), tracerGeo = new THREE.CylinderGeometry(.04, .04, 1, 5).rotateX(Math.PI / 2).translate(0, 0, .5), petalGeo = new THREE.SphereGeometry(.13, 8, 6);
G.gunN = { shots: 0, skill: 0, spray: 0, ricochet: 0, barrage: 0 }; // 테스트용 카운터
G.legendDmgGun = 0;

// 총구 월드 위치 (k = 0 왼손, 1 오른손)
export function muzzle(k) { const ch = hero.ch; if (!ch.muz || !ch.muz[k]) return hero.g.position.clone().setY(1.5); hero.g.updateMatrixWorld(true); return ch.muz[k].getWorldPosition(new THREE.Vector3()); }
export function flash(k, big = 1) { const f = hero.ch.flashes && hero.ch.flashes[k]; if (!f) return; f.t = .07 * big; f.big = big; f.g.visible = true; f.g.rotation.y = Math.random() * 6.28; }
function shell(p) { emit(P, p.x, p.y, p.z, 3, 0xffd27a, 2.6, .22, -10, .15); emit(P, p.x, p.y - .1, p.z, 1, 0xffb040, 1.6, .5, -14, .1); }
// 기본 공격: 번갈아 사격
export function gunAttack(t) {
  const k = side = side ^ 1, from = muzzle(k); flash(k); shell(from); G.gunN.shots++;
  Snd.gun(from, { rate: k ? 1.04 : .97 }); shoot('bullet', from, t, stat.dmg(), { color: 0xffc8e0 });
}
// 직선 탄환 (스킬/전설): 첫 적 또는 관통 횟수만큼 맞히고 사라짐
function lineShot(from, dir, o) {
  const m = new THREE.Mesh(bulletGeo, o.mat || bulletMat(o.color || 0xffd0e8)); m.scale.set(o.w || 1, o.w || 1, o.len || 1.1); m.position.copy(from); m.lookAt(_v.copy(from).add(dir)); scene.add(m);
  let dist = 0, left = o.pierce || 1; const hit = new Set(), spd = o.spd || 58;
  FX.push(dt => { const st = spd * dt; m.position.addScaledVector(dir, st); dist += st; const p = m.position;
    if (o.trail && Math.random() < .7) emit(P, p.x, p.y, p.z, 1, o.trail, .4, .3, 0, 0);
    for (const e of alive()) if (!hit.has(e) && d2(e, p.x, p.z) < (o.r || .8) ** 2) { hit.add(e); lsk = !!o.lsk; hurt(e, o.dmg, o.txt || '#ffc8e0', !!o.big, { x: p.x - dir.x, z: p.z - dir.z, kind: 'ranged' }); emit(P, p.x, p.y, p.z, 5, o.spark || 0xffe0a0, 3, .25); lsk = false; if (o.onHit) o.onHit(e, p); if (--left <= 0) { scene.remove(m); return false; } }
    if (dist > o.range) { scene.remove(m); if (o.onEnd) o.onEnd(p); return false; } return true; });
}
const bmats = {}; const bulletMat = c => bmats[c] || (bmats[c] = ADD(c, 1));
let lsk = false; const hurt = (e, d, ...a) => { if (lsk && !e.dead) { G.legendDmg += d; G.legendDmgGun += d; } hurt0(e, d, ...a); };
function tracer(a, b, color, dur = .14) { const L = a.distanceTo(b); if (L < .05) return; const m = new THREE.Mesh(tracerGeo, ADD(color)); m.position.copy(a); m.lookAt(b); m.scale.set(1.4, 1.4, L); scene.add(m); let t = 0;
  FX.push(dt => { t += dt; m.material.opacity = .95 * (1 - t / dur); if (t < dur) return true; scene.remove(m); m.material.dispose(); return false; }); }

// ---------- Q: 로즈 피니시 — ShootCharged(회전 사격) 동안 사방으로 탄환 난사 + 왼손(1.4초)·오른손(2.4초) 피니시 폭발 ----------
const SK_SPD = 1.6, SK_DUR = 4.3 / SK_SPD;
export function gunSkill(mul, base) {
  hero.roseT = SK_DUR; hero.roseA = hero.face; hero.roseN = 0; hero.roseTick = 0; hero.roseB = [1.4 / SK_SPD, 2.4 / SK_SPD]; G.gunN.skill++; hero.path = [];
  play(hero.ch, 'ShootCharged', { once: true, force: true, speed: SK_SPD }); banner('로즈 피니시!', '#ff8ac0', 1000);
  ringFx(hero.g.position, 3.2, 0xff6aa8, .5); emit(PB, hero.g.position.x, 1.2, hero.g.position.z, 10, 0xff6aa8, 3, .5, 0, 1); Snd.whoosh(hero.g.position, .5, 400, 3200, .45); Snd.play('draw', { pos: hero.g.position, rate: 1.3 });
  hero.roseD = { mul, base };
}
export function updRose(dt) {
  const h = hero, p = h.g.position, el = SK_DUR - h.roseT; h.roseT -= dt; h.roseTick -= dt; h.roseA += dt * 7.5;
  if (h.roseTick <= 0 && h.roseT > .25) { h.roseTick = .055; const k = (h.roseN++) & 1, a = h.roseA + k * Math.PI + (Math.random() - .5) * .5, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), from = muzzle(k);
    from.y = Math.max(.9, Math.min(1.8, from.y)); flash(k); shell(from); G.gunN.spray++; if (h.roseN % 2) Snd.gun(from, { rate: 1.1, vol: .7 });
    lineShot(from, dir, { dmg: h.roseD.base * 1.0 * h.roseD.mul, range: 9.5, color: 0xff9ac8, trail: 0xff6aa8 }); }
  for (let i = 0; i < 2; i++) if (h.roseB[i] && el >= h.roseB[i]) { h.roseB[i] = 0; finisher(i ? 1 : 0); }
  if (h.roseT <= 0) { h.roseT = 0; play(h.ch, 'Idle', { fade: .2 }); }
}
function finisher(k) {
  const h = hero, c = h.g.position.clone(), from = muzzle(k), D = h.roseD, R = 4.6; flash(k, 2.4); G.shake = Math.max(G.shake, .45);
  for (const e of alive()) if (d2(e, c.x, c.z) <= R * R) hurt(e, D.base * 4.5 * D.mul, '#ff9ac8', true);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + k * .2; lineShot(from.clone().setY(1.2), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), { dmg: D.base * 1.2 * D.mul, range: 11, color: 0xffe0f0, trail: 0xff8ac0, w: 1.5, pierce: 2 }); }
  ringFx(c, R + 1, 0xff6aa8, .5); ringFx(c, R * .6, 0xffe0f0, .35); emit(P, c.x, 1.2, c.z, 70, 0xff8ac0, 9, .6, -4, 1.5); emit(PB, c.x, 1.2, c.z, 14, 0xff4a8a, 4, .5, 0, 1); petals(c, 26, 5);
  Snd.gun(from, { rate: .7, vol: 1.4, big: true }); Snd.play('boom', { pos: c, vol: .45, rate: 1.5 });
}
// 장미 꽃잎 (가산 분홍 구체가 흩날림)
function petals(c, n, spd) { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(petalGeo, ADD(i % 3 ? 0xff5a9a : 0xffc0dc)); m.scale.set(1, .35, .7); m.position.set(c.x, 1.2, c.z); scene.add(m);
  const a = Math.random() * 6.28, v = new THREE.Vector3(Math.cos(a) * spd * (.5 + Math.random()), 2 + Math.random() * 3, Math.sin(a) * spd * (.5 + Math.random())); let t = 0, L = .7 + Math.random() * .5;
  FX.push(dt => { t += dt; v.y -= 6 * dt; v.multiplyScalar(1 - dt * 1.5); m.position.addScaledVector(v, dt); m.rotation.x += dt * 8; m.rotation.z += dt * 6; m.material.opacity = .9 * (1 - t / L); if (t < L) return true; scene.remove(m); m.material.dispose(); return false; }); } }

// ---------- 전설 쌍권총 ----------
// 도탄 난사 (proc): 탄환이 주변 적 최대 4명에게 차례로 튕김 (각 70% 피해)
export function ricochet(t, s) {
  const dmg = stat.dmg() * s.mul, hit = new Set([t]); let cur = t; G.gunN.ricochet++;
  const jump = n => { if (n >= 4 || cur.dead && n > 0 && !cur.g) return; const a = cur.g.position; let best = null, bd = 5.5 * 5.5;
    for (const e of alive()) { if (hit.has(e)) continue; const d = d2(e, a.x, a.z); if (d < bd) { bd = d; best = e; } } if (!best) return;
    const pa = a.clone().setY(1.2), pb = best.g.position.clone().setY(1.2); tracer(pa, pb, 0xffd0e8); tracer(pa, pb, 0xff6aa8, .22); hit.add(best); lsk = true; hurt(best, dmg, '#ffd86a', false, { x: pa.x, z: pa.z, kind: 'ranged' }); lsk = false;
    emit(P, pb.x, pb.y, pb.z, 10, 0xffe0a0, 4, .3); emit(P, pa.x, pa.y, pa.z, 4, 0xfff0c0, 3, .2); Snd.gun(pb, { rate: 1.6 + n * .12, vol: .45, ping: true }); cur = best; later(.06, () => jump(n + 1)); };
  later(.05, () => jump(0));
}
// 장미 탄막 (active): 목표 방향 부채꼴로 3연속 일제 사격(관통) → 끝에서 장미 폭발
export function rosebarrage(s, tg) {
  const h = hero.g.position, ang = hero.face = Math.atan2(tg.x - h.x, tg.z - h.z), dmg = stat.dmg() * s.mul * stat.skillMul(); hero.path = []; G.gunN.barrage++;
  banner('장미 탄막!', '#ff6aa8', 1000); play(hero.ch, 'ShootStand', { force: true, speed: 2.2 }); hero.atkT = 1; hero.gunT = 1;
  ringFx(h, 2.8, 0xff6aa8, .45); petals(h.clone(), 14, 3); Snd.play('draw', { pos: h, rate: 1.5, force: true });
  for (let v = 0; v < 3; v++) later(.12 + v * .22, () => { if (!hero || hero.dead > 0) return; hero.face = ang; G.shake = Math.max(G.shake, .2);
    for (let i = 0; i < 12; i++) { const k = i & 1, a = ang + (i / 11 - .5) * 1.3 + (v - 1) * .05, from = muzzle(k).setY(1.25); flash(k, 1.6);
      lineShot(from, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), { dmg, range: 13, pierce: 3, color: 0xff6aa8, trail: 0xff3a8a, w: 1.8, len: 1.4, txt: '#ff8ac0', spark: 0xff9ac8, big: v === 2,
        onEnd: v === 2 && i === 5 ? p => bloom(p, s) : null, lsk: true }); }
    Snd.gun(muzzle(0), { rate: .85, vol: 1.2, big: true }); Snd.gun(muzzle(1), { rate: .95, vol: 1 }); });
}
function bloom(p, s) { const c = p.clone().setY(0), R = 3.4, dmg = stat.dmg() * s.mul * 2 * stat.skillMul(); lsk = true; for (const e of alive()) if (d2(e, c.x, c.z) <= R * R) hurt(e, dmg, '#ff6aa8', true); lsk = false;
  ringFx(c, R + 1, 0xff3a8a, .5); ringFx(c, R * .5, 0xffe0f0, .3); petals(c, 34, 6); emit(P, c.x, 1, c.z, 60, 0xff6aa8, 8, .6, -6, 1.5); Snd.play('boom', { pos: c, vol: .6, rate: 1.3 }); }

// 매 프레임 (legend.js updLegend에서 호출): 총구 섬광 감쇠 + 탄환/이펙트
export function updGun(dt) {
  if (hero && hero.ch && hero.ch.flashes) for (const f of hero.ch.flashes) if (f.t > 0) { f.t -= dt; const k = Math.max(0, f.t / (.07 * f.big)); f.g.scale.setScalar(f.s * (.5 + k * .8) * f.big); f.mat.opacity = k; if (f.t <= 0) f.g.visible = false; }
  for (let i = FX.length - 1; i >= 0; i--) if (!FX[i](dt)) FX.splice(i, 1);
}
