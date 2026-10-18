import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { $, rand, rnd } from '../core/util.js';
import { G, later } from '../core/state.js';
import { camera, scene } from './scene.js';
import { IM, glow, hideI, mk, setI, tmpC, toon } from './toon.js';

// ================= 파티클 =================
function makeParticles(n, size) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3).fill(-999), col = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#fff'); gr.addColorStop(.3, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const mat = new THREE.PointsMaterial({ size, map: new THREE.CanvasTexture(cv), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, col, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), base: new Float32Array(n * 3), grav: new Float32Array(n), n, i: 0 };
}
const P = makeParticles(3000, .45), PB = makeParticles(700, 1.6);
function emit(sys, x, y, z, count, color, spd = 4, life = .6, grav = -6, spread = 1) {
  const c = new THREE.Color(color);
  for (let k = 0; k < count; k++) { const i = sys.i = (sys.i + 1) % sys.n, j = i * 3; sys.pos[j] = x + rnd(-.2, .2) * spread; sys.pos[j + 1] = y; sys.pos[j + 2] = z + rnd(-.2, .2) * spread;
    const a = rand() * Math.PI * 2, u = rnd(-.2, 1), v = rnd(.3, 1) * spd; sys.vel[j] = Math.cos(a) * v * Math.sqrt(1 - u * u); sys.vel[j + 1] = u * v + spd * .3; sys.vel[j + 2] = Math.sin(a) * v * Math.sqrt(1 - u * u);
    sys.life[i] = sys.max[i] = life * rnd(.6, 1.2); sys.grav[i] = grav; sys.base[j] = c.r; sys.base[j + 1] = c.g; sys.base[j + 2] = c.b; }
}
function updParticles(sys, dt) {
  for (let i = 0; i < sys.n; i++) { if (sys.life[i] <= 0) continue; const j = i * 3; sys.life[i] -= dt;
    if (sys.life[i] <= 0) { sys.pos[j + 1] = -999; continue; } sys.vel[j + 1] += sys.grav[i] * dt;
    sys.pos[j] += sys.vel[j] * dt; sys.pos[j + 1] += sys.vel[j + 1] * dt; sys.pos[j + 2] += sys.vel[j + 2] * dt; const f = sys.life[i] / sys.max[i];
    sys.col[j] = sys.base[j] * f; sys.col[j + 1] = sys.base[j + 1] * f; sys.col[j + 2] = sys.base[j + 2] * f; }
  sys.pts.geometry.attributes.position.needsUpdate = true; sys.pts.geometry.attributes.color.needsUpdate = true;
}
// 파편 (실제 3D 조각, 튕김)
const DEB_N = 500, debIM = IM(new RoundedBoxGeometry(.3, .3, .3, 1, .07), toon(0xffffff), DEB_N, .02);
const DB = { p: new Float32Array(DEB_N * 3), v: new Float32Array(DEB_N * 3), rot: new Float32Array(DEB_N * 2), life: new Float32Array(DEB_N), sz: new Float32Array(DEB_N), i: 0 };
function debris(x, y, z, n, colors, spd = 6) {
  for (let k = 0; k < n; k++) { const i = DB.i = (DB.i + 1) % DEB_N, j = i * 3, a = rand() * 6.28, v = rnd(.3, 1) * spd;
    DB.p[j] = x + rnd(-.5, .5); DB.p[j + 1] = y + rnd(0, .5); DB.p[j + 2] = z + rnd(-.5, .5); DB.v[j] = Math.cos(a) * v * .6; DB.v[j + 1] = rnd(.5, 1.2) * spd; DB.v[j + 2] = Math.sin(a) * v * .6;
    DB.life[i] = rnd(.9, 1.6); DB.sz[i] = rnd(.5, 1.25); DB.rot[i * 2] = rnd(0, 6); DB.rot[i * 2 + 1] = rnd(0, 6); debIM.setColorAt(i, tmpC.set(colors[k % colors.length])); }
  debIM.instanceColor.needsUpdate = true;
}
function updDebris(dt) {
  for (let i = 0; i < DEB_N; i++) { if (DB.life[i] <= 0) continue; const j = i * 3; DB.life[i] -= dt;
    if (DB.life[i] <= 0) { hideI(debIM, i); continue; }
    DB.v[j + 1] -= 24 * dt; DB.p[j] += DB.v[j] * dt; DB.p[j + 1] += DB.v[j + 1] * dt; DB.p[j + 2] += DB.v[j + 2] * dt;
    if (DB.p[j + 1] < .1) { DB.p[j + 1] = .1; DB.v[j + 1] *= -.35; DB.v[j] *= .6; DB.v[j + 2] *= .6; }
    DB.rot[i * 2] += dt * 6; const s = DB.sz[i] * Math.min(1, DB.life[i] * 2.5);
    setI(debIM, i, DB.p[j], DB.p[j + 1], DB.p[j + 2], s, s, s, DB.rot[i * 2], DB.rot[i * 2 + 1]); }
}
const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 1500 }, (_, i) => i % 3 === 1 ? rnd(50, 140) : rnd(-260, 260)), 3)), new THREE.PointsMaterial({ color: 0xffffff, size: .8, transparent: true, opacity: 0, fog: false })); scene.add(stars);

