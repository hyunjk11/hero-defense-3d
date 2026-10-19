// ================= 마을 (절차적 생성, 툰 스타일): 광장·분수·집·풍차·호수광장·여신탑 =================
import * as THREE from 'three';
import { mk, toon, glow, olGeo, outlineMat } from '../render/toon.js';

export const LAKE = new THREE.Vector2(21, 2); export const LR = 6.6; // 호수 중심/반지름 (마을 로컬)
export const PORTAL = new THREE.Vector2(0, -15);
let seed = 20261018; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647, RR = (a, b) => a + R() * (b - a);
const dummy = new THREE.Object3D(), col = new THREE.Color(), U = { uT: { value: 0 } };
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d), Cyl = (a, b, h, n = 12) => new THREE.CylinderGeometry(a, b, h, n);
export const labels = []; const anims = [], blockers = []; let T = null;

// 인스턴스 배치 (list: {x,y,z,s|sx,sy,sz,rx,ry,rz,c})
function inst(geo, mat, list, parent, ol = 0, shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, list.length); m.castShadow = shadow; m.receiveShadow = true;
  list.forEach((o, i) => { dummy.position.set(o.x, o.y || 0, o.z); dummy.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); const s = o.s ?? 1; dummy.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col.set(o.c ?? 0xffffff)); });
  m.computeBoundingSphere(); parent.add(m);
  if (ol) { const o = new THREE.InstancedMesh(olGeo(geo), outlineMat(ol), list.length); o.instanceMatrix = m.instanceMatrix; o.raycast = () => {}; o.frustumCulled = false; parent.add(o); }
  return m;
}
// 바람에 흔들리는 정점 (풀·깃발 줄)
function sway(mat, amp, h = 'max(position.y,0.)') {
  mat.onBeforeCompile = s => { s.uniforms.uT = U.uT; s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 wq = (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
#else
  vec3 wq = (modelMatrix * vec4(0.,0.,0.,1.)).xyz;
#endif
  float hh = ${h}; transformed.x += sin(uT*2.1 + wq.x*.6 + wq.z*.45) * hh * ${amp.toFixed(3)}; transformed.z += cos(uT*1.6 + wq.x*.35 - wq.z*.3) * hh * ${(amp * .6).toFixed(3)};`); };
  mat.customProgramCacheKey = () => 'sway' + amp + h; return mat;
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const FONT = '"Gothic A1","Noto Sans KR","Malgun Gothic",sans-serif';
function signTex(text, bg = '#6a4322', fg = '#fff3d6') {
  return canvasTex(256, 96, (g, w, h) => { g.fillStyle = bg; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 18); g.fill(); g.lineWidth = 7; g.strokeStyle = '#e9c46a'; g.stroke();
    g.fillStyle = fg; g.font = `bold 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#000a'; g.shadowBlur = 4; g.fillText(text, w / 2, h / 2 + 3); });
}
let haloTex = null;
function halo(color, size, parent, x, y, z) {
  haloTex ||= canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#ffffffff'); r.addColorStop(.25, '#ffffff88'); r.addColorStop(1, '#ffffff00'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: .8 }));
  s.scale.setScalar(size); s.position.set(x, y, z); parent.add(s); const base = size, ph = R() * 6;
  anims.push(t => s.scale.setScalar(base * (1 + Math.sin(t * 7 + ph) * .05 + Math.sin(t * 13 + ph) * .03))); return s;
}
// 부드러운 점 파티클 (반딧불·꽃잎·반짝이)
function points(n, additive, size) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3)); g.setAttribute('aA', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
  const m = new THREE.ShaderMaterial({ uniforms: { uS: { value: size } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive, vertexColors: true,
    vertexShader: 'uniform float uS; attribute float aA; varying vec3 vC; varying float vA; void main(){ vC=color; vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=uS*300./-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,${additive ? '.0' : '.35'},d); if(a<.01) discard; gl_FragColor=vec4(vC*${additive ? '1.6' : '1.'}, a*vA); }` });
  const p = new THREE.Points(g, m); p.frustumCulled = false; T.add(p); return p;
}
const near = (x, z, list) => list.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r);

// ---------- 집 ----------
function house(o) {
  const g = new THREE.Group(); g.position.set(o.x, 0, o.z); g.rotation.y = Math.atan2(-o.x, -o.z) + (o.rot || 0); T.add(g);
  const w = o.w || 4.2, d = o.d || 3.6, h = o.h || 3, rh = o.rh || 2.2, B = .4, tm = toon(o.trim || 0x5a3a22), wall = toon(o.wall);
  mk(Box(w + .4, B, d + .4), toon(0x8f887a), 0, B / 2, 0, g, .03);
  mk(Box(w, h, d), wall, 0, B + h / 2, 0, g, .04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(Box(.24, h, .24), tm, sx * w / 2, B + h / 2, sz * d / 2, g, 0);
  for (const z of [d / 2 + .03, -d / 2 - .03]) mk(Box(w, .2, .06), tm, 0, B + h * .58, z, g, 0);
  if (h > 3.6) for (const z of [d / 2 + .03]) mk(Box(.18, h * .5, .06), tm, 0, B + h * .79, z, g, 0); // 2층 기둥
  // 박공(벽색 삼각기둥) + 지붕판 2장 + 용마루
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, rh - .15); sh.closePath();
  const pg = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); pg.translate(0, 0, -d / 2); mk(pg, wall, 0, B + h, 0, g, .03);
  const hw = w / 2 + .45, sl = Math.hypot(hw, rh) + .12, a = Math.atan2(rh, hw), rm = toon(o.roof);
  for (const s of [-1, 1]) { const r = mk(Box(sl, .26, d + .9), rm, s * hw / 2, B + h + rh / 2 + .05, 0, g, .04); r.rotation.z = -s * a; }
  mk(Box(.34, .34, d + 1), toon(new THREE.Color(o.roof).multiplyScalar(.7)), 0, B + h + rh + .05, 0, g, .03).rotation.z = Math.PI / 4;
  // 문 (아치)
  const dm = toon(o.door || 0x7a4a26); mk(Box(1.1, 1.6, .16), dm, 0, B + .8, d / 2 + .06, g, .02); const top = mk(Cyl(.55, .55, .16, 16), dm, 0, B + 1.6, d / 2 + .06, g, .02); top.rotation.x = Math.PI / 2;
  mk(new THREE.SphereGeometry(.07, 8, 6), glow(0xffd27a, 1.2), .35, B + .9, d / 2 + .16, g, 0);
  // 창문 + 덧창 + 화분
  const win = (x, y, z, ry) => { const wg = new THREE.Group(); wg.position.set(x, y, z); wg.rotation.y = ry; g.add(wg);
    mk(Box(.86, .86, .12), tm, 0, 0, 0, wg, .015); mk(Box(.66, .66, .14), glow(0xffd98a, .9), 0, 0, .02, wg, 0); mk(Box(.06, .66, .16), tm, 0, 0, .03, wg, 0); mk(Box(.66, .06, .16), tm, 0, 0, .03, wg, 0);
    for (const s of [-1, 1]) mk(Box(.34, .86, .06), toon(o.shutter || 0x3a7a5a), s * .62, 0, .04, wg, .012);
    mk(Box(.9, .2, .26), toon(0x8a5a32), 0, -.55, .16, wg, .012); for (let k = 0; k < 4; k++) mk(new THREE.IcosahedronGeometry(.11, 0), toon([0xff6a8a, 0xffd23a, 0xff8ad8, 0xffffff][(k + (x > 0)) % 4]), -.3 + k * .2, -.38, .2, wg, 0); };
  win(-w / 2 + .9, B + h * .45, d / 2 + .02, 0); win(w / 2 - .9, B + h * .45, d / 2 + .02, 0); win(w / 2 + .02, B + h * .45, 0, Math.PI / 2); win(-w / 2 - .02, B + h * .45, 0, -Math.PI / 2);
  if (h > 3.6) { win(-w / 2 + .9, B + h * .8, d / 2 + .02, 0); win(w / 2 - .9, B + h * .8, d / 2 + .02, 0); }
  const rw = mk(new THREE.CircleGeometry(.36, 20), glow(0xffe0a0, .9), 0, B + h + rh * .38, d / 2 + .01, g, 0); rw.castShadow = false;
  // 굴뚝 + 연기
  if (o.chimney !== false) { const cx = w * .26, cz = -d * .18, ch = B + h + rh * .55 + 1.1; mk(Box(.6, 2, .6), toon(0x9a7a6a), cx, ch - 1, cz, g, .03); mk(Box(.74, .2, .74), toon(0x6a5a5a), cx, ch, cz, g, .02); smoke(g, cx, ch + .1, cz, o.smoke || 0xf4f0ea); }
  // 걸린 간판
  if (o.sign) { const sx = w / 2 + .1, sy = B + h * .72; mk(Box(1.3, .08, .08), toon(0x2a2a34), sx + .5, sy + .5, d / 2 + .3, g, 0); const sg = new THREE.Group(); sg.position.set(sx + .95, sy + .45, d / 2 + .3); g.add(sg);
    const tx = signTex(o.sign, o.signBg); const pl = new THREE.Mesh(new THREE.BoxGeometry(1.5, .56, .06), [toon(0x5a3a22), toon(0x5a3a22), toon(0x5a3a22), toon(0x5a3a22), new THREE.MeshToonMaterial({ map: tx }), new THREE.MeshToonMaterial({ map: tx })]); pl.position.y = -.38; pl.rotation.y = Math.PI / 2; pl.castShadow = true; sg.add(pl);
    const ph = R() * 6; anims.push(t => sg.rotation.x = Math.sin(t * 1.7 + ph) * .08); }
  if (o.extra) o.extra(g, w, d, h, B, rh);
  blockers.push([o.x, o.z, Math.max(w, d) * .5 + .9]);
  if (o.label) labels.push({ obj: g, y: B + h + rh + 1.6, html: o.label, cls: o.cls });
  return g;
}
const smokes = [];
function smoke(parent, x, y, z, c) { for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 1), toon(c, { transparent: true, opacity: .7, depthWrite: false })); m.castShadow = false; parent.add(m); smokes.push({ m, x, y, z, ph: k / 6 }); } }

