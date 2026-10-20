// ================= 4장 폐허: 무너진 기둥·성벽 배경 · 유령불 횃불(보라/청록 셰이더) · 떠도는 넋 · 가장자리 안개 =================
// 유령불 셰이더는 pow/나눗셈 없이 sin·smoothstep·clamp 만 사용 → NaN 불가. 출력 0..1.3 (블룸 문턱 1.0을 불꽃 심지만 살짝 넘음 → 하얗게 날아가지 않음)
import * as THREE from 'three';
import { scene } from './scene.js';
import { toon, glow, mk } from './toon.js';
import { P, emit } from './vfx.js';
import { G } from '../core/state.js';
import { GW, GH, S } from '../core/grid.js';
import { mulberry32 } from '../core/util.js';

const uT = { value: 0 };
const flameMat = (a, b) => new THREE.ShaderMaterial({ uniforms: { uT, cA: { value: new THREE.Color(a) }, cB: { value: new THREE.Color(b) }, uS: { value: Math.random() * 10 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
  vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform float uT; uniform float uS; uniform vec3 cA; uniform vec3 cB; varying vec2 vU;
    void main(){ float y = clamp(vU.y, 0., 1.);
      float wob = sin(y * 7. - uT * 6. + uS) * .07 * y + sin(y * 13. - uT * 9.) * .03 * y;
      float w = (1. - y) * .42 + .04; float d = abs(vU.x - .5 + wob);
      float a = clamp(1. - smoothstep(w * .55, w, d), 0., 1.) * clamp(1. - smoothstep(.55, 1., y), 0., 1.);
      a *= .75 + .25 * sin(uT * 11. + uS + y * 4.);
      float core = clamp(1. - smoothstep(0., w * .5, d), 0., 1.) * clamp(1. - smoothstep(.1, .6, y), 0., 1.);
      vec3 c = mix(cB, cA, clamp(y * 1.4, 0., 1.)) + vec3(.35, .3, .4) * core;
      gl_FragColor = vec4(clamp(c * a, 0., 1.3), clamp(a, 0., 1.)); }` });
const FIRES = [flameMat(0xb060ff, 0x6a20d0), flameMat(0x40ffe0, 0x10a0a0)]; // 보라 · 청록
const torches = [], mist = [];
function torch(x, z, k, parent = scene, h = 2.2) {
  const g = new THREE.Group(); g.position.set(x, -.8, z); parent.add(g);
  const st = toon(0x7a7488), dk = toon(0x4a4658);
  mk(new THREE.CylinderGeometry(.32, .42, h, 8), st, 0, h / 2, 0, g); mk(new THREE.CylinderGeometry(.62, .38, .4, 10), dk, 0, h + .15, 0, g);
  const f = new THREE.Group(); f.position.y = h + .3; g.add(f);
  for (let q = 0; q < 2; q++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), FIRES[k]); m.position.y = .85; m.rotation.y = q * Math.PI / 2; m.renderOrder = 5; f.add(m); }
  mk(new THREE.OctahedronGeometry(.18, 0), glow(k ? 0x6affe8 : 0xc08aff, 1.2), 0, .25, 0, f, 0);
  torches.push({ x, y: h + .3 - .8, z, k, f }); return g;
}
// 부서진 기둥 (높이 h, 꼭대기 비스듬히 깨짐 + 이끼)
function pillar(x, z, h, R, parent = scene, s = 1) {
  const g = new THREE.Group(); g.position.set(x, -.8, z); g.scale.setScalar(s); parent.add(g);
  const st = toon(new THREE.Color().setHSL(.7, .06, .5 + R() * .08)), moss = toon(new THREE.Color().setHSL(.27, .45, .3 + R() * .06));
  mk(new THREE.BoxGeometry(1.5, .4, 1.5), st, 0, .2, 0, g); const segs = Math.max(1, Math.round(h / 1.1));
  for (let i = 0; i < segs; i++) { const c = mk(new THREE.CylinderGeometry(.52, .55, 1.05, 10), st, (R() - .5) * .06, .4 + .55 + i * 1.08, (R() - .5) * .06, g); c.rotation.y = R() * 3; }
  const top = .4 + segs * 1.08, cap = mk(new THREE.CylinderGeometry(.5, .52, .5, 10), st, .05, top + .1, 0, g); cap.rotation.z = .35 + R() * .2; // 깨진 윗부분
  const ms = mk(new THREE.SphereGeometry(.42, 8, 6), moss, -.1, top - .1, .25, g, 0); ms.scale.set(1.3, .35, 1.1);
  const ms2 = mk(new THREE.SphereGeometry(.5, 8, 6), moss, .2, .45, .5, g, 0); ms2.scale.set(1.4, .3, .8); return g;
}
function fallen(x, z, ry, R) { const st = toon(new THREE.Color().setHSL(.7, .06, .46 + R() * .06)); const g = new THREE.Group(); g.position.set(x, -.8 + .5, z); g.rotation.y = ry; scene.add(g);
  for (let i = 0; i < 3; i++) { const c = mk(new THREE.CylinderGeometry(.5, .52, 1.05, 10), st, i * 1.12 - 1.1, 0, (R() - .5) * .3, g); c.rotation.z = Math.PI / 2; c.rotation.y = (R() - .5) * .3; } }
function wallSeg(x, z, w, h, ry, R) { const st = toon(new THREE.Color().setHSL(.72, .07, .42 + R() * .06)), moss = toon(0x3e6a3a), g = new THREE.Group(); g.position.set(x, -.8, z); g.rotation.y = ry; scene.add(g);
  const n = Math.round(w / 1.2); for (let i = 0; i < n; i++) { const hh = h * (.45 + R() * .55); const b = mk(new THREE.BoxGeometry(1.15, hh, .9), st, i * 1.2 - w / 2, hh / 2, 0, g); b.rotation.y = (R() - .5) * .08;
    if (R() < .5) { const m = mk(new THREE.SphereGeometry(.5, 7, 5), moss, i * 1.2 - w / 2, hh, 0, g, 0); m.scale.set(1.1, .3, .9); } } }
// 배경 장식 (판 바깥): 열주·무너진 성벽·뒤쪽 거대 신전 실루엣·횃불·가장자리 안개
function ruinsDeco() {
  const R = mulberry32(404), HW = GW * S / 2, HH = GH * S / 2;
  // 판 가장자리 횃불 (위·아래 줄, 보라/청록 번갈아) — 판 안을 가리지 않게 테두리 바깥
  for (let i = 0; i < 6; i++) { const x = -HW + 2 + i * (GW * S - 4) / 5; torch(x, -HH - 2.2, i % 2); torch(x + 1.5, HH + 2.4, (i + 1) % 2, scene, 1.6); }
  for (const z of [-6, 6]) { torch(-HW - 2.4, z, 1); torch(HW + 2.4, z, 0); }
  // 열주 (판 뒤·옆)
  for (let i = 0; i < 9; i++) pillar(-HW + 1 + i * 5.6 + (R() - .5), -HH - 6 - R() * 2, 2.5 + R() * 4.5, R);
  for (let i = 0; i < 5; i++) { pillar(-HW - 6 - R() * 3, -HH + 3 + i * 7, 1.5 + R() * 4, R); pillar(HW + 6 + R() * 3, -HH + 3 + i * 7, 1.5 + R() * 4, R); }
  for (let i = 0; i < 6; i++) fallen((R() - .5) * 70, -HH - 12 - R() * 10, R() * 3, R);
  for (let i = 0; i < 8; i++) { const a = R() * 6.28, rr = 46 + R() * 22; wallSeg(Math.cos(a) * rr, Math.sin(a) * rr * .8, 5 + R() * 6, 2 + R() * 3, a + Math.PI / 2, R); }
  // 뒤쪽 거대 신전 (계단 + 기둥 + 무너진 박공)
  const T = new THREE.Group(); T.position.set(6, -.8, -70); scene.add(T); const ts = toon(0x5a5670), tsd = toon(0x46425a);
  for (let k = 0; k < 4; k++) mk(new THREE.BoxGeometry(44 - k * 4, 1.2, 14 - k * 2), k % 2 ? tsd : ts, 0, .6 + k * 1.2, 0, T, 0);
  for (let i = 0; i < 8; i++) { const hgt = i === 2 || i === 5 ? 5 + R() * 3 : 12; const c = mk(new THREE.CylinderGeometry(1.1, 1.2, hgt, 12), ts, -15.75 + i * 4.5, 4.8 + hgt / 2, 0, T, 0); c.castShadow = false; }
  const ped = mk(new THREE.BoxGeometry(38, 1.6, 6), tsd, -3, 17.6, 0, T, 0); ped.rotation.z = -.04; ped.castShadow = false;
  const gab = mk(new THREE.CylinderGeometry(.1, 14, 6, 3, 1), ts, -6, 21.4, 0, T, 0); gab.rotation.set(Math.PI / 2, 0, Math.PI / 2); gab.scale.set(1, 1, .45); gab.castShadow = false;
  torch(-4, -62.5, 0, scene, 5); torch(16, -62.5, 1, scene, 5); // 신전 앞 높은 유령불
  // 가장자리 안개 (판 바깥 둘레, 일반 블렌딩 → 하얗게 쌓이지 않음)
  for (let i = 0; i < 22; i++) { const a = i / 22 * 6.28, rx = HW + 9 + R() * 8, rz = HH + 8 + R() * 6, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex(), color: 0x8a7ab0, transparent: true, depthWrite: false, opacity: .3, fog: false }));
    sp.position.set(Math.cos(a) * rx, .6, Math.sin(a) * rz); sp.scale.set(16, 5, 1); scene.add(sp); mist.push({ sp, a, ph: R() * 6 }); }
}
let _mist; function mistTex() { if (_mist) return _mist; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (_mist = new THREE.CanvasTexture(cv)); }
let moteAcc = 0;
function updRuins(dt) {
  if (!torches.length) return; uT.value = (uT.value + dt) % 1000;
  if (G.pauseRender && G.manual) return;
  for (const t of torches) { t.f.scale.y = 1 + Math.sin(G.t * 9 + t.x) * .06; if (Math.random() < dt * 2.5) emit(P, t.x + (Math.random() - .5) * .3, t.y + 1.2, t.z + (Math.random() - .5) * .3, 1, t.k ? 0x6affe8 : 0xc08aff, .6, 1.1, 1.6, .2); }
  moteAcc += dt * 6; while (moteAcc >= 1) { moteAcc--; emit(P, (Math.random() - .5) * GW * S, .2 + Math.random() * .6, (Math.random() - .5) * GH * S, 1, Math.random() < .5 ? 0x8affe8 : 0xc0a0ff, .35, 2.2, .7, .4); } // 판 위를 떠도는 넋
  for (const m of mist) { m.sp.material.opacity = .22 + .1 * Math.sin(G.t * .4 + m.ph); m.sp.position.x += Math.sin(G.t * .2 + m.ph) * dt * .3; }
}
export { ruinsDeco, updRuins, pillar, torch, FIRES };
