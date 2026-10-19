// ================= 3장 화산: 용암(흐르는 셰이더) · 배경 화산 · 불씨/연기 =================
// 용암 셰이더는 pow/나눗셈 없이 sin·smoothstep·clamp 만 사용 → NaN 불가. 가장 뜨거운 줄기만 블룸 문턱(1.05)을 살짝 넘어 은은하게 빛남
import * as THREE from 'three';
import { scene } from './scene.js';
import { toon } from './toon.js';
import { P, emit } from './vfx.js';
import { G } from '../core/state.js';
import { GW, GH, S, tileX, tileZ } from '../core/grid.js';

const uT = { value: 0 };
const lavaMat = new THREE.ShaderMaterial({ uniforms: { uT }, fog: false,
  vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform float uT; varying vec2 vW;
    void main(){ vec2 p = vW * .55;
      float n = sin(p.x * 1.3 + uT * .5 + sin(p.y * 1.7 - uT * .3) * 1.4) * sin(p.y * 1.1 - uT * .4 + sin(p.x * 2.1 + uT * .2));
      float m = sin((p.x - p.y) * 3.3 + uT * 1.2) * .5;
      float k = clamp(n * .5 + .5 + m * .25, 0., 1.);
      vec3 c = mix(vec3(.16, .04, .02), vec3(1.1, .28, .04), smoothstep(.15, .55, k));
      c = mix(c, vec3(1.75, .78, .16), smoothstep(.78, .97, k));
      gl_FragColor = vec4(clamp(c, 0., 2.), 1.); }` });
const lavaTiles = [], vents = [];
// 판 위 용암 강: 칸마다 사각형 하나 (합쳐서 메시 1개), 주변 현무암보다 0.3 낮게
function buildLavaMesh(tiles) {
  if (!tiles.length) return; const pos = [], idx = [], h = S * .51;
  for (const [c, r] of tiles) { const x = tileX(c), z = tileZ(r), b = pos.length / 3; pos.push(x - h, -.3, z - h, x + h, -.3, z - h, x + h, -.3, z + h, x - h, -.3, z + h); idx.push(b, b + 2, b + 1, b, b + 3, b + 2); lavaTiles.push([x, z]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, lavaMat); m.name = 'lava'; scene.add(m);
}
const strip = (x, z, len, w, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), lavaMat); m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, -.76, z); scene.add(m); return m; };
// 배경: 큰 화산(멀리, 분화구 용암 + 흘러내리는 용암) + 판 뒤 작은 분출구 + 판 밖 용암 줄기
function volcanoDeco() {
  const basalt = toon(0x2a1c1a), dark = toon(0x1e1414);
  const V = new THREE.Group(); V.position.set(-14, -1, -84); scene.add(V);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(9, 44, 36, 14, 1, true), basalt); cone.position.y = 18; V.add(cone);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(9, 1.4, 6, 18), dark); lip.rotation.x = Math.PI / 2; lip.position.y = 36; V.add(lip);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(8.6, 20), lavaMat); crater.rotation.x = -Math.PI / 2; crater.position.y = 35.4; V.add(crater);
  for (let k = 0; k < 4; k++) { const a = -.9 + k * .55, fl = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + (k % 2), 32), lavaMat), rr = 26.5;
    fl.position.set(Math.sin(a) * rr, 18, Math.cos(a) * rr); fl.rotation.set(0, a, 0); fl.rotateX(-Math.atan2(35, 18) + Math.PI / 2 - .02); fl.translateZ(.25); V.add(fl); }
  vents.push({ x: -14, y: 36, z: -84, big: 1 });
  for (const [x, z, r, h] of [[-31, -24, 4.5, 3.6], [9, -28, 5, 4.2], [35, -7, 3.6, 3]]) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(r * .32, r, h, 10, 1, true), basalt); v.position.set(x, -.8 + h / 2, z); scene.add(v);
    const c = new THREE.Mesh(new THREE.CircleGeometry(r * .32, 12), lavaMat); c.rotation.x = -Math.PI / 2; c.position.set(x, -.8 + h - .15, z); scene.add(c); vents.push({ x, y: -.8 + h, z, big: 0 }); }
  strip(-31, -18, 12, 1.6, .25); strip(9, -21, 10, 1.4, -.1); strip(30, -2, 10, 1.2, 1.1); strip(-36, 6, 22, 1.8, .15); strip(40, 14, 18, 1.4, -.4);
}
// 연기: 일반 블렌딩 스프라이트 (가산 블렌딩이 아니라 하얗게 쌓이지 않음)
const smokeTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
const smoke = []; let smokeI = 0, emberAcc = 0;
function puff(x, y, z, s, life) { if (smoke.length < 48) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x3a3030, transparent: true, depthWrite: false, opacity: 0 })); scene.add(sp); smoke.push({ sp, t: 0, life: 0 }); }
  const o = smoke[smokeI = (smokeI + 1) % smoke.length]; o.sp.position.set(x, y, z); o.s = s; o.t = 0; o.life = life; o.vx = .4 + Math.random() * .5; o.sp.visible = true; }
function updVolcano(dt) {
  if (!vents.length && !lavaTiles.length) return; uT.value = (uT.value + dt) % 1000;
  if (G.pauseRender && G.manual) return;
  emberAcc += dt * (8 + lavaTiles.length * .35);
  while (emberAcc >= 1) { emberAcc--; const L = lavaTiles.length && Math.random() < .7 ? lavaTiles[Math.floor(Math.random() * lavaTiles.length)] : null;
    if (L) emit(P, L[0] + (Math.random() - .5) * 1.6, -.2, L[1] + (Math.random() - .5) * 1.6, 1, Math.random() < .5 ? 0xff7a2a : 0xffa040, .7, 1.6, 1.1, .5);
    else emit(P, (Math.random() - .5) * GW * S, .3, (Math.random() - .5) * GH * S, 1, 0xff6a20, .5, 2, .8, .5); } // 판 위를 떠도는 불씨
  for (const v of vents) if (Math.random() < dt * (v.big ? 2.2 : .9)) puff(v.x + (Math.random() - .5) * (v.big ? 6 : 1), v.y + .5, v.z + (Math.random() - .5) * (v.big ? 6 : 1), v.big ? 9 : 2.6, v.big ? 7 : 4.5);
  for (const o of smoke) { if (!o.life) continue; o.t += dt; const f = o.t / o.life; if (f >= 1) { o.life = 0; o.sp.visible = false; continue; }
    o.sp.position.y += dt * (o.s * .35); o.sp.position.x += dt * o.vx; o.sp.scale.setScalar(o.s * (.6 + f * 1.4)); o.sp.material.opacity = Math.max(0, Math.min(1, Math.sin(f * Math.PI))) * .45; }
}
export { buildLavaMesh, volcanoDeco, updVolcano, lavaMat };
