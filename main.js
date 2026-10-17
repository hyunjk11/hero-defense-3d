import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ================= 기본 설정 =================
const GW = 22, GH = 14, S = 2;               // 그리드 크기, 타일 크기
const T = { GROUND: 0, PATH: 1, BAR: 2, ROCK: 3, SPAWN: 4, CORE: 5 };
const SPAWN = [0, 6], CORE = [21, 7];
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const tileX = c => (c - GW / 2 + .5) * S, tileZ = r => (r - GH / 2 + .5) * S;
const toTile = (x, z) => [Math.floor(x / S + GW / 2), Math.floor(z / S + GH / 2)];
const inGrid = (c, r) => c >= 0 && r >= 0 && c < GW && r < GH;

const CLASSES = {
  archer:  { n: '궁수', hp: 320, dmg: 20, rate: 2.3, range: 10, speed: 7.5, armor: 0, skill: '화살비', cd: 12, color: 0x5adc6a },
  mage:    { n: '마법사', hp: 280, dmg: 30, rate: 1.0, range: 8, speed: 7, armor: 0, skill: '메테오', cd: 14, color: 0xa070ff, aoe: 1.8, slow: .45 },
  warrior: { n: '전사', hp: 950, dmg: 46, rate: 1.4, range: 2.6, speed: 7, armor: .4, skill: '회오리 베기', cd: 10, color: 0xff7a4a },
};
const ETYPES = {
  imp:    { n: '임프', hp: 34, spd: 4.2, gold: 2, core: 1, dps: 8, scale: .7, color: 0x6ad04a },
  grunt:  { n: '오크 병사', hp: 70, spd: 2.8, gold: 3, core: 1, dps: 14, scale: 1, color: 0xb06a3a },
  golem:  { n: '바위 골렘', hp: 260, spd: 1.7, gold: 8, core: 3, dps: 40, scale: 1.45, color: 0x8a8f9a },
  bat:    { n: '흡혈 박쥐', hp: 60, spd: 3.2, gold: 5, core: 2, dps: 0, scale: 1, color: 0x7a3ac0, fly: true },
  boss:   { n: '마왕', hp: 3200, spd: 1.3, gold: 120, core: 10, dps: 120, scale: 2.6, color: 0xd02a3a },
};
const UPS = {
  atk: { n: '공격력', d: '+15% 피해', base: 40 }, spd: { n: '공격 속도', d: '+10% 속도', base: 40 }, rng: { n: '사거리', d: '+8% 사거리', base: 45 },
  skill: { n: '스킬 강화', d: '+25% 위력 · -8% 쿨', base: 60 }, bar: { n: '바리케이드', d: '+25% 체력', base: 35 },
};

const G = window.G = {
  phase: 'select', gold: 150, wave: 0, coreHp: 30, coreMax: 30, ups: { atk: 0, spd: 0, rng: 0, skill: 0, bar: 0 },
  tool: 'move', enemies: [], projs: [], bars: new Map(), grid: [], dist: null, spawnQ: [], t: 0, shake: 0, night: 0, nightTarget: 0,
};

// ================= 렌더러/씬 =================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color(0x8ec8f0), NIGHT_SKY = new THREE.Color(0x0a0c22);
scene.background = DAY_SKY.clone(); scene.fog = new THREE.Fog(0x8ec8f0, 60, 120);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .5, 300);
const cam = { theta: Math.PI * .25, phi: .95, r: 52, target: new THREE.Vector3(0, 0, 0) };
function updateCam() {
  const t = cam.target, sx = G.shake > 0 ? rnd(-1, 1) * G.shake : 0, sy = G.shake > 0 ? rnd(-1, 1) * G.shake : 0;
  camera.position.set(t.x + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta) + sx, t.y + cam.r * Math.cos(cam.phi) + sy, t.z + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta));
  camera.lookAt(t.x + sx * .3, t.y, t.z);
}
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a3020, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.4); sun.position.set(-25, 40, 18); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 24, bottom: -24, near: 5, far: 110 }); sun.shadow.bias = -.0006; scene.add(sun);
const moon = new THREE.DirectionalLight(0x6a8aff, 0); moon.position.set(20, 30, -20); scene.add(moon);