// ---------- 지형·길 ----------
function ground() {
  mk(Cyl(36, 37, .6, 72), toon(0x7cc25c), 0, -.3, 0, T, .04);
  const far = new THREE.Mesh(new THREE.CircleGeometry(160, 48), toon(0x6aae52)); far.rotation.x = -Math.PI / 2; far.position.y = -.62; far.receiveShadow = true; T.add(far);
  // 먼 산·언덕
  for (let k = 0; k < 22; k++) { const a = k / 22 * 6.283 + RR(-.1, .1), r = RR(62, 85), hgt = RR(14, 30); const m = new THREE.Mesh(new THREE.ConeGeometry(RR(12, 20), hgt, 7), toon([0x6aa0b8, 0x7ab0c8, 0x5a90a8][k % 3])); m.position.set(Math.cos(a) * r, hgt / 2 - 1, Math.sin(a) * r); m.rotation.y = R() * 6; T.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4, 4.5, 7), toon(0xf4f8ff)); cap.position.set(0, hgt / 2 - 2, 0); cap.scale.setScalar(hgt / 26); m.add(cap); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, r = RR(40, 50); const m = new THREE.Mesh(new THREE.SphereGeometry(RR(7, 11), 14, 8), toon(0x6ab84e)); m.position.set(Math.cos(a) * r, -3, Math.sin(a) * r); m.scale.y = .5; T.add(m); }
}
const PLAZA = 7.2;
function cobbles() {
  // 돌마다 높이를 조금씩 달리함(겹치는 육각 윗면이 같은 평면이면 z-fighting으로 지글거림). 난수열은 그대로(배치 불변)
  const L = [], add = (x, z) => L.push({ x, y: .1, z, sx: RR(.42, .58), sy: .5 + (L.length * 5 % 9) * .03, sz: RR(.42, .58), ry: R() * 3, c: [0xc8bca8, 0xb4a892, 0xd8ccb6, 0xa89a86, 0xcfc2a8][(R() * 5) | 0] });
  const disc = (cx, cz, r0, r1) => { for (let r = r0 + .45; r < r1; r += .62) { const n = Math.max(6, Math.round(6.283 * r / .62)); for (let k = 0; k < n; k++) { const a = (k + RR(-.2, .2)) / n * 6.283; add(cx + Math.cos(a) * r, cz + Math.sin(a) * r); } } };
  const path = (x0, z0, x1, z1, wid) => { const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len; for (let s = 0; s < len; s += .62) for (let q = -wid / 2 + .3; q < wid / 2; q += .62) add(x0 + ux * s - uz * q + RR(-.06, .06), z0 + uz * s + ux * q + RR(-.06, .06)); };
  disc(0, 0, 2.2, PLAZA); disc(LAKE.x, LAKE.y, LR + .7, 10.6);
  path(0, -PLAZA + .2, 0, -13.2, 2.6); path(PLAZA - .2, 1, LAKE.x - 10.4, LAKE.y, 2.6); path(-PLAZA + .2, 0, -14, -3, 2.2); path(0, PLAZA - .2, -2, 16, 2.2); path(4, -5, 8, -8.5, 1.8); path(-4, -5, -8, -10, 1.8); path(-4, 5, -8, 7.5, 1.8);
  const geo = Cyl(1, 1, .2, 6); inst(geo, toon(0xffffff), L, T, 0, false);
  for (const [x, z, r] of [[0, 0, PLAZA + .2]]) { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), toon(0x9a8e7c)); m.rotation.x = -Math.PI / 2; m.position.set(x, .02, z); m.receiveShadow = true; T.add(m); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(LR + .4, 10.9, 64), toon(0x9a8e7c)); ring.rotation.x = -Math.PI / 2; ring.position.set(LAKE.x, .02, LAKE.y); ring.receiveShadow = true; T.add(ring);
}
// 길 위인지 (풀·나무 배치 제외용)
const PATHS = [[0, -10, 1.8, 5], [11, 1.5, 4.5, 1.8], [-10, -1.5, 4.5, 1.6], [-1, 11, 1.6, 5.5]];
const onPath = (x, z) => PATHS.some(([cx, cz, hx, hz]) => Math.abs(x - cx) < hx && Math.abs(z - cz) < hz);
const busy = (x, z, m = 0) => Math.hypot(x, z) < PLAZA + 1 + m || Math.hypot(x - LAKE.x, z - LAKE.y) < 11.4 + m || onPath(x, z) || near(x, z, blockers.map(([a, b, r]) => [a, b, r + m])) || Math.hypot(x - PORTAL.x, z - PORTAL.y) < 4 + m;