// ================= DOM 이펙트 =================
const fx = $('fx'), v3 = new THREE.Vector3();
function screenOf(p) { v3.copy(p).project(camera); return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight, v3.z < 1]; }
let dmgCount = 0;
function dmgText(p, val, color = '#fff', big = false) {
  if (dmgCount > 60) return; const [x, y, ok] = screenOf(p); if (!ok) return; dmgCount++;
  const d = document.createElement('div'); d.className = 'dmg'; d.textContent = typeof val === 'number' ? Math.round(val) : val; d.style.left = x + rnd(-12, 12) + 'px'; d.style.top = y - 20 + 'px'; d.style.color = color; if (big) d.style.fontSize = '26px';
  fx.appendChild(d); setTimeout(() => { d.remove(); dmgCount--; }, 800);
}
function flyCoinDom(p) {
  const [x, y, ok] = screenOf(p); if (!ok) return; const tgt = $('gold').getBoundingClientRect(); const c = document.createElement('div'); c.className = 'flycoin'; c.style.left = x + 'px'; c.style.top = y + 'px'; fx.appendChild(c);
  setTimeout(() => { c.style.left = tgt.left - 14 + 'px'; c.style.top = tgt.top + tgt.height / 2 + 'px'; c.style.transform = 'translate(-50%,-50%) scale(.6)'; }, 30);
  setTimeout(() => c.remove(), 800);
}
const coinGeo = new THREE.CylinderGeometry(.24, .24, .07, 16).rotateX(Math.PI / 2), coinMat = glow(0xffc828, .6);
function popCoins(p, n) { for (let k = 0; k < Math.min(n, 6); k++) { const m = mk(coinGeo, coinMat, p.x, p.y, p.z, scene, .02); G.coins.push({ m, v: new THREE.Vector3(rnd(-2.5, 2.5), rnd(6, 9), rnd(-2.5, 2.5)), t: .55 + k * .05 }); } }
function updCoins(dt) { for (let i = G.coins.length - 1; i >= 0; i--) { const c = G.coins[i]; c.t -= dt; c.v.y -= 22 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.y += dt * 12; if (c.m.position.y < .3) { c.m.position.y = .3; c.v.y *= -.4; }
  if (c.t <= 0) { flyCoinDom(c.m.position); later(.45, () => Snd.play('coin', { rate: 1 + Math.random() * .2 })); scene.remove(c.m); G.coins.splice(i, 1); } } }
function ringFx(pos, r, color, dur = .4) {
  const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, .2, pos.z); scene.add(m); G.fxs.push({ m, t: 0, dur, r, kind: 'ring' });
}
function updFx(dt) {
  for (let i = G.fxs.length - 1; i >= 0; i--) { const f = G.fxs[i]; f.t += dt; const k = f.t / f.dur;
    if (f.kind === 'ring') { f.m.scale.setScalar(.3 + k * f.r); f.m.material.opacity = (1 - k) * .9; } else f.m.material.opacity = (1 - k) * .9;
    if (k >= 1) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); G.fxs.splice(i, 1); } }
}

export { P, PB, emit, updParticles, debris, updDebris, stars, dmgText, popCoins, updCoins, ringFx, updFx };