const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .55, .5, .82); composer.addPass(bloom); composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .75, metalness: .05, ...o });
const glowM = (color, i = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, flatShading: true });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m; }
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ================= 보드 =================
const board = new THREE.Group(); scene.add(board);
function initGrid() {
  for (let c = 0; c < GW; c++) { G.grid[c] = []; for (let r = 0; r < GH; r++) G.grid[c][r] = T.GROUND; }
  const pts = [[0, 6], [6, 6], [6, 10], [13, 10], [13, 3], [18, 3], [18, 7], [21, 7]];
  for (let i = 0; i < pts.length - 1; i++) { let [c, r] = pts[i]; const [c2, r2] = pts[i + 1]; while (c !== c2 || r !== r2) { G.grid[c][r] = T.PATH; c += Math.sign(c2 - c); r += Math.sign(r2 - r); } G.grid[c][r] = T.PATH; }
  G.grid[SPAWN[0]][SPAWN[1]] = T.SPAWN; G.grid[CORE[0]][CORE[1]] = T.CORE;
  let n = 0; while (n < 16) { const c = 2 + (Math.random() * (GW - 4) | 0), r = Math.random() * GH | 0; if (G.grid[c][r] === T.GROUND) { G.grid[c][r] = T.ROCK; n++; } }
}
const tileMesh = new THREE.InstancedMesh(BOX(S * .97, 1, S * .97), M(0xffffff, { roughness: .9 }), GW * GH); tileMesh.receiveShadow = true; board.add(tileMesh);
const rocks = new THREE.Group(); board.add(rocks);
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
function refreshTiles() {
  let i = 0; rocks.clear();
  for (let c = 0; c < GW; c++) for (let r = 0; r < GH; r++) {
    const t = G.grid[c][r], path = t === T.PATH || t === T.BAR || t === T.SPAWN || t === T.CORE, h = path ? .35 : .6, seed = Math.sin(c * 12.9 + r * 78.2) * .5 + .5;
    tmpM.makeScale(1, h, 1).setPosition(tileX(c), h / 2 - .3, tileZ(r)); tileMesh.setMatrixAt(i, tmpM);
    if (path) tmpC.setHSL(.08, .12, .42 + seed * .1); else tmpC.setHSL(.27 + seed * .05, .45, .32 + seed * .08);
    tileMesh.setColorAt(i, tmpC); i++;
    if (t === T.ROCK) { const g = mesh(new THREE.DodecahedronGeometry(.8 + seed * .3, 0), M(0x7a7f8a), tileX(c), .55, tileZ(r), rocks); g.rotation.set(seed * 3, seed * 5, 0); g.scale.y = .75; }
  }
  tileMesh.instanceMatrix.needsUpdate = true; tileMesh.instanceColor.needsUpdate = true;
}
// 장식: 주변 나무
(function deco() {
  const trunk = M(0x6a4a2a), leaf = [M(0x3a8a3a), M(0x2f7a40), M(0x4a9a3a)];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, rad = rnd(27, 40), x = Math.cos(a) * rad * 1.15, z = Math.sin(a) * rad * .8; const s = rnd(.8, 1.6), g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(.25, .35, 1.6, 6), trunk, 0, .8, 0, g); mesh(new THREE.ConeGeometry(1.4, 2.6, 7), leaf[i % 3], 0, 2.6, 0, g); mesh(new THREE.ConeGeometry(1, 2, 7), leaf[(i + 1) % 3], 0, 3.7, 0, g);
    g.position.set(x, -.3, z); g.scale.setScalar(s); scene.add(g);
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 40), M(0x2a5a2a, { roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.31; ground.receiveShadow = true; scene.add(ground);
})();
// 포털
const portal = new THREE.Group(); portal.position.set(tileX(SPAWN[0]), 0, tileZ(SPAWN[1])); scene.add(portal);
mesh(new THREE.TorusGeometry(1.5, .28, 8, 24), M(0x2a2a3a), 0, 1.9, 0, portal).rotation.y = Math.PI / 2;
const portalCore = mesh(new THREE.CircleGeometry(1.35, 24), new THREE.MeshBasicMaterial({ color: 0xb03aff, transparent: true, opacity: .85, side: THREE.DoubleSide }), 0, 1.9, 0, portal); portalCore.rotation.y = Math.PI / 2; portalCore.castShadow = false;
const portalLight = new THREE.PointLight(0xb03aff, 30, 12); portalLight.position.y = 2; portal.add(portalLight);
// 코어 (성)
const core = new THREE.Group(); core.position.set(tileX(CORE[0]), 0, tileZ(CORE[1])); scene.add(core);
{ const stone = M(0xb8b0a0), roof = M(0x3a5aa8); mesh(BOX(2.6, 1.6, 2.6), stone, 0, .8, 0, core);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => { mesh(new THREE.CylinderGeometry(.45, .5, 2.6, 8), stone, x * 1.2, 1.3, z * 1.2, core); mesh(new THREE.ConeGeometry(.6, 1, 8), roof, x * 1.2, 3.1, z * 1.2, core); }); }
const crystal = mesh(new THREE.OctahedronGeometry(.75, 0), glowM(0x3ae8ff, 2.5), 0, 3.4, 0, core);
const coreLight = new THREE.PointLight(0x3ae8ff, 25, 12); coreLight.position.y = 3.4; core.add(coreLight);

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
const P = makeParticles(2500, .45), PB = makeParticles(600, 1.6);
function emit(sys, x, y, z, count, color, spd = 4, life = .6, grav = -6, spread = 1) {
  const c = new THREE.Color(color);
  for (let k = 0; k < count; k++) { const i = sys.i = (sys.i + 1) % sys.n, j = i * 3; sys.pos[j] = x + rnd(-.2, .2) * spread; sys.pos[j + 1] = y; sys.pos[j + 2] = z + rnd(-.2, .2) * spread;
    const a = Math.random() * Math.PI * 2, u = rnd(-.2, 1), v = rnd(.3, 1) * spd; sys.vel[j] = Math.cos(a) * v * Math.sqrt(1 - u * u); sys.vel[j + 1] = u * v + spd * .3; sys.vel[j + 2] = Math.sin(a) * v * Math.sqrt(1 - u * u);
    sys.life[i] = sys.max[i] = life * rnd(.6, 1.2); sys.grav[i] = grav; sys.base[j] = c.r; sys.base[j + 1] = c.g; sys.base[j + 2] = c.b; }
}
function updParticles(sys, dt) {
  for (let i = 0; i < sys.n; i++) { if (sys.life[i] <= 0) continue; const j = i * 3; sys.life[i] -= dt;
    if (sys.life[i] <= 0) { sys.pos[j + 1] = -999; continue; } sys.vel[j + 1] += sys.grav[i] * dt;
    sys.pos[j] += sys.vel[j] * dt; sys.pos[j + 1] += sys.vel[j + 1] * dt; sys.pos[j + 2] += sys.vel[j + 2] * dt; const f = sys.life[i] / sys.max[i];
    sys.col[j] = sys.base[j] * f; sys.col[j + 1] = sys.base[j + 1] * f; sys.col[j + 2] = sys.base[j + 2] * f; }
  sys.pts.geometry.attributes.position.needsUpdate = true; sys.pts.geometry.attributes.color.needsUpdate = true;
}
// 별 (밤)
const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 900 }, (_, i) => i % 3 === 1 ? rnd(40, 90) : rnd(-150, 150)), 3)), new THREE.PointsMaterial({ color: 0xffffff, size: .6, transparent: true, opacity: 0 })); scene.add(stars);

// ================= DOM 이펙트 =================
const fx = $('fx'), v3 = new THREE.Vector3();
function screenOf(p) { v3.copy(p).project(camera); return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight, v3.z < 1]; }
let dmgCount = 0;
function dmgText(p, val, color = '#fff', big = false) {
  if (dmgCount > 60) return; const [x, y, ok] = screenOf(p); if (!ok) return; dmgCount++;
  const d = document.createElement('div'); d.className = 'dmg'; d.textContent = typeof val === 'number' ? Math.round(val) : val; d.style.left = x + rnd(-12, 12) + 'px'; d.style.top = y - 20 + 'px'; d.style.color = color; if (big) d.style.fontSize = '26px';
  fx.appendChild(d); setTimeout(() => { d.remove(); dmgCount--; }, 800);
}
function flyCoin(p, n) {
  const [x, y, ok] = screenOf(p); if (!ok) return; const tgt = $('gold').getBoundingClientRect();
  for (let k = 0; k < Math.min(n, 5); k++) { const c = document.createElement('div'); c.className = 'flycoin'; c.style.left = x + rnd(-15, 15) + 'px'; c.style.top = y + rnd(-15, 15) + 'px'; fx.appendChild(c);
    setTimeout(() => { c.style.left = tgt.left - 14 + 'px'; c.style.top = tgt.top + tgt.height / 2 + 'px'; c.style.transform = 'translate(-50%,-50%) scale(.6)'; }, 60 + k * 50);
    setTimeout(() => c.remove(), 900 + k * 50); }
}
function banner(text, color = '#fff', ms = 1600) { const b = $('banner'); b.textContent = text; b.style.color = color; b.classList.add('show'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), ms); }

// ================= HP 바 (스프라이트) =================
function hpBar(parent, y, w = 1.4, color = 0x55ff77) {
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x000000, opacity: .7, transparent: true, depthTest: false })); bg.scale.set(w, .16, 1); bg.position.y = y; bg.renderOrder = 10;
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false })); fg.scale.set(w, .12, 1); fg.position.y = y; fg.renderOrder = 11; fg.center.set(0, .5); fg.position.x = -w / 2;
  parent.add(bg, fg); return { bg, fg, w, set(r) { fg.scale.x = Math.max(.001, w * r); } };
}

