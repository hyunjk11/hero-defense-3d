import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { rand } from '../core/util.js';
import { G } from '../core/state.js';
import { scene } from '../render/scene.js';
import { glow } from '../render/toon.js';
import { P, PB, debris, emit, ringFx } from '../render/vfx.js';
import { enemyAim } from '../world/towers.js';
import { hurt } from '../monsters/enemy.js';

// ================= 투사체 =================
const arrowGeo = new THREE.CylinderGeometry(.035, .035, 1, 5).rotateX(Math.PI / 2), arrowHead = new THREE.ConeGeometry(.08, .22, 6).rotateX(Math.PI / 2);
function makeArrow(color) { const m = new THREE.Mesh(arrowGeo, glow(color, 1.4)); const h = new THREE.Mesh(arrowHead, glow(color, 2.2)); h.position.z = .55; m.add(h); return m; }
const orbGeo = new THREE.IcosahedronGeometry(.3, 2), orbMat = glow(0xc07aff, 4);
function shoot(kind, from, target, dmg, opts = {}) {
  const m = kind === 'arrow' ? makeArrow(opts.color || 0xd0ffd0) : new THREE.Mesh(orbGeo, orbMat); m.position.copy(from); scene.add(m);
  G.projs.push({ kind, m, target, dmg, spd: kind === 'arrow' ? 32 : 16, ...opts });
}
function aoe(pos, r, dmg, color, opts = {}) {
  for (const e of [...G.enemies]) { if (e.dead) continue; const dx = e.g.position.x - pos.x, dz = e.g.position.z - pos.z; if (dx * dx + dz * dz <= r * r && (!opts.groundOnly || !e.E.fly)) { if (opts.slow) { e.slowT = 1.5; e.slowAmt = .45; } hurt(e, dmg, color, opts.big); } }
}
function killProj(i) { const p = G.projs[i]; scene.remove(p.m); G.projs.splice(i, 1); }
function updProjs(dt) {
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i], m = p.m;
    if (p.kind === 'ball') { p.t += dt; const k = Math.min(1, p.t / p.dur); m.position.lerpVectors(p.from, p.dest, k); m.position.y = p.from.y + (p.dest.y + .3 - p.from.y) * k + Math.sin(k * Math.PI) * 3.2;
      if (rand() < .5) emit(P, m.position.x, m.position.y, m.position.z, 1, 0x9a9a9a, .5, .5, 1, 0);
      if (k >= 1) { killProj(i); aoe(p.dest, p.r, p.dmg, '#ffc07a', { groundOnly: true }); ringFx(p.dest, p.r, 0xff8a2a, .35); emit(P, p.dest.x, .4, p.dest.z, 40, 0xffa04a, 7, .6, -8, 1.5); emit(PB, p.dest.x, .6, p.dest.z, 6, 0xff7a2a, 3, .5, 0, 1); debris(p.dest.x, .3, p.dest.z, 4, [0x8a6a4a, 0x5a5a5a], 4); G.shake = Math.max(G.shake, .08); Snd.play('boom', { pos: p.dest, vol: .6 }); }
      continue; }
    if (p.kind === 'rain' || p.kind === 'meteor') {
      const d = p.dest.clone().sub(m.position), len = d.length(), mv = p.spd * dt;
      if (p.kind === 'meteor') { emit(P, m.position.x, m.position.y, m.position.z, 8, 0xff8a2a, 2, .5, 2, 2); m.rotation.x += dt * 5; }
      if (len <= mv) { killProj(i);
        if (p.kind === 'rain') { aoe(p.dest, 1.3, p.dmg, '#9affb0'); emit(P, p.dest.x, .3, p.dest.z, 5, 0x9affb0, 3, .35); }
        else { aoe(p.dest, 4.8, p.dmg, '#ffb05a', { big: true, slow: true }); G.shake = .9; ringFx(p.dest, 6, 0xff8a2a, .6); emit(PB, p.dest.x, .5, p.dest.z, 50, 0xff7a2a, 10, 1, -4, 3); emit(P, p.dest.x, .5, p.dest.z, 160, 0xffcc5a, 14, 1.1, -14, 3); debris(p.dest.x, .5, p.dest.z, 30, [0x3a2a2a, 0xff6a2a, 0x6a4a3a], 10); Snd.play('meteor', { pos: p.dest, force: true }); Snd.play('boom', { pos: p.dest }); }
        continue; }
      m.position.addScaledVector(d.normalize(), mv); continue;
    }
    if (p.target.dead) { killProj(i); continue; }
    const tp = enemyAim(p.target), d = tp.clone().sub(m.position), len = d.length(), mv = p.spd * dt;
    if (len <= mv) { killProj(i);
      if (p.kind === 'arrow') { hurt(p.target, p.dmg, '#ffffff', false, { x: m.position.x, z: m.position.z, kind: 'ranged' }); emit(P, tp.x, tp.y, tp.z, 5, p.color || 0xd0ffd0, 3, .3); }
      else { aoe(tp, p.aoe, p.dmg, '#d0a0ff', { slow: true }); emit(P, tp.x, tp.y, tp.z, 18, 0xb07aff, 5, .5, -4, 1.5); ringFx(tp, p.aoe, 0xb07aff, .3); }
      continue; }
    m.position.addScaledVector(d.normalize(), mv); m.lookAt(tp);
    emit(P, m.position.x, m.position.y, m.position.z, 1, p.kind === 'arrow' ? (p.color || 0x9affb0) : 0xb07aff, .3, .25, 0, 0);
  }
}

export { makeArrow, shoot, aoe, updProjs };