// ---------- 분수 ----------
function fountain(waterMat) {
  mk(Cyl(2.3, 2.5, .7, 28), toon(0xe0d6c4), 0, .35, 0, T, .035); const w = new THREE.Mesh(new THREE.CircleGeometry(2.05, 32), waterMat); w.rotation.x = -Math.PI / 2; w.position.y = .66; T.add(w);
  mk(Cyl(.3, .45, 1.4, 12), toon(0xe0d6c4), 0, 1.2, 0, T, .025); mk(Cyl(1.1, .7, .35, 20), toon(0xe0d6c4), 0, 1.95, 0, T, .03);
  const w2 = new THREE.Mesh(new THREE.CircleGeometry(.95, 24), waterMat); w2.rotation.x = -Math.PI / 2; w2.position.y = 2.13; T.add(w2);
  mk(Cyl(.12, .18, .7, 8), toon(0xe0d6c4), 0, 2.45, 0, T, .02);
  const orb = mk(new THREE.IcosahedronGeometry(.32, 1), glow(0x9ae8ff, 1.8), 0, 3.1, 0, T, 0); anims.push(t => { orb.rotation.y = t; orb.position.y = 3.1 + Math.sin(t * 2) * .12; });
  halo(0x9ae8ff, 2.2, T, 0, 3.1, 0);
  const N = 140, P = points(N, false, .16), pa = P.geometry.attributes.position.array, ca = P.geometry.attributes.color.array, ph = Array.from({ length: N }, () => [R(), R() * 6.283, RR(.8, 1.2)]);
  for (let i = 0; i < N; i++) { col.setHSL(.55, .8, RR(.75, .95)); ca.set([col.r, col.g, col.b], i * 3); }
  anims.push(t => { for (let i = 0; i < N; i++) { const [p0, a, sp] = ph[i], k = (t * .8 * sp + p0) % 1, big = i % 2; const r = (big ? 1.95 : .9) * k, y = (big ? 2.2 : 3.2) + (big ? 1.4 : 1.1) * 4 * k * (1 - k) - (big ? 1.5 : 1.0) * k * k; pa[i * 3] = Math.cos(a) * r; pa[i * 3 + 1] = y; pa[i * 3 + 2] = Math.sin(a) * r; } P.geometry.attributes.position.needsUpdate = true; });
  blockers.push([0, 0, 2.7]);
}
// ---------- 물 셰이더 ----------
function waterMat(r) {
  return new THREE.ShaderMaterial({ uniforms: { uT: U.uT, uR: { value: r } }, transparent: true,
    vertexShader: 'varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uT; uniform float uR; varying vec2 vP;
    void main(){ float r=length(vP)/uR; vec2 p=vP*(6.6/uR);
      float w=sin(p.x*1.3+uT*1.4)*sin(p.y*1.1-uT*1.1)+.6*sin((p.x+p.y)*2.2+uT*2.)+.4*sin(p.x*3.7-p.y*2.9-uT*2.6);
      vec3 deep=vec3(.10,.42,.78), shal=vec3(.30,.78,.92); vec3 c=mix(deep,shal,smoothstep(.45,.98,r)+.15*w);
      c=mix(c, vec3(.55,.9,1.), step(1.15,w)*.55); c+=vec3(1.)*step(1.55,w)*.5;
      float foam=smoothstep(.9,.99,r)*(.6+.4*sin(atan(vP.y,vP.x)*14.+uT*3.)); c=mix(c,vec3(.95,1.,1.),foam);
      gl_FragColor=vec4(c,.93); }` });
}
// ---------- 나무·꽃·풀 ----------
function nature() {
  const trunks = [], crowns = [], pines = [], bushes = [], flowers = [], grass = [], rocks = [];
  const tryPos = (rmin, rmax, m) => { for (let k = 0; k < 30; k++) { const a = R() * 6.283, r = RR(rmin, rmax), x = Math.cos(a) * r, z = Math.sin(a) * r; if (!busy(x, z, m)) return [x, z]; } return null; };
  const greens = [0x5ab84a, 0x4aa85a, 0x7ac85a, 0x8ad04a, 0x3a9a5a];
  for (let k = 0; k < 70; k++) { const p = tryPos(k < 20 ? 12 : 22, k < 20 ? 22 : 34, 1.2); if (!p) continue; const [x, z] = p, s = RR(.8, 1.35);
    if (R() < .35) { pines.push({ x, y: 1.6 * s, z, s, c: greens[k % 5] }); trunks.push({ x, y: .4 * s, z, sx: s, sy: s * .6, sz: s }); }
    else { trunks.push({ x, y: .7 * s, z, s }); crowns.push({ x, y: 2.2 * s, z, s: s * RR(.9, 1.15), ry: R() * 6, c: greens[k % 5] }); if (R() < .5) crowns.push({ x: x + RR(-.5, .5), y: 2.9 * s, z: z + RR(-.5, .5), s: s * .7, ry: R() * 6, c: greens[(k + 2) % 5] }); }
    if (s < .9) blockers.push([x, z, .5]); else blockers.push([x, z, .7]); }
  // 꽃 핀 나무 (벚꽃)
  const blossoms = [];
  for (const [x, z] of [[-6, -6.5], [6, 6.5], [-6.5, 6], [12, 9], [13, -6], [29, 10], [29, -6], [16, -8], [-3, -19]]) { if (near(x, z, blockers)) continue; trunks.push({ x, y: .7, z, s: 1 }); blossoms.push({ x, y: 2.3, z, s: 1.15, ry: R() * 6, c: [0xffb0d0, 0xffc8e0, 0xff9ac0][(R() * 3) | 0] }); blockers.push([x, z, .6]); }
  for (let k = 0; k < 90; k++) { const p = tryPos(8, 33, .3); if (!p) continue; bushes.push({ x: p[0], y: .35, z: p[1], sx: RR(.6, 1.1), sy: RR(.5, .8), sz: RR(.6, 1.1), ry: R() * 6, c: greens[(R() * 5) | 0] }); }
  const FC = [0xff6a8a, 0xffd23a, 0xffffff, 0xb07aff, 0xff9a3a, 0x6ac8ff, 0xff8ad8];
  for (let k = 0; k < 520; k++) { const p = tryPos(3, 34, 0); if (!p) continue; flowers.push({ x: p[0], y: .28, z: p[1], s: RR(.09, .15), c: FC[(R() * FC.length) | 0] }); }
  // 화단 (광장·호수 주변)
  const bed = (cx, cz, r) => { for (let k = 0; k < 24; k++) { const a = R() * 6.283, d = Math.sqrt(R()) * r; flowers.push({ x: cx + Math.cos(a) * d, y: .36, z: cz + Math.sin(a) * d, s: RR(.13, .2), c: FC[(R() * FC.length) | 0] }); } bushes.push({ x: cx, y: .2, z: cz, sx: r * 1.1, sy: .25, sz: r * 1.1, c: 0x4a9a3a }); };
  for (const [a, rr] of [[.6, 9.2], [2.1, 9.2], [3.9, 9.2], [5.2, 9.2]]) bed(Math.cos(a) * rr, Math.sin(a) * rr, 1);
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + .39; if (Math.abs(Math.sin(a)) < .4 && Math.cos(a) < 0) continue; bed(LAKE.x + Math.cos(a) * 11.8, LAKE.y + Math.sin(a) * 11.8, .9); }
  for (let k = 0; k < 2600; k++) { const a = R() * 6.283, r = Math.sqrt(R()) * 35, x = Math.cos(a) * r, z = Math.sin(a) * r; if (busy(x, z, -.6)) continue; grass.push({ x, y: 0, z, sx: RR(.8, 1.3), sy: RR(.6, 1.4), sz: RR(.8, 1.3), ry: R() * 6, c: greens[(R() * 5) | 0] }); }
  for (let k = 0; k < 40; k++) { const p = tryPos(10, 34, .4); if (!p) continue; rocks.push({ x: p[0], y: .1, z: p[1], sx: RR(.3, .8), sy: RR(.25, .5), sz: RR(.3, .7), ry: R() * 6, c: [0x9a9aa8, 0xa8a898, 0x8a8a98][k % 3] }); }
  inst(Cyl(.2, .3, 1.4, 7), toon(0x7a5a3a), trunks, T, .02);
  inst(new THREE.IcosahedronGeometry(1.3, 1), toon(0xffffff), crowns, T, .035);
  inst(new THREE.IcosahedronGeometry(1.35, 1), toon(0xffffff), blossoms, T, .035);
  const pg = new THREE.ConeGeometry(1.1, 3.4, 8); inst(pg, toon(0xffffff), pines, T, .03);
  inst(new THREE.IcosahedronGeometry(.7, 1), toon(0xffffff), bushes, T, .025);
  inst(new THREE.IcosahedronGeometry(1, 0), toon(0xffffff, { emissive: 0x111111 }), flowers, T, 0, false);
  const gg = new THREE.ConeGeometry(.07, .55, 3); gg.translate(0, .27, 0); inst(gg, sway(toon(0xffffff), .35), grass, T, 0, false);
  inst(new THREE.DodecahedronGeometry(1, 0), toon(0xffffff), rocks, T, .025);
  return blossoms;
}
// ---------- 가로등 ----------
function lamp(x, z) {
  mk(Cyl(.09, .13, 3, 8), toon(0x2a2a34), x, 1.5, z, T, .015); mk(Cyl(.22, .26, .25, 8), toon(0x2a2a34), x, .12, z, T, .015);
  mk(Box(.36, .5, .36), glow(0xffd27a, 2.2), x, 3.2, z, T, .015); mk(new THREE.ConeGeometry(.34, .3, 4), toon(0x2a2a34), x, 3.6, z, T, .015).rotation.y = Math.PI / 4;
  halo(0xffc070, 2.6, T, x, 3.2, z); blockers.push([x, z, .35]);
}
// ---------- 깃발 (펄럭임) ----------
const flags = [];
function banner(x, z, c, h = 4.2, w = .9, len = 1.9) {
  mk(Cyl(.07, .09, h, 8), toon(0x6a5a4a), x, h / 2, z, T, .015); mk(new THREE.SphereGeometry(.13, 10, 8), glow(0xffd27a, 1.5), x, h + .08, z, T, 0);
  const geo = new THREE.PlaneGeometry(w, len, 8, 6); geo.translate(w / 2, -len / 2, 0); const m = new THREE.Mesh(geo, toon(c, { side: THREE.DoubleSide })); m.position.set(x + .05, h - .15, z); m.castShadow = true; T.add(m);
  const em = new THREE.Mesh(new THREE.CircleGeometry(.22, 16), glow(0xffe08a, .7)); m.add(em);
  flags.push({ m, base: geo.attributes.position.array.slice(), ph: R() * 6, w, em, len }); blockers.push([x, z, .3]);
}
// 줄에 매단 삼각 깃발
function bunting(a, b, h = 4.3) {
  const L = [], n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / .55), cs = [0xff5a6a, 0xffd23a, 0x5ac8ff, 0x7ad85a, 0xff8ad8, 0xffffff];
  for (let k = 1; k < n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = h - Math.sin(t * Math.PI) * .9; L.push({ x, y, z, s: .9, ry: Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2, c: cs[k % cs.length] }); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-.2, 0, 0, .2, 0, 0, 0, -.42, 0], 3)); g.computeVertexNormals();
  inst(g, sway(toon(0xffffff, { side: THREE.DoubleSide }), .5, '-position.y*2.'), L, T, 0, false);
}
// ---------- 풍차 ----------
function windmill(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); T.add(g);
  mk(Cyl(1.3, 2, 6.5, 10), toon(0xf0e6d0), 0, 3.25, 0, g, .04); mk(new THREE.ConeGeometry(1.8, 2.2, 10), toon(0xc04a3a), 0, 7.6, 0, g, .04);
  mk(Box(1, 1.6, .2), toon(0x7a4a26), 0, .8, 1.9, g, .02); mk(Box(.6, .6, .15), glow(0xffd98a, .8), 0, 4, 1.62, g, .015);
  const hub = new THREE.Group(); hub.position.set(0, 6.2, 1.55); g.add(hub); mk(Cyl(.3, .3, .5, 10), toon(0x5a3a22), 0, 0, 0, hub, .02).rotation.x = Math.PI / 2;
  for (let k = 0; k < 4; k++) { const bl = new THREE.Group(); bl.rotation.z = k * Math.PI / 2; hub.add(bl); mk(Box(.16, 4.6, .12), toon(0x6a4a2a), 0, 2.4, .2, bl, .015); mk(Box(.95, 3.6, .05), toon(0xfaf4e4), .55, 2.7, .22, bl, .015); }
  anims.push((t, dt) => hub.rotation.z += dt * .9); blockers.push([x, z, 2.4]);
  labels.push({ obj: g, y: 9.3, html: '풍차', cls: 'deco' });
}
// ---------- 출정의 문 ----------
const portal = {};
function gate() {
  const pg = new THREE.Group(); pg.position.set(PORTAL.x, 0, PORTAL.y); T.add(pg);
  mk(Cyl(3.6, 3.9, .3, 32), toon(0xb8acc8), 0, .15, 0, pg, .03);
  for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; const b = mk(Box(.75, .6, .85), toon(k % 2 ? 0x8a8098 : 0x9a90a8), Math.cos(a) * 2.3, 2.4 + Math.sin(a) * 2.3, 0, pg, .03); b.rotation.z = a; }
  for (const s of [-1, 1]) { mk(Box(.85, 2.4, .95), toon(0x8a8098), s * 2.3, 1.2, 0, pg, .03); const c = mk(new THREE.OctahedronGeometry(.32), glow(0xc07aff, 2), s * 2.3, 2.95, .55, pg, 0); anims.push(t => c.rotation.y = t * 2); }
  const kc = mk(new THREE.OctahedronGeometry(.45), glow(0xe0b0ff, 2.4), 0, 4.95, .2, pg, 0); anims.push(t => { kc.rotation.y = t * 1.5; kc.position.y = 4.95 + Math.sin(t * 3) * .08; });
  const disk = new THREE.Mesh(new THREE.CircleGeometry(2.05, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb07aff).multiplyScalar(1.6), transparent: true, opacity: .85, side: THREE.DoubleSide, toneMapped: false })); disk.position.y = 2.4; pg.add(disk);
  const sw = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.9, 40, 1, 0, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); sw.position.set(0, 2.4, .02); pg.add(sw);
  const pl = new THREE.PointLight(0xc07aff, 30, 14); pl.position.set(0, 2.5, 1.5); pg.add(pl);
  const N = 70, P = points(N, true, .22), pa = P.geometry.attributes.position.array, ca = P.geometry.attributes.color.array, ph = Array.from({ length: N }, () => [R(), R() * 6.283]);
  for (let i = 0; i < N; i++) { col.setHSL(.78, .9, .7); ca.set([col.r, col.g, col.b], i * 3); }
  anims.push((t, dt) => { sw.rotation.z -= dt * 3; disk.material.opacity = .7 + Math.sin(t * 4) * .15;
    for (let i = 0; i < N; i++) { const [p0, a] = ph[i], k = (t * .5 + p0) % 1, r = 2.2 * (1 - k); pa[i * 3] = PORTAL.x + Math.cos(a + t * 2) * r; pa[i * 3 + 1] = 2.4 + Math.sin(a + t * 2) * r; pa[i * 3 + 2] = PORTAL.y + .3; } P.geometry.attributes.position.needsUpdate = true; });
  blockers.push([-2.3, PORTAL.y, .75], [2.3, PORTAL.y, .75]);
  labels.push({ obj: pg, y: 6.2, html: '🌀 출정의 문<small>들어가면 디펜스 시작</small>', cls: 'go' });
  banner(-4.2, PORTAL.y + 1.5, 0xb03050, 5); banner(4.2, PORTAL.y + 1.5, 0x3050b0, 5);
}
// ---------- 호수광장 + 여신탑 ----------
export const tower = new THREE.Group(); export let smith = null; export const SMITH = new THREE.Vector2(-9, -12);
export let shop = null; export const SHOP_P = new THREE.Vector2(9, -10); // 상점 (마을 로컬)
export const shopFront = () => { const L = SHOP_P.length(); return new THREE.Vector3(SHOP_P.x - SHOP_P.x / L * 3.6, 0, SHOP_P.y - SHOP_P.y / L * 3.6); };
export let lab = null; export const LAB = new THREE.Vector2(-9.5, 16.5), LAB_ROT = .45, labFx = { t: 0 }; // 정문이 남남동(기본 카메라 쪽)을 향함
// 연구소 앞 접근 지점 (정문 앞, 마을 로컬)
export const labFront = () => { const a = LAB_ROT; return new THREE.Vector3(LAB.x + Math.sin(a) * 4.0, 0, LAB.y + Math.cos(a) * 4.0); }; // 타워 연구소 (마을 로컬)
function lakePlaza() {
  const LX = LAKE.x, LZ = LAKE.y, wm = waterMat(LR);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LR, 64), wm); lake.rotation.x = -Math.PI / 2; lake.position.set(LX, .07, LZ); T.add(lake);
  const rim = mk(new THREE.TorusGeometry(LR + .1, .38, 8, 64), toon(0xd8d0c0), LX, .12, LZ, T, .03); rim.rotation.x = Math.PI / 2; rim.scale.z = .6;
  const rr = []; for (let k = 0; k < 46; k++) { const a = k / 46 * 6.283 + RR(-.03, .03); if (Math.abs(Math.sin(a)) < .17 && Math.cos(a) < 0) continue; rr.push({ x: LX + Math.cos(a) * (LR + .25), y: .25, z: LZ + Math.sin(a) * (LR + .25), sx: RR(.35, .55), sy: RR(.25, .4), sz: RR(.35, .5), ry: R() * 6, c: [0xc8c0b0, 0xb8b0a0, 0xe0d8c8][k % 3] }); }
  inst(new THREE.DodecahedronGeometry(1, 0), toon(0xffffff), rr, T, .02);
  // 연잎·연꽃
  const pads = [], lot = []; for (let k = 0; k < 16; k++) { const a = R() * 6.283, d = RR(3.2, LR - .8); const x = LX + Math.cos(a) * d, z = LZ + Math.sin(a) * d; if (Math.abs(z - LZ) < 1.4 && x < LX) continue; pads.push({ x, y: .1, z, s: RR(.35, .6), ry: R() * 6, c: [0x4aa84a, 0x5ab85a][k % 2] }); if (k % 3 === 0) lot.push({ x, y: .2, z, s: .16, c: [0xff9ac8, 0xffffff][k % 2] }); }
  const pgeo = new THREE.CircleGeometry(1, 16, .3, 5.8); pgeo.rotateX(-Math.PI / 2); inst(pgeo, toon(0xffffff, { side: THREE.DoubleSide }), pads, T, 0, false); inst(new THREE.IcosahedronGeometry(1, 0), glow(0xffd0e8, .5), lot, T, 0, false);
  // 물결 링
  for (let k = 0; k < 5; k++) { const rg = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5, depthWrite: false })); rg.rotation.x = -Math.PI / 2; T.add(rg); const ph = k / 5;
    let cx = 0, cz = 0, lastK = 1; anims.push(t => { const q = (t * .3 + ph) % 1; if (q < lastK) { const a = R() * 6.283, d = RR(3.2, LR - 1.2); cx = LX + Math.cos(a) * d; cz = LZ + Math.sin(a) * d; } lastK = q; rg.position.set(cx, .1, cz); rg.scale.setScalar(.3 + q * 1.6); rg.material.opacity = .55 * (1 - q); }); }
  // 섬 + 다리
  mk(Cyl(2.75, 3, .5, 24), toon(0xd8d0c0), LX, .2, LZ, T, .03); mk(Cyl(2.55, 2.55, .08, 24), toon(0xece4d4), LX, .48, LZ, T, .02);
  const planks = []; for (let x = LX - LR - 1.4; x < LX - 2.4; x += .42) planks.push({ x, y: .18, z: LZ, sx: .36, sy: .12, sz: 2.2, c: [0xa87a4a, 0x9a6a3a, 0xb88a5a][(R() * 3) | 0] });
  inst(Box(1, 1, 1), toon(0xffffff), planks, T, .015);
  for (const s of [-1, 1]) { for (let x = LX - LR - 1.3; x < LX - 2.3; x += 1.1) mk(Cyl(.08, .08, .9, 6), toon(0x7a5a3a), x, .55, LZ + s * 1.05, T, .012); mk(Box(LR - .9, .1, .1), toon(0x8a6a4a), LX - LR / 2 - 1.85, .95, LZ + s * 1.05, T, .012); }
  // 여신탑
  tower.position.set(LX, .5, LZ); T.add(tower); const M = toon(0xd6d2ea), Gd = toon(0xf0b84a, { emissive: 0x2a1a04 });
  mk(Cyl(2.1, 2.3, .5, 8), M, 0, .25, 0, tower, .035); mk(Cyl(1.8, 2.0, .4, 8), toon(0xc4c0dc), 0, .7, 0, tower, .03);
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + Math.PI / 8; mk(Cyl(.16, .2, 3.2, 8), M, Math.cos(a) * 1.55, 2.5, Math.sin(a) * 1.55, tower, .02); }
  mk(Cyl(1.15, 1.35, 3.4, 12), toon(0xcac6e2), 0, 2.6, 0, tower, .035); mk(Cyl(1.85, 1.85, .35, 8), Gd, 0, 4.25, 0, tower, .03);
  mk(Cyl(.8, 1.1, 5.2, 12), M, 0, 7, 0, tower, .035);
  for (const y of [5.2, 7, 8.8]) { const b = mk(new THREE.TorusGeometry(y === 7 ? .97 : y < 6 ? 1.06 : .86, .1, 6, 24), Gd, 0, y, 0, tower, .015); b.rotation.x = Math.PI / 2; }
  for (let k = 0; k < 4; k++) { const a = k / 4 * 6.283; const wn = mk(Box(.32, .8, .1), glow(0x9ae8ff, 1.2), Math.cos(a) * .95, 7.4, Math.sin(a) * .95, tower, 0); wn.rotation.y = -a + Math.PI / 2; }
  mk(Cyl(1.5, 1.0, .5, 12), Gd, 0, 9.85, 0, tower, .03); mk(Cyl(1.6, 1.6, .15, 12), M, 0, 10.15, 0, tower, .02);
  // 여신상
  const st = new THREE.Group(); st.position.y = 10.2; tower.add(st); const SM = toon(0xf0e8dc, { emissive: 0x141008 }), HM = toon(0xf0c860, { emissive: 0x1a1004 });
  mk(new THREE.ConeGeometry(.75, 2.1, 16), SM, 0, 1.05, 0, st, .025); mk(Cyl(.24, .34, .7, 12), SM, 0, 2.3, 0, st, .02); mk(new THREE.SphereGeometry(.3, 16, 12), SM, 0, 2.95, 0, st, .02);
  const hair = mk(new THREE.SphereGeometry(.34, 16, 12, 0, 6.283, 0, 1.9), HM, 0, 3.0, -.04, st, .02); hair.rotation.x = -.25; mk(new THREE.ConeGeometry(.3, 1.1, 10), HM, 0, 2.45, -.22, st, .015);
  for (const s of [-1, 1]) { const arm = mk(Cyl(.07, .09, 1.0, 8), SM, s * .42, 2.75, .05, st, .015); arm.rotation.z = -s * 2.5;
    const wing = mk(new THREE.SphereGeometry(1, 14, 10), toon(0xe8ecf8, { emissive: 0x101420 }), s * .85, 2.5, -.35, st, .02); wing.scale.set(.85, 1.25, .12); wing.rotation.set(.2, s * .5, -s * .5); anims.push(t => wing.rotation.z = -s * (.5 + Math.sin(t * 1.5) * .08)); }
  const orbS = mk(new THREE.IcosahedronGeometry(.28, 2), glow(0xfff0b0, 2), 0, 3.85, .1, st, 0); halo(0xffe8a0, 1.8, st, 0, 3.85, .1);
  const hal = mk(new THREE.TorusGeometry(.42, .045, 8, 32), glow(0xffd27a, 1.6), 0, 3.15, -.25, st, 0);
  // 떠다니는 룬 고리·수정
  const runes = []; for (const [y, r, sp] of [[3.2, 2.3, .6], [6.2, 1.7, -.9], [9.2, 2.0, .7]]) { const rg = mk(new THREE.TorusGeometry(r, .05, 6, 64), glow(0x9ae8ff, 1.3), 0, y, 0, tower, 0); rg.rotation.x = Math.PI / 2; runes.push([rg, sp, y]); }
  const crys = []; for (let k = 0; k < 4; k++) { const c = mk(new THREE.OctahedronGeometry(.3), glow([0x9ae8ff, 0xffd27a, 0xff9ad8, 0xb07aff][k], 2.2), 0, 0, 0, tower, 0); c.scale.y = 1.6; crys.push(c); }
  // 빛 기둥
  const beamMat = new THREE.ShaderMaterial({ uniforms: { uT: U.uT }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: 'varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uT; varying vec2 vU; void main(){ float y=clamp(vU.y,0.,1.); float a=pow(max(1.-y,0.),1.6)*(.35+.15*sin(uT*3.-y*30.))*(.7+.3*sin(vU.x*62.83+uT*2.)); gl_FragColor=vec4(vec3(1.,.88,.55)*1.2, clamp(a*.3,0.,1.)); }' });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.55, .9, 46, 24, 1, true), beamMat); beam.position.y = 14 + 23; tower.add(beam);
  const gr = new THREE.Mesh(new THREE.RingGeometry(2.8, 4.2, 48), new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); gr.rotation.x = -Math.PI / 2; gr.position.set(LX, .11, LZ); T.add(gr);
  const pl = new THREE.PointLight(0xffe0a0, 16, 18); pl.position.set(0, 9, 2); tower.add(pl);
  const N = 160, P = points(N, true, .2), pa = P.geometry.attributes.position.array, ca = P.geometry.attributes.color.array, ph = Array.from({ length: N }, () => [R(), R() * 6.283, RR(.6, 2.6)]);
  for (let i = 0; i < N; i++) { col.setHSL(R() < .6 ? .13 : .52, .9, .72); ca.set([col.r, col.g, col.b], i * 3); }
  anims.push((t, dt) => { for (const [rg, sp, y] of runes) { rg.rotation.z += dt * sp; rg.position.y = y + Math.sin(t * 1.3 + y) * .15; }
    crys.forEach((c, k) => { const a = t * .7 + k * 1.571; c.position.set(Math.cos(a) * 2.6, 5.4 + Math.sin(t * 2 + k) * .5, Math.sin(a) * 2.6); c.rotation.y = t * 2; });
    orbS.position.y = 3.85 + Math.sin(t * 2) * .08; hal.rotation.z = t; st.rotation.y = Math.sin(t * .4) * .25; gr.material.opacity = .25 + Math.sin(t * 2) * .1; pl.intensity = 15 + Math.sin(t * 3) * 3;
    for (let i = 0; i < N; i++) { const [p0, a, r] = ph[i], k = (t * .12 + p0) % 1; pa[i * 3] = LX + Math.cos(a + t * .8) * r * (1 - k * .5); pa[i * 3 + 1] = .6 + k * 16; pa[i * 3 + 2] = LZ + Math.sin(a + t * .8) * r * (1 - k * .5); P.geometry.attributes.aA.array[i] = Math.sin(k * Math.PI); }
    P.geometry.attributes.position.needsUpdate = true; P.geometry.attributes.aA.needsUpdate = true; });
  labels.push({ obj: tower, y: 15.3, html: '🏛 여신탑<small>여신의 축복 · 영구 강화</small>', cls: 'bless' });
  // 광장 장식: 아치 입구, 가로등, 깃발, 벤치
  const ax = LX - 10.9, ag = new THREE.Group(); ag.position.set(ax, 0, LZ); ag.rotation.y = Math.PI / 2; T.add(ag);
  for (const s of [-1, 1]) { mk(Box(.5, 2.2, .5), M, s * 1.9, 1.1, 0, ag, .03); mk(Box(.7, .25, .7), Gd, s * 1.9, 2.3, 0, ag, .02); }
  for (const s of [-1, 1]) { const c = mk(new THREE.OctahedronGeometry(.28), glow(0x9ae8ff, 1.6), s * 1.9, 2.85, 0, ag, 0); anims.push(t => { c.rotation.y = t * 1.8; c.position.y = 2.85 + Math.sin(t * 2 + s) * .1; }); }
  const sp = new THREE.Group(); sp.position.set(ax - 1.2, 0, LZ + 2.9); T.add(sp); mk(Cyl(.08, .1, 2.2, 6), toon(0x6a4a2a), 0, 1.1, 0, sp, .015);
  const stx = signTex('호수광장', '#2a4a7a'); const sg = new THREE.Mesh(new THREE.BoxGeometry(1.8, .62, .08), [Gd, Gd, Gd, Gd, new THREE.MeshToonMaterial({ map: stx }), new THREE.MeshToonMaterial({ map: stx })]); sg.position.y = 2.0; sg.castShadow = true; sp.add(sg); blockers.push([ax - 1.2, LZ + 2.9, .3]);
  blockers.push([ax, LZ - 1.9, .5], [ax, LZ + 1.9, .5]); bunting([ax, LZ - 1.9], [ax - 6, LZ - 1.5], 3.6); bunting([ax, LZ + 1.9], [ax - 6, LZ + 1.5], 3.6);
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + .39; const x = LX + Math.cos(a) * 9.6, z = LZ + Math.sin(a) * 9.6; if (k % 2) lamp(x, z); else banner(x, z, [0x3a6ac0, 0xb03a6a, 0x3aa07a, 0xc08a2a][k / 2]); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * 6.283 + .785 + .39, x = LX + Math.cos(a) * 8.3, z = LZ + Math.sin(a) * 8.3, bg = new THREE.Group(); bg.position.set(x, 0, z); bg.rotation.y = -a + Math.PI / 2; T.add(bg);
    mk(Box(1.8, .12, .5), toon(0xa87a4a), 0, .5, 0, bg, .015); mk(Box(1.8, .5, .1), toon(0xa87a4a), 0, .85, -.25, bg, .015); for (const s of [-1, 1]) mk(Box(.12, .5, .5), toon(0x3a3a44), s * .8, .25, 0, bg, .01); blockers.push([x, z, .7]); }
}
// ---------- 타워 연구소: 둥근 석조 탑 + 유리 돔 천문대 + 회전하는 혼천의 + 미니 타워 받침대 (난수 R() 미사용 → 기존 마을 배치 불변) ----------
function laboratory() {
  const g = new THREE.Group(); g.position.set(LAB.x, 0, LAB.y); g.rotation.y = LAB_ROT; T.add(g); lab = g;
  const st = toon(0xcfc8e0), st2 = toon(0x9a92b8), br = toon(0xd8a040, { emissive: 0x2a1804 }), wd = toon(0x6a4a2a), BL = 0x6ad8ff;
  mk(Cyl(2.9, 3.1, .4, 16), toon(0x8f887a), 0, .2, 0, g, .03); mk(Cyl(2.5, 2.6, .25, 16), st2, 0, .52, 0, g, .02);
  mk(Cyl(2.1, 2.3, 3.4, 16), st, 0, 2.3, 0, g, .04); // 몸통
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; mk(Box(.32, 3.4, .32), st2, Math.cos(a) * 2.18, 2.3, Math.sin(a) * 2.18, g, .015).rotation.y = -a; }
  for (const y of [1.0, 3.95]) mk(new THREE.TorusGeometry(2.2, .09, 6, 32), br, 0, y, 0, g, .015).rotation.x = Math.PI / 2;
  const winM = glow(BL, 1.6); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + .52; const w = mk(Box(.5, .9, .12), winM, Math.cos(a) * 2.16, 2.6, Math.sin(a) * 2.16, g, 0); w.rotation.y = -a + Math.PI / 2; mk(Box(.62, .1, .2), br, Math.cos(a) * 2.2, 3.08, Math.sin(a) * 2.2, g, 0).rotation.y = -a + Math.PI / 2; }
  mk(Cyl(2.45, 2.35, .35, 16), st2, 0, 4.2, 0, g, .03); // 처마
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; mk(Box(.36, .36, .36), st, Math.cos(a) * 2.3, 4.55, Math.sin(a) * 2.3, g, .015); }
  // 유리 돔 + 내부 빛
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.75, 24, 12, 0, 6.283, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x9ae8ff, emissive: 0x1a4a6a, transparent: true, opacity: .55, depthWrite: false })); dome.position.y = 4.4; g.add(dome);
  for (let k = 0; k < 6; k++) { const rib = mk(new THREE.TorusGeometry(1.76, .05, 5, 20, Math.PI), br, 0, 4.4, 0, g, 0); rib.rotation.y = k / 6 * Math.PI; }
  const core = mk(new THREE.IcosahedronGeometry(.42, 1), glow(BL, 3), 0, 5.2, 0, g, 0);
  // 혼천의 (회전 고리 3개)
  const arm = new THREE.Group(); arm.position.y = 7.1; g.add(arm); mk(Cyl(.07, .07, 1.2, 6), br, 0, 6.3, 0, g, .01);
  const rings = [0xffd27a, BL, 0xc08aff].map((c, k) => { const r = mk(new THREE.TorusGeometry(.95 - k * .18, .05, 6, 40), glow(c, 1.8), 0, 0, 0, arm, .01); r.rotation.x = k * 1.05; return r; });
  const orb = mk(new THREE.SphereGeometry(.26, 16, 12), glow(0xfff0b0, 2.6), 0, 0, 0, arm, 0);
  // 정문 + 간판
  mk(Box(1.3, 2.1, .3), wd, 0, 1.6, 2.15, g, .02); mk(new THREE.TorusGeometry(.65, .12, 6, 16, Math.PI), st2, 0, 2.65, 2.2, g, .015);
  mk(new THREE.SphereGeometry(.08, 8, 6), br, .42, 1.6, 2.33, g, 0);
  const tx = signTex('연구소', '#22305a'); const sg = new THREE.Mesh(Box(1.9, .66, .1), [br, br, br, br, new THREE.MeshToonMaterial({ map: tx }), new THREE.MeshToonMaterial({ map: tx })]); sg.position.set(0, 3.35, 2.32); sg.castShadow = true; g.add(sg);
  // 미니 타워 받침대 3개 (화살·대포·마법), 앞마당에 반원 배치
  const peds = [[-2.5, 2.8, 0x3a7aff], [2.5, 2.8, 0xff8a3a], [3.15, .2, 0xc07aff]].map(([x, z, c], k) => { const p = new THREE.Group(); p.position.set(x, 0, z); g.add(p);
    mk(Cyl(.42, .5, .7, 8), st2, 0, .35, 0, p, .02); mk(Cyl(.48, .48, .08, 8), br, 0, .72, 0, p, 0);
    const mini = new THREE.Group(); mini.position.y = 1.15; p.add(mini);
    if (k === 0) { mk(Cyl(.16, .22, .55, 8), st, 0, 0, 0, mini, .012); mk(new THREE.ConeGeometry(.3, .35, 8), toon(c), 0, .45, 0, mini, .012); }
    else if (k === 1) { mk(Cyl(.26, .3, .3, 10), st2, 0, -.1, 0, mini, .012); const b = mk(Cyl(.07, .1, .45, 8), toon(0x30333e), 0, .1, .15, mini, .012); b.rotation.x = 1.2; }
    else { mk(Cyl(.12, .2, .45, 6), toon(0x6a4aa8), 0, -.05, 0, mini, .012); const cr = mk(new THREE.OctahedronGeometry(.17), glow(c, 2.4), 0, .35, 0, mini, 0); cr.scale.y = 1.5; }
    const beam = new THREE.Mesh(Cyl(.32, .42, 1.1, 12, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); beam.position.y = 1.25; p.add(beam);
    const wp = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y); blockers.push([LAB.x + wp.x, LAB.y + wp.z, .65]);
    return { mini, beam, k }; });
  // 연금술 플라스크 굴뚝 + 떠다니는 책·수정
  mk(Cyl(.22, .26, 1.4, 8), st2, -1.3, 5.0, -1.1, g, .02); const fl = mk(new THREE.SphereGeometry(.38, 12, 10), glow(0x7aff9a, 1.4), -1.3, 6.0, -1.1, g, .015);
  const books = [0xd04a5a, 0x4a7ad0, 0x5ab85a, 0xe0b040].map((c, k) => { const b = mk(Box(.42, .1, .3), toon(c), 0, 0, 0, g, .012); b.userData.k = k; return b; });
  const N = 70, PP = points(N, true, .18), pa = PP.geometry.attributes.position.array, ca = PP.geometry.attributes.color.array, pA = PP.geometry.attributes.aA.array;
  for (let i = 0; i < N; i++) { col.set([BL, 0x7aff9a, 0xffd27a, 0xc08aff][i % 4]); ca.set([col.r, col.g, col.b], i * 3); }
  const gl = new THREE.PointLight(BL, 10, 12); gl.position.set(0, 5.2, 0); g.add(gl);
  const _w = new THREE.Vector3();
  anims.push((t, dt) => { const boost = labFx.t > 0 ? (labFx.t -= dt, 1 + labFx.t * 4) : 1; arm.scale.setScalar(1 + (boost - 1) * .15); rings.forEach((r, k) => { r.rotation.y += dt * (.8 + k * .5) * boost; r.rotation.z += dt * (k % 2 ? -.6 : .4); }); orb.scale.setScalar(1 + Math.sin(t * 4) * .1); arm.rotation.y = t * .3;
    core.rotation.y = t; core.rotation.x = t * .6; core.position.y = 5.2 + Math.sin(t * 1.7) * .15; gl.intensity = (9 + Math.sin(t * 3) * 2.5) * boost; winM.emissiveIntensity = 1.4 + Math.sin(t * 2.3) * .4;
    peds.forEach(p => { p.mini.rotation.y = t * .9 + p.k; p.mini.position.y = 1.15 + Math.sin(t * 2 + p.k * 2) * .08; p.beam.material.opacity = .18 + Math.sin(t * 3 + p.k) * .08; });
    fl.scale.setScalar(1 + Math.sin(t * 5) * .06);
    books.forEach(b => { const k = b.userData.k, a = t * .6 + k * 1.571; b.position.set(Math.cos(a) * 3.0, 3.1 + Math.sin(t * 1.5 + k) * .35, Math.sin(a) * 3.0); b.rotation.set(Math.sin(t + k) * .3, -a, Math.cos(t * 1.3 + k) * .2); });
    for (let i = 0; i < N; i++) { const q = (t * .18 + i / N) % 1, a = i * 2.39996 + t * .5, r = 1.2 + (i % 5) * .35; pa[i * 3] = LAB.x + Math.cos(a) * r * (1 - q * .4); pa[i * 3 + 1] = .8 + q * 8; pa[i * 3 + 2] = LAB.y + Math.sin(a) * r * (1 - q * .4); pA[i] = Math.sin(q * Math.PI); }
    PP.geometry.attributes.position.needsUpdate = true; PP.geometry.attributes.aA.needsUpdate = true; });
  blockers.push([LAB.x, LAB.y, 3.2]); labels.push({ obj: g, y: 8.6, html: '🔬 타워 연구소<small>타워 영구 연구</small>', cls: 'lab' });
}
// ---------- 하늘 생물·꽃잎·반딧불 ----------
function ambient() {
  const N = 110, F = points(N, true, .16), fa = F.geometry.attributes.position.array, fA = F.geometry.attributes.aA.array, fc = F.geometry.attributes.color.array, fp = [];
  for (let i = 0; i < N; i++) { const a = R() * 6.283, r = Math.sqrt(R()) * 30; fp.push([Math.cos(a) * r, RR(.4, 3), Math.sin(a) * r, R() * 6]); col.setHSL(RR(.12, .2), 1, .65); fc.set([col.r, col.g, col.b], i * 3); }
  const M = 150, Pt = points(M, false, .2), pa = Pt.geometry.attributes.position.array, pc = Pt.geometry.attributes.color.array, pp = [];
  for (let i = 0; i < M; i++) { pp.push([RR(-30, 30), RR(0, 12), RR(-30, 30), R() * 6, RR(.4, .8)]); col.set([0xffb0d0, 0xffc8e0, 0xffe0f0, 0xffffff][i % 4]); pc.set([col.r, col.g, col.b], i * 3); }
  anims.push((t, dt) => {
    for (let i = 0; i < N; i++) { const [x, y, z, ph] = fp[i]; fa[i * 3] = x + Math.sin(t * .5 + ph) * 1.2; fa[i * 3 + 1] = y + Math.sin(t * .8 + ph * 2) * .4; fa[i * 3 + 2] = z + Math.cos(t * .4 + ph) * 1.2; fA[i] = .35 + .65 * Math.max(0, Math.sin(t * 2.2 + ph * 3)); }
    F.geometry.attributes.position.needsUpdate = true; F.geometry.attributes.aA.needsUpdate = true;
    for (let i = 0; i < M; i++) { const p = pp[i]; p[1] -= dt * p[4]; p[0] += dt * (.6 + Math.sin(t + p[3]) * .5); if (p[1] < 0 || p[0] > 32) { p[1] = RR(9, 13); p[0] = RR(-32, 20); p[2] = RR(-30, 30); } pa[i * 3] = p[0] + Math.sin(t * 2 + p[3]) * .3; pa[i * 3 + 1] = p[1]; pa[i * 3 + 2] = p[2] + Math.cos(t * 1.7 + p[3]) * .3; }
    Pt.geometry.attributes.position.needsUpdate = true; });
  // 하늘을 나는 새 무리
  const birds = []; for (let k = 0; k < 7; k++) { const b = new THREE.Group(); b.scale.setScalar(.55); T.add(b); for (const s of [-1, 1]) { const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.15, 0, 0, .15, s * .7, 0, 0], 3)); wgeo.computeVertexNormals(); const wm = new THREE.Mesh(wgeo, toon(0x3a3a4a, { side: THREE.DoubleSide })); b.add(wm); } birds.push([b, k]); }
  anims.push(t => birds.forEach(([b, k]) => { const a = t * .12 + k * .25, r = 26 + (k % 3) * 2; b.position.set(Math.cos(a) * r, 17 + Math.sin(t + k) * .6 + (k % 2), Math.sin(a) * r); b.rotation.y = -a; b.children.forEach((w, i) => w.rotation.z = (i ? 1 : -1) * Math.sin(t * 8 + k) * .6); }));
  // 울타리
  const posts = [], rails = [];
  const fence = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 1.1), ry = Math.atan2(x1 - x0, z1 - z0); for (let k = 0; k <= n; k++) { const t = k / n; posts.push({ x: x0 + (x1 - x0) * t, y: .45, z: z0 + (z1 - z0) * t, c: 0xffffff }); } for (const y of [.35, .7]) rails.push({ x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, sx: .08, sy: .1, sz: len, ry, c: 0xffffff }); blockers.push(...Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n, .35])); };
  fence(-23, -6, -23, -17); fence(-23, -17, -15, -18); fence(5, 17, 12, 20); fence(-13, 13, -17, 18); fence(14, -20, 19, -15);
  inst(Box(.18, .9, .18), toon(0xf4ece0), posts, T, .012); inst(Box(1, 1, 1), toon(0xf4ece0), rails, T, .01);
  // 수레·통·상자 소품
  for (const [x, z] of [[-12.5, 4.5], [5.6, -12.4], [13.2, -11.6]]) { mk(Cyl(.4, .4, .9, 12), toon(0x9a6a3a), x, .45, z, T, .02); mk(new THREE.TorusGeometry(.41, .04, 6, 16), toon(0x3a3a44), x, .7, z, T, 0).rotation.x = Math.PI / 2; mk(Box(.7, .7, .7), toon(0xb88a5a), x + .8, .35, z + .2, T, .02); blockers.push([x + .4, z, .9]); }
}

// ---------- 생성 / 갱신 ----------
export function buildTown(parent) {
  T = parent; ground(); cobbles(); fountain(waterMat(2.05)); gate();
  house({ x: -15, z: -5, w: 4.6, d: 4, h: 3.2, wall: 0x8a7a9a, roof: 0x3a2a5a, trim: 0x2a2236, shutter: 0x5a3a8a, sign: '던전', signBg: '#3a2a5a', smoke: 0x9a8ab0, label: '⚔ 던전<small>준비 중</small>',
    extra: (g, w, d) => { mk(Cyl(1, 1.2, 7, 10), toon(0x5a4a6a), w / 2 + .6, 3.5, -d / 2 + .2, g, .04); mk(new THREE.ConeGeometry(1.45, 2.4, 10), toon(0x2a1a4a), w / 2 + .6, 8.2, -d / 2 + .2, g, .04); const f = mk(new THREE.OctahedronGeometry(.3), glow(0xb07aff, 2.5), w / 2 + .6, 9.9, -d / 2 + .2, g, 0); anims.push(t => f.rotation.y = t * 2);
      for (const s of [-1, 1]) { mk(Cyl(.06, .08, 1.4, 6), toon(0x2a2a34), s * 1.1, 1.1, d / 2 + .5, g, .01); mk(new THREE.SphereGeometry(.16, 8, 6), glow(0xb07aff, 2.5), s * 1.1, 1.9, d / 2 + .5, g, 0); } } });
  shop = house({ x: 9, z: -10, w: 4.4, d: 3.6, wall: 0xf4e4c0, roof: 0xd04a3a, shutter: 0x3a7ac0, sign: '상점', signBg: '#8a2a22', label: '💰 상점<small>✨ 유료 영웅 로즈</small>', cls: 'shop',
    extra: (g, w, d, h, B, rh) => { for (let k = 0; k < 6; k++) { const aw = mk(Box(w / 6, .1, 1.3), toon(k % 2 ? 0xffffff : 0xff5a5a), -w / 2 + w / 12 + k * w / 6, B + h * .8, d / 2 + .6, g, 0); aw.rotation.x = .38; }
      for (const [x, c] of [[-1.4, 0xffa83a], [1.4, 0x7ad85a]]) { mk(Box(1, .5, .6), toon(0x9a6a3a), x, .65, d / 2 + .9, g, .015); for (let k = 0; k < 5; k++) mk(new THREE.SphereGeometry(.12, 8, 6), toon(c), x - .3 + (k % 3) * .3, .98, d / 2 + .8 + (k > 2) * .2, g, 0); }
      // 신상품 표시: 지붕 위에서 회전하는 분홍 장미 보석 + 빛무리 + 반짝이 고리 (난수 미사용)
      const gem = new THREE.Group(); gem.position.set(0, B + h + rh + 1.3, d / 2 - .4); g.add(gem); const pm = glow(0xff5a9a, 2.6), lm = glow(0x6ad86a, 1.4);
      mk(new THREE.OctahedronGeometry(.42), pm, 0, 0, 0, gem, .02).scale.set(1, 1.35, 1); for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28, p = mk(new THREE.SphereGeometry(.2, 10, 8), pm, Math.cos(a) * .32, -.05, Math.sin(a) * .32, gem, 0); p.scale.set(1, .5, 1); }
      for (const s of [-1, 1]) { const lf = mk(new THREE.SphereGeometry(.16, 8, 6), lm, s * .38, -.45, 0, gem, 0); lf.scale.set(1.3, .35, .7); }
      halo(0xff6aa8, 2.2, g, 0, B + h + rh + 1.3, d / 2 - .4); const rg = new THREE.Mesh(new THREE.TorusGeometry(.75, .03, 6, 40), glow(0xffd0e8, 2)); rg.rotation.x = Math.PI / 2; gem.add(rg);
      anims.push(t => { gem.rotation.y = t * 1.4; gem.position.y = B + h + rh + 1.3 + Math.sin(t * 2.2) * .15; rg.rotation.y = Math.sin(t * 1.3) * .4; rg.scale.setScalar(1 + Math.sin(t * 4) * .08); }); } });
  smith = house({ x: -9, z: -12, w: 4, d: 3.6, wall: 0xa89880, roof: 0x4a4a5a, trim: 0x3a2a1a, shutter: 0x8a4a2a, sign: '대장간', signBg: '#3a3a44', smoke: 0x6a6a72, label: '🔨 대장간<small>강화 · 분해 · 제작</small>', cls: 'smith',
    extra: (g, w, d) => { mk(Box(1.1, .5, .6), toon(0x3a3a44), -w / 2 - .4, .55, d / 2 + 1, g, .02); mk(Box(.5, .5, .4), toon(0x5a5a64), -w / 2 - .4, .2, d / 2 + 1, g, .02);
      const forge = mk(Box(1.2, .9, 1), toon(0x6a5a5a), w / 2 + .9, .45, d / 2 - .3, g, .02); const fire = mk(new THREE.IcosahedronGeometry(.32, 0), glow(0xff7a2a, 3), w / 2 + .9, 1.05, d / 2 - .3, g, 0); halo(0xff8a3a, 2, g, w / 2 + .9, 1.2, d / 2 - .3); anims.push(t => fire.scale.setScalar(1 + Math.sin(t * 15) * .15)); } });
  house({ x: -10, z: 9, w: 5, d: 4, h: 4.4, rh: 2.4, wall: 0xf0dcb0, roof: 0x3a7a4a, shutter: 0xc05a3a, sign: '여관', signBg: '#2a5a3a', label: '🍺 여관<small>준비 중</small>',
    extra: (g, w, d) => { for (const [x, z] of [[w / 2 + .6, d / 2 + .2], [w / 2 + .6, d / 2 - .8]]) { mk(Cyl(.38, .38, .8, 12), toon(0x9a6a3a), x, .4, z, g, .02); mk(new THREE.TorusGeometry(.39, .04, 6, 16), toon(0x3a3a44), x, .55, z, g, 0).rotation.x = Math.PI / 2; } } });
  // 일반 주택
  const H = [[4.5, 13, 0xffe4d0, 0x4a7ad0, 0xc05a3a], [-19, 3, 0xe8f0ff, 0xd07a3a, 0x3a7a5a], [12.5, 14.5, 0xfff0c0, 0xb04a8a, 0x4a6ab0], [16, -17, 0xe0f0d8, 0x4a4ab0, 0xb07a3a], [-4, 19, 0xffd8d8, 0xc0603a, 0x5a8a3a], [-17, 14, 0xf0e8d8, 0x7a4ab0, 0xc05a5a], [6, -21, 0xf8f0e0, 0x2a8a9a, 0xc06a3a]];
  H.forEach(([x, z, wall, roof, sh], k) => house({ x, z, w: RR(3.4, 4.2), d: RR(3, 3.6), h: RR(2.6, 3.2), wall, roof, shutter: sh, rot: RR(-.25, .25), chimney: k % 2 === 0 }));
  windmill(-21, -13);
  lakePlaza(); laboratory();
  for (const [x, z] of [[-3.2, -8], [3.2, -8], [-5.6, 4.4], [5.6, 4.4], [8.2, -1.6], [8.2, 3.6], [-8.6, -2.2], [-2.4, 9]]) lamp(x, z);
  bunting([-3.2, -8], [3.2, -8]); bunting([-5.6, 4.4], [-8.6, -2.2]); bunting([5.6, 4.4], [8.2, 3.6], 4.1);
  for (const [x, z, c] of [[-4.6, -4.6, 0xd04a5a], [4.6, -4.6, 0x4a6ad0]]) banner(x, z, c, 4.4);
  ambient(); nature();
  return { labels, blockers };
}
export function townPass(x, z) {
  const dl = Math.hypot(x - LAKE.x, z - LAKE.y);
  if (dl < 2.15) return false; if (dl < 2.7) return true;
  if (dl < LR + .55) return x < LAKE.x && Math.abs(z - LAKE.y) < .85;
  if (dl > 10.9 && Math.hypot(x, z) > 30) return false;
  for (const [bx, bz, r] of blockers) if (Math.hypot(x - bx, z - bz) < r) return false; return true;
}
const _base = new THREE.Vector3();
export function updTown(t, dt) {
  U.uT.value = t; for (const f of anims) f(t, dt);
  for (const s of smokes) { const k = (t * .35 + s.ph) % 1; s.m.position.set(s.x + Math.sin(k * 5 + s.ph * 9) * .3 + k * .9, s.y + k * 3.2, s.z); s.m.scale.setScalar(.4 + k * 1.3); s.m.material.opacity = .75 * (1 - k) * Math.min(1, k * 6); }
  for (const f of flags) { const p = f.m.geometry.attributes.position.array, b = f.base; for (let i = 0; i < p.length; i += 3) { const x = b[i], y = b[i + 1]; p[i + 2] = Math.sin(t * 4.5 + f.ph + x * 3.2 + y * .6) * x * .22; p[i] = x - Math.abs(p[i + 2]) * .15; } f.m.geometry.attributes.position.needsUpdate = true; f.m.geometry.computeVertexNormals(); f.em.position.set(f.w / 2, -f.len * .4, Math.sin(t * 4.5 + f.ph + f.w / 2 * 3.2) * f.w / 2 * .22 + .02); }
}