// ================= 영웅 모델 =================
function makeHero(cls) {
  const g = new THREE.Group(), C = CLASSES[cls], skin = M(0xf0c8a0), mats = [];
  const body = new THREE.Group(); body.position.y = 1.15; g.add(body);
  const mk = (geo, color, x, y, z, parent, o) => { const m = M(color, o); mats.push(m); return mesh(geo, m, x, y, z, parent); };
  const legs = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * .22, 1.15, 0); g.add(p); mk(BOX(.26, .9, .3), cls === 'warrior' ? 0x5a5f6a : 0x3a2a20, 0, -.45, 0, p); mk(BOX(.3, .2, .42), 0x2a1a10, 0, -.9, .06, p); return p; });
  const torsoCol = { archer: 0x3a8a4a, mage: 0x5a3aa0, warrior: 0x9aa0aa }[cls];
  mk(BOX(.72, .85, .45), torsoCol, 0, .42, 0, body); mk(BOX(.76, .14, .5), 0x6a4a2a, 0, .05, 0, body);
  if (cls === 'mage') mk(new THREE.CylinderGeometry(.38, .62, .9, 8), 0x4a2a90, 0, -.1, 0, body);
  if (cls === 'warrior') { mk(BOX(.95, .22, .55), 0xc0c6d0, 0, .82, 0, body, { metalness: .6, roughness: .35 }); }
  const head = new THREE.Group(); head.position.y = 1.15; body.add(head); mk(BOX(.58, .56, .54), 0xf0c8a0, 0, 0, 0, head);
  mk(BOX(.1, .1, .02), 0x222222, -.13, .02, .28, head); mk(BOX(.1, .1, .02), 0x222222, .13, .02, .28, head);
  if (cls === 'archer') { mk(new THREE.ConeGeometry(.45, .7, 6), 0x2f7a3a, 0, .42, -.05, head); mk(BOX(.62, .2, .58), 0x2f7a3a, 0, .2, -.02, head); }
  if (cls === 'mage') { mk(new THREE.ConeGeometry(.5, 1.1, 8), 0x3a2080, 0, .7, 0, head); mk(new THREE.CylinderGeometry(.62, .62, .07, 12), 0x3a2080, 0, .26, 0, head); mk(BOX(.4, .3, .1), 0xdddddd, 0, -.33, .26, head); }
  if (cls === 'warrior') { mk(BOX(.66, .4, .62), 0xc0c6d0, 0, .17, 0, head, { metalness: .6, roughness: .35 }); mk(BOX(.08, .3, .5), 0xd03a2a, 0, .5, 0, head); }
  const arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * .48, .78, 0); body.add(p); mk(BOX(.22, .75, .24), torsoCol, 0, -.35, 0, p); mk(BOX(.22, .2, .24), 0xf0c8a0, 0, -.78, 0, p); return p; });
  let weapon = new THREE.Group(), tip = new THREE.Object3D();
  if (cls === 'archer') { const bow = mk(new THREE.TorusGeometry(.55, .05, 6, 16, Math.PI), 0x8a5a2a, 0, 0, 0, weapon); bow.rotation.z = Math.PI / 2; const str = mesh(BOX(.02, 1.1, .02), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0, 0, weapon); weapon.userData.string = str; weapon.position.set(0, -.8, .25); arms[0].add(weapon); tip.position.set(0, 0, .4); weapon.add(tip); }
  if (cls === 'mage') { mk(new THREE.CylinderGeometry(.05, .06, 1.9, 6), 0x6a4a2a, 0, 0, 0, weapon); const orb = mesh(new THREE.IcosahedronGeometry(.2, 0), glowM(0xc07aff, 3), 0, 1.05, 0, weapon); weapon.userData.orb = orb; weapon.position.set(0, -.8, .1); arms[1].add(weapon); tip.position.set(0, 1.05, 0); weapon.add(tip); }
  if (cls === 'warrior') { mk(BOX(.12, 1.4, .05), 0xe0e6f0, 0, .75, 0, weapon, { metalness: .8, roughness: .2 }); mk(BOX(.42, .08, .12), 0xc9a24a, 0, .05, 0, weapon); weapon.position.set(0, -.8, .1); weapon.rotation.x = Math.PI / 2.2; arms[1].add(weapon); tip.position.set(0, 1.3, 0); weapon.add(tip);
    const sh = mk(new THREE.CylinderGeometry(.42, .42, .08, 8), 0xa03020, 0, -.5, .2, arms[0]); sh.rotation.x = Math.PI / 2; mk(new THREE.CylinderGeometry(.15, .15, .1, 8), 0xc9a24a, 0, -.5, .26, arms[0]).rotation.x = Math.PI / 2; }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.7, .9, 24), new THREE.MeshBasicMaterial({ color: C.color, transparent: true, opacity: .7 })); ring.rotation.x = -Math.PI / 2; ring.position.y = .08; g.add(ring);
  return { g, body, head, legs, arms, weapon, tip, mats, ring };
}

// ================= 적 모델 =================
function makeEnemy(type) {
  const E = ETYPES[type], g = new THREE.Group(), inner = new THREE.Group(), mats = []; g.add(inner); inner.scale.setScalar(E.scale);
  const mk = (geo, color, x, y, z, parent = inner, o) => { const m = M(color, o); mats.push(m); return mesh(geo, m, x, y, z, parent); };
  const eyeM = glowM(type === 'boss' ? 0xffea3a : 0xff3a3a, 2.5); const legs = [], arms = []; let wings = null;
  if (type === 'bat') {
    mk(new THREE.SphereGeometry(.45, 8, 6), 0x4a2a6a, 0, 0, 0); mk(new THREE.ConeGeometry(.12, .35, 4), 0x4a2a6a, -.18, .45, 0); mk(new THREE.ConeGeometry(.12, .35, 4), 0x4a2a6a, .18, .45, 0);
    mesh(new THREE.SphereGeometry(.07, 6, 4), eyeM, -.15, .1, .38, inner); mesh(new THREE.SphereGeometry(.07, 6, 4), eyeM, .15, .1, .38, inner);
    wings = [-1, 1].map(s => { const p = new THREE.Group(); p.position.x = s * .35; inner.add(p); const w = mk(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -.2), new THREE.Vector3(s * 1.4, .3, -.1), new THREE.Vector3(s * 1.1, -.2, .3), new THREE.Vector3(0, 0, -.2), new THREE.Vector3(s * 1.1, -.2, .3), new THREE.Vector3(s * .4, -.1, .4)]), 0x7a3ac0, 0, 0, 0, p, { side: THREE.DoubleSide }); w.geometry.computeVertexNormals(); return p; });
    inner.position.y = 3;
  } else {
    const skin = E.color, dark = new THREE.Color(skin).multiplyScalar(.6).getHex();
    const hip = type === 'golem' ? .7 : .55;
    for (const s of [-1, 1]) { const p = new THREE.Group(); p.position.set(s * (type === 'golem' ? .32 : .2), hip, 0); inner.add(p); mk(BOX(type === 'golem' ? .38 : .22, hip, .26), dark, 0, -hip / 2, 0, p); legs.push(p); }
    const tw = type === 'golem' ? 1.1 : type === 'imp' ? .55 : .75, th = type === 'golem' ? 1 : type === 'imp' ? .5 : .75;
    mk(BOX(tw, th, tw * .65), skin, 0, hip + th / 2, 0);
    for (const s of [-1, 1]) { const p = new THREE.Group(); p.position.set(s * (tw / 2 + .12), hip + th * .9, 0); inner.add(p); mk(BOX(type === 'golem' ? .34 : .18, th * 1.05, .2), skin, 0, -th * .5, 0, p); arms.push(p); }
    const hs = type === 'golem' ? .6 : type === 'imp' ? .5 : .5, hy = hip + th + hs / 2;
    mk(BOX(hs, hs, hs), type === 'grunt' ? 0x7aa04a : skin, 0, hy, 0);
    mesh(BOX(.09, .09, .03), eyeM, -hs * .22, hy + .04, hs / 2 + .01, inner); mesh(BOX(.09, .09, .03), eyeM, hs * .22, hy + .04, hs / 2 + .01, inner);
    if (type === 'imp') { mk(new THREE.ConeGeometry(.08, .35, 4), skin, -.2, hy + .3, 0).rotation.z = .5; mk(new THREE.ConeGeometry(.08, .35, 4), skin, .2, hy + .3, 0).rotation.z = -.5; }
    if (type === 'grunt') { mk(BOX(.06, .9, .06), 0x6a4a2a, 0, -.3, .15, arms[1]); mk(BOX(.35, .3, .05), 0xaaaaaa, 0, -.8, .15, arms[1], { metalness: .6 }); mk(new THREE.ConeGeometry(.05, .12, 4), 0xffffff, -.12, hy - .15, hs / 2); mk(new THREE.ConeGeometry(.05, .12, 4), 0xffffff, .12, hy - .15, hs / 2); }
    if (type === 'golem') { mesh(new THREE.OctahedronGeometry(.18, 0), glowM(0x3affc0, 2), 0, hip + th / 2, tw * .33 + .02, inner); [[-.35, .2], [.3, .35]].forEach(([x, y]) => mk(new THREE.DodecahedronGeometry(.22, 0), 0x6a6f7a, x, hip + th * y + .4, -.25)); }
    if (type === 'boss') { mk(new THREE.ConeGeometry(.1, .5, 5), 0xf0e0c0, -.22, hy + .4, 0).rotation.z = .6; mk(new THREE.ConeGeometry(.1, .5, 5), 0xf0e0c0, .22, hy + .4, 0).rotation.z = -.6;
      [-1, 1].forEach(s => { const w = mk(new THREE.ConeGeometry(.6, 1.4, 3), 0x3a0a10, s * .7, hip + th, -.35); w.rotation.z = s * 1.2; });
      mesh(new THREE.TorusGeometry(.5, .05, 6, 16), glowM(0xff5a1a, 2), 0, hy + .55, 0, inner).rotation.x = Math.PI / 2; }
  }
  return { g, inner, mats, legs, arms, wings, eyeM };
}

// ================= 경로 탐색 (코어 기준 다익스트라 거리장) =================
const walk = t => t === T.PATH || t === T.BAR || t === T.SPAWN || t === T.CORE;
function computeDist() {
  const D = Array.from({ length: GW }, () => new Float32Array(GH).fill(Infinity)); D[CORE[0]][CORE[1]] = 0;
  const open = [[0, CORE[0], CORE[1]]];
  while (open.length) { let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i; const [d, c, r] = open.splice(bi, 1)[0]; if (d > D[c][r]) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (!inGrid(nc, nr) || !walk(G.grid[nc][nr])) continue;
      const nd = d + 1 + (G.grid[nc][nr] === T.BAR ? 25 : 0); if (nd < D[nc][nr]) { D[nc][nr] = nd; open.push([nd, nc, nr]); } } }
  G.dist = D; const ok = D[SPAWN[0]][SPAWN[1]] < Infinity;
  $('routeMsg').textContent = ok ? '' : '⚠ 포털에서 코어까지 길이 끊겼습니다'; $('startWave').disabled = !ok || G.phase !== 'build'; return ok;
}
function nextTile(c, r) { let best = null, bd = G.dist[c][r]; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (inGrid(nc, nr) && G.dist[nc][nr] < bd) { bd = G.dist[nc][nr]; best = [nc, nr]; } } return best; }
// 경로 미리보기 (흐르는 점)
const routeDots = new THREE.Group(); scene.add(routeDots);
function drawRoute() {
  routeDots.clear(); if (G.dist[SPAWN[0]][SPAWN[1]] === Infinity) return; let cur = SPAWN, k = 0; const m = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: .8 });
  while (cur && k++ < 200) { const d = mesh(new THREE.SphereGeometry(.12, 6, 4), m, tileX(cur[0]), .25, tileZ(cur[1]), routeDots); d.castShadow = false; d.userData.k = k; if (cur[0] === CORE[0] && cur[1] === CORE[1]) break; cur = nextTile(...cur); }
}

// ================= 바리케이드 =================
function barMaxHp() { return 320 * (1 + .25 * G.ups.bar); }
function addBarricade(c, r) {
  const g = new THREE.Group(); g.position.set(tileX(c), 0, tileZ(r)); scene.add(g); const wood = M(0x8a5a2a), dark = M(0x5a3a1a);
  mesh(BOX(1.7, .25, .5), dark, 0, .5, 0, g); mesh(BOX(1.7, .25, .5), dark, 0, 1.1, 0, g);
  for (let i = -2; i <= 2; i++) { const p = mesh(new THREE.ConeGeometry(.16, 1.8, 5), wood, i * .38, .9, 0, g); p.rotation.x = i % 2 ? .25 : -.25; }
  const hb = hpBar(g, 2.1, 1.6, 0xffb03a); const b = { c, r, g, hp: barMaxHp(), max: barMaxHp(), hb, mats: [wood, dark] }; G.bars.set(c + ',' + r, b); G.grid[c][r] = T.BAR; return b;
}
function removeBarricade(b, broken) {
  scene.remove(b.g); G.bars.delete(b.c + ',' + b.r); G.grid[b.c][b.r] = T.PATH;
  if (broken) { emit(P, b.g.position.x, 1, b.g.position.z, 40, 0xc08a4a, 6, .8, -12, 3); banner('바리케이드 파괴!', '#ffb03a', 900); }
  computeDist(); drawRoute();
}

// ================= 영웅 =================
let hero = null;
function spawnHero(cls) {
  const C = CLASSES[cls], m = makeHero(cls); m.g.position.set(tileX(CORE[0] - 2), 0, tileZ(CORE[1])); scene.add(m.g);
  hero = { cls, C, ...m, hp: C.hp, max: C.hp, cd: 0, skillCd: 0, atkAnim: 0, walkT: 0, target: null, moveTo: null, dead: 0, spinT: 0, flash: 0, face: Math.PI };
  hero.hb = hpBar(m.g, 3.3, 1.6, 0x55ff77);
  $('heroName').textContent = `${C.n} · 스킬 [Q] ${C.skill}`; $('skillName').textContent = C.skill;
}
const stat = {
  dmg: () => hero.C.dmg * (1 + .15 * G.ups.atk), rate: () => hero.C.rate * (1 + .1 * G.ups.spd), range: () => hero.C.range * (1 + .08 * G.ups.rng),
  skillMul: () => 1 + .25 * G.ups.skill, skillCd: () => hero.C.cd * Math.pow(.92, G.ups.skill),
};
function heroDamage(d) {
  if (hero.dead > 0) return; d *= 1 - hero.C.armor; hero.hp -= d; hero.flash = .1;
  if (hero.hp <= 0) { hero.hp = 0; hero.dead = 5; hero.g.visible = false; emit(P, hero.g.position.x, 1.5, hero.g.position.z, 50, 0xff4a5a, 6, .9); banner('영웅 쓰러짐! 5초 후 부활', '#ff8a9a', 1500); }
}
// ================= 적 =================
function spawnEnemy(type, hpMul) {
  const E = ETYPES[type], m = makeEnemy(type), hp = E.hp * hpMul; scene.add(m.g);
  const e = { type, E, ...m, hp, max: hp, tile: SPAWN.slice(), next: null, walkT: Math.random() * 6, slowT: 0, flash: 0, atkCd: 0, dead: false };
  m.g.position.set(tileX(SPAWN[0]), 0, tileZ(SPAWN[1])); e.hb = hpBar(m.g, (E.fly ? 4.2 : 0) + 1.9 * E.scale + .3, E.scale * 1.1, type === 'boss' ? 0xff3a4a : 0x55ff77);
  if (type === 'boss') { G.shake = .6; banner('⚠ 보스 출현: 마왕 ⚠', '#ff4a5a', 2200); emit(PB, m.g.position.x, 2, m.g.position.z, 40, 0xff3a3a, 8, 1, -2, 2); }
  emit(P, m.g.position.x, 1.5, m.g.position.z, 12, 0xc07aff, 4, .5); G.enemies.push(e); return e;
}
function hurt(e, dmg, color = '#fff', big = false) {
  if (e.dead) return; e.hp -= dmg; e.flash = .09; dmgText(e.g.position.clone().setY(2.4 * e.E.scale + (e.E.fly ? 3 : 0)), dmg, color, big);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; const p = e.g.position.clone().setY(1 + (e.E.fly ? 3 : 0));
  emit(P, p.x, p.y, p.z, e.type === 'boss' ? 160 : 22, e.E.color, e.type === 'boss' ? 10 : 5, .8, -10, 1.5); emit(P, p.x, p.y, p.z, 8, 0xffe066, 4, .6);
  if (e.type === 'boss') { G.shake = 1; emit(PB, p.x, p.y, p.z, 60, 0xff8a3a, 12, 1.2, -3, 3); banner('마왕 처치!', '#ffd23a'); }
  G.gold += e.E.gold; flyCoin(p, Math.ceil(e.E.gold / 2));
  e.dying = .45; // 쓰러지는 애니메이션
}

// ================= 투사체 =================
const arrowGeo = new THREE.CylinderGeometry(.03, .03, .9, 4).rotateX(Math.PI / 2), arrowMat = glowM(0xd0ffd0, 1.2);
const orbGeo = new THREE.IcosahedronGeometry(.28, 1), orbMat = glowM(0xc07aff, 4);
function shoot(kind, from, target, dmg, opts = {}) {
  const m = new THREE.Mesh(kind === 'arrow' ? arrowGeo : orbGeo, kind === 'arrow' ? arrowMat : orbMat); m.position.copy(from); scene.add(m);
  G.projs.push({ kind, m, target, dmg, spd: kind === 'arrow' ? 32 : 16, ...opts });
}
function aoe(pos, r, dmg, color, opts = {}) {
  for (const e of G.enemies) { if (e.dead) continue; const dx = e.g.position.x - pos.x, dz = e.g.position.z - pos.z; if (dx * dx + dz * dz <= r * r && (!opts.groundOnly || !e.E.fly)) { hurt(e, dmg, color, opts.big); if (opts.slow) e.slowT = 1.5; } }
}
function ringFx(pos, r, color, dur = .4) {
  const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, .15, pos.z); scene.add(m); G.fxs.push({ m, t: 0, dur, r, kind: 'ring' });
}
G.fxs = [];

// ================= 스킬 =================
function castSkill() {
  if (!hero || hero.dead > 0 || hero.skillCd > 0 || G.phase === 'select') return;
  const mul = stat.skillMul(), base = stat.dmg(); hero.skillCd = stat.skillCd(); hero.atkAnim = .5;
  const tgt = mouseGround.clone(); const hp = hero.g.position;
  if (hp.distanceTo(tgt) > 16) tgt.sub(hp).setLength(16).add(hp);
  if (hero.cls === 'archer') { // 화살비
    ringFx(tgt, 4.2, 0x6aff8a, 1.4); banner('화살비!', '#8aff9a', 900);
    for (let i = 0; i < 36; i++) setTimeout(() => { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * 4, p = new THREE.Vector3(tgt.x + Math.cos(a) * rr, 18, tgt.z + Math.sin(a) * rr);
      const m = new THREE.Mesh(arrowGeo, glowM(0x9affb0, 3)); m.position.copy(p); m.rotation.x = Math.PI / 2; scene.add(m); G.projs.push({ kind: 'rain', m, dest: p.clone().setY(0), dmg: base * 1.3 * mul, spd: 40 }); }, i * 38);
  } else if (hero.cls === 'mage') { // 메테오
    ringFx(tgt, 4.8, 0xff6a2a, .9); banner('메테오!', '#ffaa5a', 900);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), glowM(0xff6a1a, 5)); m.position.set(tgt.x - 8, 26, tgt.z - 4); scene.add(m);
    G.projs.push({ kind: 'meteor', m, dest: tgt.clone(), dmg: base * 16 * mul, spd: 30 });
  } else { // 회오리 베기
    hero.spinT = 2.5; banner('회오리 베기!', '#ffaa7a', 900);
    if (!hero.swirl) { hero.swirl = new THREE.Mesh(new THREE.TorusGeometry(2.8, .25, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false })); hero.swirl.rotation.x = Math.PI / 2; hero.swirl.position.y = 1.2; hero.g.add(hero.swirl); }
    hero.swirl.visible = true; hero.spinTick = 0;
  }
  SFX.skill();
}

// ================= 사운드 =================
const SFX = { ctx: null, init() { if (!this.ctx) try { this.ctx = new AudioContext(); } catch (e) {} },
  tone(f, d = .08, type = 'square', v = .03, slide = 0) { const c = this.ctx; if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), c.currentTime + d); g.gain.value = v; g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + d); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + d); },
  shot() { this.tone(cls_tone(), .06, 'triangle', .02, -200); }, skill() { this.tone(220, .5, 'sawtooth', .05, 400); }, hit() { this.tone(140, .05, 'square', .015); } };
const cls_tone = () => hero ? { archer: 900, mage: 500, warrior: 200 }[hero.cls] : 400;

// ================= 웨이브 =================
function startWave() {
  if (G.phase !== 'build' || !computeDist()) return; G.wave++; G.phase = 'wave'; G.nightTarget = 1;
  const n = G.wave, boss = n % 5 === 0, hpMul = Math.pow(1.17, n - 1), q = [];
  const count = 10 + n * 3;
  for (let i = 0; i < count; i++) { let t = 'grunt'; const r = Math.random(); if (r < .35) t = 'imp'; else if (n >= 3 && r > .85) t = 'golem'; else if (n >= 4 && r > .72 && r <= .85) t = 'bat'; q.push(t); }
  if (boss) q.splice(Math.floor(count / 2), 0, 'boss');
  G.spawnQ = q; G.spawnT = 1; G.hpMul = hpMul;
  banner(boss ? `웨이브 ${n} · 보스 웨이브!` : `웨이브 ${n}`, boss ? '#ff5a6a' : '#ffffff'); setPhaseUI();
}
function endWave() {
  G.phase = 'build'; G.nightTarget = 0; const bonus = 20 + G.wave * 6; G.gold += bonus; banner(`웨이브 ${G.wave} 클리어! +${bonus}G`, '#ffe066');
  if (hero && hero.dead <= 0) hero.hp = hero.max; computeDist(); setPhaseUI();
  try { localStorage.setItem('hd3d_best', Math.max(G.wave, +localStorage.getItem('hd3d_best') || 0)); } catch (e) {}
}
function setPhaseUI() {
  const ph = $('phase'); ph.textContent = G.phase === 'wave' ? `전투 중 (밤)` : '건설 단계 (낮)'; ph.classList.toggle('night', G.phase === 'wave');
  $('startWave').disabled = G.phase !== 'build' || G.dist[SPAWN[0]][SPAWN[1]] === Infinity;
  document.querySelector('[data-tool=path]').disabled = G.phase !== 'build'; document.querySelector('[data-tool=remove]').disabled = G.phase !== 'build';
  if (G.phase !== 'build' && G.tool !== 'barricade') setTool('move');
}

// ================= 입력 =================
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), mouseGround = new THREE.Vector3();
const hover = new THREE.Mesh(BOX(S * .98, .5, S * .98), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: .35, depthWrite: false })); hover.visible = false; scene.add(hover);
const moveMark = new THREE.Mesh(new THREE.RingGeometry(.4, .55, 24), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true })); moveMark.rotation.x = -Math.PI / 2; moveMark.visible = false; scene.add(moveMark);
let rdrag = null; const keys = {};
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('pointermove', e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera); ray.ray.intersectPlane(groundPlane, mouseGround);
  if (rdrag) { cam.theta -= (e.clientX - rdrag.x) * .008; cam.phi = Math.min(1.25, Math.max(.45, cam.phi - (e.clientY - rdrag.y) * .005)); rdrag = { x: e.clientX, y: e.clientY }; }
  const [c, r] = toTile(mouseGround.x, mouseGround.z); hover.visible = G.tool !== 'move' && inGrid(c, r) && G.phase !== 'select';
  if (hover.visible) { hover.position.set(tileX(c), .2, tileZ(r)); hover.material.color.set(canBuild(c, r) ? 0x66ff88 : 0xff4a4a); }
});
renderer.domElement.addEventListener('pointerdown', e => {
  SFX.init(); if (e.button === 2) { rdrag = { x: e.clientX, y: e.clientY }; return; } if (e.button !== 0 || G.phase === 'select' || !hero) return;
  const [c, r] = toTile(mouseGround.x, mouseGround.z);
  if (G.tool === 'move' || !inGrid(c, r)) { hero.moveTo = mouseGround.clone(); moveMark.position.set(mouseGround.x, .1, mouseGround.z); moveMark.visible = true; moveMark.scale.setScalar(1.5); return; }
  build(c, r);
});
addEventListener('pointerup', () => rdrag = null);
renderer.domElement.addEventListener('wheel', e => { cam.r = Math.min(80, Math.max(22, cam.r + e.deltaY * .03)); }, { passive: true });
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key.toLowerCase() === 'q') castSkill(); if (e.key === '1') setTool('path'); if (e.key === '2') setTool('barricade'); if (e.key === '3') setTool('remove'); if (e.key === 'Escape') setTool('move'); if (e.key === ' ' && G.phase === 'build') startWave(); });
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
$('rotL').onclick = () => cam.theta += Math.PI / 4; $('rotR').onclick = () => cam.theta -= Math.PI / 4;
function canBuild(c, r) {
  const t = G.grid[c][r];
  if (G.tool === 'path') return G.phase === 'build' && t === T.GROUND && G.gold >= 5;
  if (G.tool === 'barricade') return t === T.PATH && G.gold >= 30 && !G.enemies.some(e => !e.dead && !e.E.fly && e.tile[0] === c && e.tile[1] === r);
  if (G.tool === 'remove') return G.phase === 'build' && (t === T.PATH || t === T.BAR);
  return false;
}
function build(c, r) {
  if (!canBuild(c, r)) { SFX.tone(120, .1); return; } const t = G.grid[c][r], p = new THREE.Vector3(tileX(c), .5, tileZ(r));
  if (G.tool === 'path') { G.grid[c][r] = T.PATH; G.gold -= 5; emit(P, p.x, .4, p.z, 12, 0xd0c0a0, 3, .5); }
  else if (G.tool === 'barricade') { addBarricade(c, r); G.gold -= 30; emit(P, p.x, .6, p.z, 16, 0xffb03a, 4, .5); }
  else if (G.tool === 'remove') { if (t === T.BAR) { G.bars.get(c + ',' + r) && (scene.remove(G.bars.get(c + ',' + r).g), G.bars.delete(c + ',' + r)); G.gold += 20; } else G.gold += 3; G.grid[c][r] = t === T.BAR ? T.PATH : T.GROUND; emit(P, p.x, .4, p.z, 10, 0xff6a6a, 3, .5); }
  SFX.tone(600, .05, 'triangle'); refreshTiles(); computeDist(); drawRoute(); refreshHud();
}
function setTool(t) { G.tool = t; document.querySelectorAll('.tool').forEach(b => b.classList.toggle('sel', b.dataset.tool === t)); }
document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('startWave').onclick = startWave; $('skillBtn').onclick = castSkill;
const upCost = k => Math.round(UPS[k].base * Math.pow(1.45, G.ups[k]));
document.querySelectorAll('.up').forEach(b => b.onclick = () => { const k = b.dataset.up, c = upCost(k); if (G.gold < c) return SFX.tone(120, .1); G.gold -= c; G.ups[k]++;
  if (k === 'bar') G.bars.forEach(br => { const r = br.hp / br.max; br.max = barMaxHp(); br.hp = br.max * r; });
  SFX.tone(880, .12, 'triangle', .04); if (hero) emit(P, hero.g.position.x, 1.5, hero.g.position.z, 24, 0xffe066, 4, .7); refreshHud(); });
function refreshHud() {
  $('gold').textContent = G.gold; $('wave').textContent = G.wave; $('coreBar').style.width = Math.max(0, G.coreHp / G.coreMax * 100) + '%'; $('coreTxt').textContent = `${Math.max(0, G.coreHp)}/${G.coreMax}`;
  $('enemyCnt').textContent = `적 ${G.enemies.filter(e => !e.dead).length + (G.spawnQ ? G.spawnQ.length : 0)}`;
  document.querySelectorAll('.up').forEach(b => { const k = b.dataset.up, c = upCost(k); b.innerHTML = `<span class="row"><span>${UPS[k].n} Lv.${G.ups[k]}</span><small>${c}G</small></span><span class="desc">${UPS[k].d}</span>`; b.disabled = G.gold < c; });
  if (hero) { $('heroBar').style.width = hero.hp / hero.max * 100 + '%'; const cdp = hero.skillCd > 0 ? hero.skillCd / stat.skillCd() * 100 : 0; $('skillCd').style.setProperty('--p', cdp + '%'); $('skillCd').textContent = hero.skillCd > 0 ? Math.ceil(hero.skillCd) : ''; $('skillBtn').classList.toggle('ready', hero.skillCd <= 0); }
}

// ================= 영웅 선택 =================
const preview = [];
function showSelect() {
  ['archer', 'mage', 'warrior'].forEach((cls, i) => { const m = makeHero(cls); m.g.position.set((i - 1) * 3.2, 0, 8); m.g.scale.setScalar(1.6); scene.add(m.g); preview.push(m); });
  cam.target.set(0, 1.5, 6); cam.r = 20; cam.phi = 1.2; cam.theta = 0;
  document.querySelectorAll('.card').forEach(c => c.onclick = () => { SFX.init(); choose(c.dataset.cls); });
}
function choose(cls) {
  preview.forEach(p => scene.remove(p.g)); preview.length = 0; $('select').classList.add('hidden'); $('hud').classList.remove('hidden');
  spawnHero(cls); G.phase = 'build'; cam.target.set(0, 0, 0); cam.r = 52; cam.phi = .95; cam.theta = Math.PI * .25;
  computeDist(); drawRoute(); setPhaseUI(); refreshHud(); banner(`${CLASSES[cls].n} 출전!`, '#ffe066');
}
G.choose = choose; G.startWave = startWave; G.castSkill = castSkill; G.build = (c, r, tool) => { setTool(tool); build(c, r); setTool('move'); }; G.mouseGround = mouseGround;

// ================= 메인 루프 =================
let lastT = performance.now(); let hudT = 0;
function animateHero(dt) {
  const h = hero; if (h.dead > 0) { h.dead -= dt; if (h.dead <= 0) { h.hp = h.max; h.g.visible = true; h.g.position.set(tileX(CORE[0] - 1), 0, tileZ(CORE[1])); emit(P, h.g.position.x, 1, h.g.position.z, 40, 0x8aff9a, 5, .8); } return; }
  // 이동 (WASD 카메라 기준 / 클릭 이동)
  const fwd = new THREE.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta)), right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  if (keys.w) mv.add(fwd); if (keys.s) mv.sub(fwd); if (keys.d) mv.add(right); if (keys.a) mv.sub(right);
  if (mv.lengthSq() > 0) h.moveTo = null; else if (h.moveTo) { mv.subVectors(h.moveTo, h.g.position).setY(0); if (mv.length() < .2) { h.moveTo = null; mv.set(0, 0, 0); } }
  const moving = mv.lengthSq() > 0;
  if (moving) { mv.normalize().multiplyScalar(h.C.speed * dt); h.g.position.add(mv); h.g.position.x = Math.max(-GW, Math.min(GW, h.g.position.x)); h.g.position.z = Math.max(-GH, Math.min(GH, h.g.position.z)); h.face = Math.atan2(mv.x, mv.z); h.walkT += dt * 11; }
  else h.walkT *= .85;
  // 타겟
  const rng = stat.range(); let tgt = null, bd = rng * rng;
  for (const e of G.enemies) { if (e.dead) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = dx * dx + dz * dz; if (d < bd && (h.cls !== 'warrior' || !e.E.fly)) { bd = d; tgt = e; } }
  h.cd -= dt;
  if (tgt) { const want = Math.atan2(tgt.g.position.x - h.g.position.x, tgt.g.position.z - h.g.position.z); if (!moving) h.face = want; if (h.cd <= 0 && h.spinT <= 0) { h.cd = 1 / stat.rate(); h.atkAnim = .35; attack(tgt); } }
  // 회오리
  if (h.spinT > 0) { h.spinT -= dt; h.g.rotation.y += dt * 22; h.spinTick -= dt; if (h.spinTick <= 0) { h.spinTick = .25; aoe(h.g.position, 3.6, stat.dmg() * 1.3 * stat.skillMul(), '#ffb07a', { groundOnly: true }); emit(P, h.g.position.x, 1.2, h.g.position.z, 20, 0xffa04a, 7, .4, 0, 4); } if (h.spinT <= 0) h.swirl.visible = false; else h.swirl.rotation.z += dt * 15; }
  else { let d = h.face - h.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); h.g.rotation.y += d * Math.min(1, dt * 14); }
  // 애니메이션
  const sw = Math.sin(h.walkT), amp = moving ? .7 : 0; h.legs[0].rotation.x = sw * amp; h.legs[1].rotation.x = -sw * amp; h.body.position.y = 1.15 + Math.abs(Math.cos(h.walkT)) * (moving ? .08 : 0) + Math.sin(G.t * 2.2) * .02;
  h.arms[0].rotation.x = -sw * amp * .6; h.arms[1].rotation.x = sw * amp * .6; h.atkAnim = Math.max(0, h.atkAnim - dt); const a = h.atkAnim / .35;
  if (h.cls === 'archer') { h.arms[0].rotation.x = -1.5 + (moving ? 0 : 0); h.arms[1].rotation.x = -1.5 + a * .1; h.arms[1].position.z = -a * .35; h.weapon.userData.string.position.z = -a * .3; h.body.rotation.y = -.25; }
  if (h.cls === 'mage') { h.arms[1].rotation.x = -.4 - Math.sin(a * Math.PI) * 1.6; h.weapon.userData.orb.scale.setScalar(1 + a * .8 + Math.sin(G.t * 5) * .1); }
  if (h.cls === 'warrior' && h.spinT <= 0) { h.arms[1].rotation.x = a > 0 ? -2.4 + (1 - a) * 3.2 : h.arms[1].rotation.x; h.arms[1].rotation.z = a > 0 ? -.6 + (1 - a) * 1.2 : 0; }
  h.ring.material.opacity = .5 + Math.sin(G.t * 4) * .2;
  if (h.flash > 0) { h.flash -= dt; h.mats.forEach(m => m.emissive.setHex(0xff2222)); } else h.mats.forEach(m => m.emissive.setHex(0));
  // 체력 재생
  if (!G.enemies.some(e => !e.dead && e.g.position.distanceTo(h.g.position) < 4)) h.hp = Math.min(h.max, h.hp + h.max * .03 * dt);
  h.hb.set(h.hp / h.max);
}
function attack(t) {
  const h = hero, from = new THREE.Vector3(); h.tip.getWorldPosition(from); SFX.shot();
  if (h.cls === 'archer') shoot('arrow', from, t, stat.dmg());
  else if (h.cls === 'mage') shoot('orb', from, t, stat.dmg(), { aoe: h.C.aoe, slow: true });
  else { // 부채꼴 베기
    const fx = Math.sin(h.face), fz = Math.cos(h.face);
    for (const e of G.enemies) { if (e.dead || e.E.fly) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = Math.hypot(dx, dz); if (d < stat.range() + .4 && (dx * fx + dz * fz) / (d || 1) > .45) hurt(e, stat.dmg(), '#ffcf9a'); }
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.8, 20, 1, -Math.PI / 3, Math.PI * 2 / 3), new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: .8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    arc.rotation.x = -Math.PI / 2; arc.rotation.z = h.face - Math.PI / 2; arc.position.set(h.g.position.x, 1, h.g.position.z); scene.add(arc); G.fxs.push({ m: arc, t: 0, dur: .2, kind: 'fade' });
  }
}
function updEnemies(dt) {
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dying !== undefined) { e.dying -= dt; e.inner.rotation.x = Math.min(Math.PI / 2, e.inner.rotation.x + dt * 6); e.g.position.y -= dt * (e.E.fly ? 6 : .8); e.mats.forEach(m => { m.transparent = true; m.opacity = Math.max(0, e.dying / .45); });
      if (e.dying <= 0) { scene.remove(e.g); G.enemies.splice(i, 1); } continue; }
    const spd = e.E.spd * (e.slowT > 0 ? .55 : 1); e.slowT -= dt; let moving = false;
    // 영웅과 근접 시 공격 (지상)
    const hd = hero && hero.dead <= 0 && !e.E.fly ? e.g.position.distanceTo(hero.g.position) : 99;
    if (hd < 1.2 + e.E.scale * .4) { e.atkCd -= dt; e.g.lookAt(hero.g.position.x, 0, hero.g.position.z); if (e.atkCd <= 0) { e.atkCd = .8; heroDamage(e.E.dps * .8); e.atkAnim = .3; } }
    else if (e.E.fly) { // 비행: 코어로 직진
      const tx = tileX(CORE[0]), tz = tileZ(CORE[1]), dx = tx - e.g.position.x, dz = tz - e.g.position.z, d = Math.hypot(dx, dz);
      if (d < .8) { reachCore(e); continue; } e.g.position.x += dx / d * spd * dt; e.g.position.z += dz / d * spd * dt; e.g.rotation.y = Math.atan2(dx, dz); moving = true;
    } else {
      if (!e.next) e.next = nextTile(e.tile[0], e.tile[1]);
      if (!e.next) { reachCore(e); continue; }
      const nt = G.grid[e.next[0]][e.next[1]];
      if (nt === T.BAR) { // 바리케이드 공격
        const b = G.bars.get(e.next[0] + ',' + e.next[1]); const bx = tileX(e.next[0]), bz = tileZ(e.next[1]);
        const dx = bx - e.g.position.x, dz = bz - e.g.position.z, d = Math.hypot(dx, dz);
        if (d > 1.5) { e.g.position.x += dx / d * spd * dt; e.g.position.z += dz / d * spd * dt; moving = true; } else { e.atkCd -= dt; if (e.atkCd <= 0 && b) { e.atkCd = .8; b.hp -= e.E.dps * .8; e.atkAnim = .3; emit(P, bx, 1, bz, 4, 0xc08a4a, 3, .4); b.g.position.x = bx + rnd(-.08, .08); if (b.hp <= 0) removeBarricade(b, true); } }
        e.g.rotation.y = Math.atan2(dx, dz);
      } else {
        const tx = tileX(e.next[0]), tz = tileZ(e.next[1]), dx = tx - e.g.position.x, dz = tz - e.g.position.z, d = Math.hypot(dx, dz);
        if (d < spd * dt + .02) { e.g.position.x = tx; e.g.position.z = tz; e.tile = e.next; e.next = null; if (e.tile[0] === CORE[0] && e.tile[1] === CORE[1]) { reachCore(e); continue; } }
        else { e.g.position.x += dx / d * spd * dt; e.g.position.z += dz / d * spd * dt; let ry = Math.atan2(dx, dz) - e.g.rotation.y; ry = Math.atan2(Math.sin(ry), Math.cos(ry)); e.g.rotation.y += ry * Math.min(1, dt * 10); }
        moving = true;
      }
    }
    // 걷기 애니메이션
    e.walkT += dt * (moving ? spd * 2.6 : 0); const s = Math.sin(e.walkT);
    if (e.wings) { const f = Math.sin(G.t * 14 + e.walkT); e.wings[0].rotation.z = f * .9; e.wings[1].rotation.z = -f * .9; e.inner.position.y = 3 + Math.sin(G.t * 3 + e.walkT) * .3; }
    else { e.legs[0].rotation.x = s * .8; e.legs[1].rotation.x = -s * .8; e.arms[0].rotation.x = -s * .6; e.arms[1].rotation.x = s * .6; e.inner.position.y = Math.abs(Math.cos(e.walkT)) * .12 * e.E.scale; e.inner.rotation.z = s * .06;
      if (e.atkAnim > 0) { e.atkAnim -= dt; e.arms[1].rotation.x = -2 + e.atkAnim * 4; e.arms[0].rotation.x = -1.5; }
      if (e.type === 'boss' && moving && Math.sin(e.walkT) * Math.sin(e.walkT - dt * spd * 2.6) < 0) { G.shake = Math.max(G.shake, .18); emit(P, e.g.position.x, .2, e.g.position.z, 6, 0x8a7a6a, 3, .4); } }
    if (e.flash > 0) { e.flash -= dt; e.mats.forEach(m => m.emissive.setHex(0xffffff)); } else if (e.slowT > 0) e.mats.forEach(m => m.emissive.setHex(0x2a3aaa)); else e.mats.forEach(m => m.emissive.setHex(0));
    e.hb.set(Math.max(0, e.hp / e.max));
  }
}
function reachCore(e) {
  G.coreHp -= e.E.core; e.dead = true; scene.remove(e.g); G.enemies.splice(G.enemies.indexOf(e), 1); G.shake = Math.max(G.shake, .35);
  emit(P, core.position.x, 3, core.position.z, 30, 0xff3a5a, 6, .7); crystal.material.emissive.setHex(0xff2a3a); setTimeout(() => crystal.material.emissive.setHex(0x3ae8ff), 200); SFX.tone(90, .3, 'sawtooth', .05);
  if (G.coreHp <= 0) gameOver();
}
function gameOver() { if (G.phase === 'over') return; G.phase = 'over'; $('over').classList.remove('hidden'); $('overTxt').textContent = `웨이브 ${G.wave}에서 코어가 파괴되었습니다 · 최고 기록 ${Math.max(G.wave, +localStorage.getItem('hd3d_best') || 0)}`; }
function updProjs(dt) {
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i], m = p.m;
    if (p.kind === 'rain' || p.kind === 'meteor') {
      const d = p.dest.clone().sub(m.position), len = d.length(), mv = p.spd * dt;
      if (p.kind === 'meteor') { emit(P, m.position.x, m.position.y, m.position.z, 6, 0xff8a2a, 2, .5, 2, 2); m.rotation.x += dt * 5; }
      if (len <= mv) { scene.remove(m); G.projs.splice(i, 1);
        if (p.kind === 'rain') { aoe(p.dest, 1.3, p.dmg, '#9affb0'); emit(P, p.dest.x, .3, p.dest.z, 5, 0x9affb0, 3, .35); }
        else { aoe(p.dest, 4.8, p.dmg, '#ffb05a', { big: true, slow: true }); G.shake = .9; ringFx(p.dest, 6, 0xff8a2a, .6); emit(PB, p.dest.x, .5, p.dest.z, 50, 0xff7a2a, 10, 1, -4, 3); emit(P, p.dest.x, .5, p.dest.z, 160, 0xffcc5a, 14, 1.1, -14, 3); SFX.tone(70, .6, 'sawtooth', .07, -30); }
        continue; }
      m.position.addScaledVector(d.normalize(), mv); continue;
    }
    if (p.target.dead) { scene.remove(m); G.projs.splice(i, 1); continue; }
    const tp = p.target.g.position.clone().setY(1 + (p.target.E.fly ? 3 : 0) + .4 * p.target.E.scale), d = tp.clone().sub(m.position), len = d.length(), mv = p.spd * dt;
    if (len <= mv) { scene.remove(m); G.projs.splice(i, 1); SFX.hit();
      if (p.kind === 'arrow') { hurt(p.target, p.dmg, '#ffffff'); emit(P, tp.x, tp.y, tp.z, 5, 0xd0ffd0, 3, .3); }
      else { aoe(tp, p.aoe, p.dmg, '#d0a0ff', { slow: true }); emit(P, tp.x, tp.y, tp.z, 18, 0xb07aff, 5, .5, -4, 1.5); ringFx(tp, p.aoe, 0xb07aff, .3); }
      continue; }
    m.position.addScaledVector(d.normalize(), mv); m.lookAt(tp);
    emit(P, m.position.x, m.position.y, m.position.z, 1, p.kind === 'arrow' ? 0x9affb0 : 0xb07aff, .3, .25, 0, 0);
  }
}
function updFx(dt) {
  for (let i = G.fxs.length - 1; i >= 0; i--) { const f = G.fxs[i]; f.t += dt; const k = f.t / f.dur;
    if (f.kind === 'ring') { f.m.scale.setScalar(.3 + k * f.r); f.m.material.opacity = (1 - k) * .9; } else f.m.material.opacity = (1 - k) * .8;
    if (k >= 1) { scene.remove(f.m); G.fxs.splice(i, 1); } }
}
function updLighting(dt) {
  G.night += (G.nightTarget - G.night) * Math.min(1, dt * 1.5); const n = G.night;
  scene.background.copy(DAY_SKY).lerp(NIGHT_SKY, n); scene.fog.color.copy(scene.background);
  sun.intensity = 2.4 * (1 - n) + .15; moon.intensity = 1.1 * n; hemi.intensity = 1.1 - .75 * n; stars.material.opacity = n;
  sun.color.setHSL(.1, .6 - n * .3, .85 - n * .2); bloom.strength = .45 + n * .5; portalLight.intensity = 20 + n * 60 + Math.sin(G.t * 6) * 8; coreLight.intensity = 15 + n * 40;
}
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(); const raw = (now - lastT) / 1000; lastT = now;
  step(Math.min(raw, .05)); composer.render();
}
G.sim = (sec, h = .05) => { for (let t = 0; t < sec; t += h) step(h); };
function step(dt) {
  G.t += dt;
  if (G.phase === 'select') { preview.forEach((p, i) => { p.g.rotation.y = Math.sin(G.t * .8 + i) * .6; p.body.position.y = 1.15 + Math.sin(G.t * 2 + i) * .05; p.arms[1].rotation.x = Math.sin(G.t * 1.5 + i) * .3; }); cam.theta = Math.sin(G.t * .2) * .25; }
  if (G.phase === 'wave') {
    if (G.spawnQ.length) { G.spawnT -= dt; if (G.spawnT <= 0) { G.spawnT = rnd(.45, .8); spawnEnemy(G.spawnQ.shift(), G.hpMul); } }
    else if (!G.enemies.length) endWave();
  }
  if (hero && G.phase !== 'over' && G.phase !== 'select') {
    animateHero(dt); updEnemies(dt); updProjs(dt);
    if (hero.skillCd > 0) hero.skillCd -= dt;
    if (keys.w || keys.a || keys.s || keys.d || hero.moveTo) cam.target.lerp(new THREE.Vector3(hero.g.position.x * .35, 0, hero.g.position.z * .35), dt * 2);
  }
  updFx(dt); updParticles(P, dt); updParticles(PB, dt); updLighting(dt);
  portalCore.rotation.x += dt * 2; portalCore.material.color.setHSL(.78 + Math.sin(G.t * 3) * .04, 1, .55); if (Math.random() < .5) emit(P, portal.position.x, rnd(.8, 3), portal.position.z + rnd(-1.2, 1.2), 1, 0xc07aff, 1.5, .8, 2, .3);
  crystal.rotation.y += dt * 1.5; crystal.position.y = 3.4 + Math.sin(G.t * 2) * .2;
  routeDots.children.forEach(d => { const k = (G.t * 4 - d.userData.k * .5) % 6; d.scale.setScalar(k > 0 && k < 1 ? 1.8 : 1); d.visible = G.phase === 'build'; });
  if (moveMark.visible) { moveMark.scale.multiplyScalar(1 - dt * 3); moveMark.material.opacity = moveMark.scale.x; if (moveMark.scale.x < .2) moveMark.visible = false; }
  G.shake = Math.max(0, G.shake - dt * 1.8); updateCam(); hudT += dt; if (hudT > .15) { hudT = 0; if (G.phase !== 'select') refreshHud(); }
}
initGrid(); refreshTiles(); computeDist(); showSelect(); loop();
