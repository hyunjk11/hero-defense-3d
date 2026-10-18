import { Snd } from './audio/audio.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { $, mulberry32, rand, rnd } from './core/util.js';
import { CORE, DIGK, DIRS, GH, GW, S, SPAWN, T, inGrid, isBlock, tileX, tileZ, toTile } from './core/grid.js';
import { BLK, TNAME } from './data/terrain.js';
import { CLASSES, UPS } from './data/heroes.js';
import { ETYPES } from './data/monsters.js';
import { TOWERS } from './data/towers.js';
import { G, later } from './core/state.js';
import { DAY, NIGHT, bloom, cam, camera, composer, hemi, moon, renderer, scene, skyU, sun, updateCam } from './render/scene.js';
import { IM, dummy, glow, hideI, mk, setI, tmpC, toon } from './render/toon.js';
import { SFX } from './audio/sfx.js';
import { P, PB, debris, dmgText, emit, popCoins, ringFx, stars, updCoins, updDebris, updFx, updParticles } from './render/vfx.js';
import { BARS, hpBar, updBars } from './render/hpbars.js';
import { GL, flashMats, loadAssets, makeEnemyModel, makeHeroModel, play } from './render/characters.js';

// ================= 맵 생성 =================
const seed = +(new URLSearchParams(location.search).get('seed')) || (Math.random() * 1e9 | 0);
function genMap() {
  const R = mulberry32(seed), L = Array.from({ length: 64 }, () => Array.from({ length: 64 }, R)), sm = t => t * t * (3 - 2 * t);
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi), a = L[xi & 63][yi & 63], b = L[(xi + 1) & 63][yi & 63], c = L[xi & 63][(yi + 1) & 63], d = L[(xi + 1) & 63][(yi + 1) & 63]; return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  const V = []; for (let c = 0; c < GW; c++) { V[c] = []; for (let r = 0; r < GH; r++) V[c][r] = vn(c * .3 + 5.3, r * .3 + 2.1) * .6 + vn(c * .75 + 9.7, r * .75 + 4.4) * .4; }
  const all = V.flat().sort((a, b) => a - b), q = p => all[Math.floor(all.length * p)];
  const q1 = q(.25), q2 = q(.6), q3 = q(.77);
  for (let c = 0; c < GW; c++) { G.tiles[c] = []; for (let r = 0; r < GH; r++) {
    const v = V[c][r]; let t = v < q1 ? T.GRASS : v < q2 ? T.DIRT : v < q3 ? T.FOREST : T.ROCK;
    const dS = Math.abs(c - SPAWN[0]) + Math.abs(r - SPAWN[1]), dC = Math.abs(c - CORE[0]) + Math.abs(r - CORE[1]);
    if (R() < .04 && dS > 4 && dC > 4) t = T.BEDROCK;
    if ((c <= 1 && Math.abs(r - SPAWN[1]) <= 1) || (Math.abs(c - CORE[0]) <= 1 && Math.abs(r - CORE[1]) <= 1)) t = T.GRASS;
    const hp = BLK[t] ? BLK[t].hp : 0;
    G.tiles[c][r] = { c, r, t, hp, max: hp, tower: null, bar: null, s: R(), s2: R(), s3: R(), shk: 0, ck: (c + r) % 2 ? .03 : 0 };
  } }
  G.tiles[SPAWN[0]][SPAWN[1]].t = T.SPAWN; G.tiles[CORE[0]][CORE[1]].t = T.CORE;
}
const tileAt = (c, r) => G.tiles[c][r];

// ================= 지형 메시 (인스턴스) =================
const NT = GW * GH;
const groundIM = IM(new RoundedBoxGeometry(S * .97, .8, S * .97, 2, .12), toon(0xffffff), NT, .02);
const dirtIM = IM(new RoundedBoxGeometry(1.84, 1, 1.84, 3, .3), toon(0xffffff), NT, .035);
const capIM = IM(new RoundedBoxGeometry(1.94, .34, 1.94, 3, .16), toon(0xffffff), NT, .03);
const trunkIM = IM(new THREE.CylinderGeometry(.15, .24, 1, 8), toon(0x8a5530), NT, .03);
const leafIM = IM(new THREE.IcosahedronGeometry(1, 2), toon(0xffffff), NT * 2, .035);
const rockGeo = (() => { const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position, R = mulberry32(7), m = new Map();
  for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!m.has(k)) m.set(k, .82 + R() * .3); const f = m.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * .8, p.getZ(i) * f); }
  g.computeVertexNormals(); return g; })();
const rockIM = IM(rockGeo, toon(0xffffff), NT * 2, .035);
const tuftIM = IM(new THREE.ConeGeometry(.09, .42, 5), toon(0xffffff), NT * 3, 0, false);
const flowerIM = IM(new THREE.IcosahedronGeometry(.11, 1), toon(0xffffff, { emissive: 0x222222 }), NT * 2, 0, false);
const pebbleIM = IM(new THREE.DodecahedronGeometry(.16, 0), toon(0x8a6a4a), NT * 3, .02);
const bedrock = new THREE.Group(); scene.add(bedrock);
function initTerrainColors() {
  for (let c = 0; c < GW; c++) for (let r = 0; r < GH; r++) {
    const t = tileAt(c, r), i = c * GH + r;
    dirtIM.setColorAt(i, tmpC.setHSL(.065, .55, .26 + t.s * .05));
    capIM.setColorAt(i, tmpC.setHSL(.22 + t.s2 * .04, .58, .38 + t.s * .05));
    for (let k = 0; k < 2; k++) leafIM.setColorAt(i * 2 + k, tmpC.setHSL(.27 + t.s * .07 + k * .02, .6, .4 + k * .07 + t.s2 * .05));
    for (let k = 0; k < 2; k++) rockIM.setColorAt(i * 2 + k, tmpC.setHSL(.6 + t.s * .05, .08 + t.s2 * .06, .55 + k * .08 + t.s * .06));
    for (let k = 0; k < 3; k++) tuftIM.setColorAt(i * 3 + k, tmpC.setHSL(.26 + t.s * .06, .6, .38 + k * .05));
    for (let k = 0; k < 2; k++) flowerIM.setColorAt(i * 2 + k, tmpC.set([0xff8ac0, 0xffe05a, 0xffffff, 0xa0c8ff][Math.floor(t.s3 * 4 + k * 1.7) % 4]));
    if (t.t === T.BEDROCK) makeBedrock(t);
  }
  for (const im of [dirtIM, capIM, leafIM, rockIM, tuftIM, flowerIM]) im.instanceColor.needsUpdate = true;
}
function makeBedrock(t) {
  const g = new THREE.Group(); g.position.set(tileX(t.c), 0, tileZ(t.r)); bedrock.add(g);
  const m = mk(rockGeo, toon(0x4a4660), 0, .9, 0, g); m.scale.set(1.05, 1.5, 1.05); m.rotation.y = t.s * 6;
  const cm = glow(0xb47aff, 1.6);
  for (let k = 0; k < 3; k++) { const s = mk(new THREE.OctahedronGeometry(.38, 0), cm, Math.cos(k * 2.1 + t.s) * .55, 1.6 + k * .25, Math.sin(k * 2.1 + t.s) * .55, g); s.scale.set(.6, 1.6 + k * .3, .6); s.rotation.z = (k - 1) * .4; }
}
function refreshTile(t) {
  const i = t.c * GH + t.r, x = tileX(t.c), z = tileZ(t.r);
  const jx = t.shk > 0 ? rnd(-.09, .09) : 0, jz = t.shk > 0 ? rnd(-.09, .09) : 0, low = t.t === T.CARVED;
  setI(groundIM, i, x, low ? -.88 : -.4, z, 1);
  if (low) groundIM.setColorAt(i, tmpC.setHSL(.09, .55, .56 + t.s * .05));
  else if (t.t === T.SPAWN) groundIM.setColorAt(i, tmpC.set(0x5a4a7a));
  else if (t.t === T.CORE) groundIM.setColorAt(i, tmpC.set(0xc8c0d8));
  else groundIM.setColorAt(i, tmpC.setHSL(.25 + t.s * .04, .55, .44 + t.ck + t.s2 * .04));
  groundIM.instanceColor.needsUpdate = true;
  [dirtIM, capIM, trunkIM].forEach(m => hideI(m, i)); for (let k = 0; k < 2; k++) { hideI(leafIM, i * 2 + k); hideI(rockIM, i * 2 + k); hideI(flowerIM, i * 2 + k); }
  for (let k = 0; k < 3; k++) { hideI(tuftIM, i * 3 + k); hideI(pebbleIM, i * 3 + k); }
  const k = BLK[t.t] ? .7 + .3 * (t.hp / t.max) : 0, ry = t.s * 6.28;
  if (t.t === T.DIRT) { const h = (.6 + t.s * .35) * k; setI(dirtIM, i, x + jx, h / 2, z + jz, k, h, k, 0); setI(capIM, i, x + jx, h + .03, z + jz, k, .8, k); }
  if (t.t === T.FOREST) { const h = .35 * k; setI(dirtIM, i, x + jx, h / 2, z + jz, k, h, k); setI(capIM, i, x + jx, h + .03, z + jz, k, .8, k);
    const th = .6 * k; setI(trunkIM, i, x + jx * 2, h + th / 2, z + jz * 2, k, th, k);
    setI(leafIM, i * 2, x + jx * 2.5, h + th + .38 * k, z + jz * 2.5, (.72 + t.s2 * .12) * k, .58 * k, (.72 + t.s2 * .12) * k, ry);
    setI(leafIM, i * 2 + 1, x + jx * 3 + .1, h + th + .78 * k, z + jz * 3 - .1, .45 * k, .42 * k, .45 * k, ry); }
  if (t.t === T.ROCK) { setI(rockIM, i * 2, x + jx, .3 * k, z + jz, (.92 + t.s2 * .1) * k, (.62 + t.s * .25) * k, (.92 + t.s2 * .1) * k, ry);
    setI(rockIM, i * 2 + 1, x + jx + Math.cos(ry) * .6, .2 * k, z + jz + Math.sin(ry) * .6, .45 * k, .45 * k, .45 * k, ry * 2); }
  if (t.t === T.GRASS && !t.tower) { for (let q = 0; q < 3; q++) { const a = t.s3 * 9 + q * 2.2, rr = .35 + ((t.s * 7 + q * .37) % .5); setI(tuftIM, i * 3 + q, x + Math.cos(a) * rr, .18, z + Math.sin(a) * rr, 1, 1 + q * .25, 1, 0, (q - 1) * .25); }
    if (t.s2 > .55) for (let q = 0; q < 2; q++) { const a = t.s * 9 + q * 3.1, rr = .45 + q * .25; setI(flowerIM, i * 2 + q, x + Math.cos(a) * rr, .08, z + Math.sin(a) * rr, 1); } }
  if (low) for (let q = 0; q < 3; q++) { const a = t.s3 * 7 + q * 2.4, rr = .3 + ((t.s2 * 5 + q * .29) % .55); setI(pebbleIM, i * 3 + q, x + Math.cos(a) * rr, -.46, z + Math.sin(a) * rr, .6 + q * .3, .5, .6 + q * .3, a); }
}
function refreshAll() { for (let c = 0; c < GW; c++) for (let r = 0; r < GH; r++) refreshTile(tileAt(c, r)); }

// 주변 장식
(function deco() {
  const R = mulberry32(99), base = new THREE.Mesh(new THREE.CircleGeometry(260, 48), toon(0x5aa84a)); base.rotation.x = -Math.PI / 2; base.position.y = -.81; base.receiveShadow = true; scene.add(base);
  const rim = new THREE.Mesh(new RoundedBoxGeometry(GW * S + 1.2, 1.6, GH * S + 1.2, 2, .4), toon(0x7a5a3a)); rim.position.y = -1.6; rim.receiveShadow = true; scene.add(rim);
  const n = 140, tr = IM(new THREE.CylinderGeometry(.22, .32, 1.6, 7), toon(0x7a4a2a), n, .04), lf = IM(new THREE.IcosahedronGeometry(1, 2), toon(0xffffff), n * 2, .045);
  for (let i = 0; i < n; i++) {
    let x, z; do { x = (R() - .5) * 130; z = (R() - .5) * 100; } while ((Math.abs(x) < GW + 3 && Math.abs(z) < GH + 3) || (Math.abs(x) < 16 && z > 14 && z < 40));
    const s = .9 + R() * .9; setI(tr, i, x, -.8 + .8 * s, z, s);
    setI(lf, i * 2, x, -.8 + 2.2 * s, z, 1.5 * s, 1.3 * s, 1.5 * s, R() * 6); setI(lf, i * 2 + 1, x + .2, -.8 + 3.4 * s, z, s, .9 * s, s, R() * 6);
    lf.setColorAt(i * 2, tmpC.setHSL(.25 + R() * .1, .55, .38 + R() * .1)); lf.setColorAt(i * 2 + 1, tmpC.setHSL(.27 + R() * .1, .55, .45 + R() * .1));
  }
  lf.instanceColor.needsUpdate = true;
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + .3, m = mk(new THREE.ConeGeometry(18 + R() * 10, 22 + R() * 14, 7), toon(new THREE.Color().setHSL(.58, .25, .55 + R() * .1)), Math.cos(a) * 140, 8, Math.sin(a) * 110, scene, 0); m.castShadow = false; }
})();

// 포털
const portal = new THREE.Group(); scene.add(portal);
const portalTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'); const g = x.createRadialGradient(128, 128, 10, 128, 128, 128); g.addColorStop(0, '#ffffff'); g.addColorStop(.25, '#e0a0ff'); g.addColorStop(.7, '#7a2ad0'); g.addColorStop(1, '#2a0a50'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 6; for (let k = 0; k < 5; k++) { x.beginPath(); for (let a = 0; a < 9; a += .05) { const rr = a * 13; x.lineTo(128 + Math.cos(a + k * 1.256) * rr, 128 + Math.sin(a + k * 1.256) * rr); } x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const portalDisk = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), new THREE.MeshBasicMaterial({ map: portalTex, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
const portalLight = new THREE.PointLight(0xb03aff, 30, 14);
function buildPortal() {
  portal.position.set(tileX(SPAWN[0]), 0, tileZ(SPAWN[1])); portal.rotation.y = Math.PI / 2;
  const st = toon(0x6a6080);
  for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8, b = mk(new RoundedBoxGeometry(.6, .55, .7, 2, .12), st, Math.cos(a) * 1.75, 1.9 + Math.sin(a) * 1.75, 0, portal); b.rotation.z = a; }
  mk(new RoundedBoxGeometry(.7, 1.9, .8, 2, .12), st, -1.75, .95, 0, portal); mk(new RoundedBoxGeometry(.7, 1.9, .8, 2, .12), st, 1.75, .95, 0, portal);
  portalDisk.position.y = 1.95; portal.add(portalDisk); portalLight.position.y = 2; portal.add(portalLight);
  for (let k = 0; k < 2; k++) mk(new THREE.OctahedronGeometry(.25, 0), glow(0xd090ff, 2), (k ? 1 : -1) * 1.75, 2.15, .45, portal);
}
// 코어 (성 + 수정)
const core = new THREE.Group(); scene.add(core);
const crystal = new THREE.Group(), coreLight = new THREE.PointLight(0x3ae8ff, 25, 14), crystalMat = toon(0x38b8e0, { emissive: 0x1890c0, emissiveIntensity: .55 }), coreRings = [];
function buildCore() {
  core.position.set(tileX(CORE[0]), 0, tileZ(CORE[1]));
  const stone = toon(0xc9c2dc), roof = toon(0x4a6ae8), gold = toon(0xffcc44, { emissive: 0x442200 });
  mk(new RoundedBoxGeometry(3, 1.4, 3, 2, .25), stone, 0, .7, 0, core);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => { mk(new THREE.CylinderGeometry(.42, .5, 2.6, 12), stone, x * 1.35, 1.3, z * 1.35, core); mk(new THREE.ConeGeometry(.62, 1.1, 12), roof, x * 1.35, 3.15, z * 1.35, core); mk(new THREE.SphereGeometry(.1, 8, 6), gold, x * 1.35, 3.75, z * 1.35, core, 0); });
  mk(new THREE.CylinderGeometry(.9, 1.1, .5, 16), gold, 0, 1.6, 0, core);
  const c1 = mk(new THREE.OctahedronGeometry(.8, 0), crystalMat, 0, 0, 0, crystal); c1.scale.set(1, 1.7, 1);
  for (let k = 0; k < 4; k++) { const s = mk(new THREE.OctahedronGeometry(.3, 0), crystalMat, Math.cos(k * 1.57) * 1, -.4, Math.sin(k * 1.57) * 1, crystal); s.scale.y = 1.6; }
  for (let k = 0; k < 2; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4 + k * .35, .05, 8, 48), glow(k ? 0xffe06a : 0x7af6ff, .9)); ring.rotation.x = Math.PI / 2 + k * .5; crystal.add(ring); coreRings.push(ring); }
  crystal.position.y = 3.6; core.add(crystal); coreLight.position.y = 3.6; core.add(coreLight); G.coreHb = hpBar(core, 6.2, 3.2, 0x5af0ff, { grade: false, h: .2 });
}
function banner(text, color = '#fff', ms = 1600) { const b = $('banner'); b.textContent = text; b.style.color = color; b.classList.add('show'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), ms); }

// ================= 경로 탐색 (코어 기준 다익스트라: 거리 + 지형 강도) =================
function enterCost(t) {
  if (t.tower || t.t === T.BEDROCK) return Infinity;
  let c = t.t === T.GRASS ? 1.15 : 1; if (t.bar) c += 1 + t.bar.hp / DIGK; if (isBlock(t.t)) c += t.hp / DIGK; return c;
}
class Heap { constructor() { this.a = []; } push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; } get size() { return this.a.length; } }
function dijkstra(extraBlock) {
  const D = new Float64Array(GW * GH).fill(Infinity), h = new Heap(); D[CORE[0] * GH + CORE[1]] = 0; h.push([0, CORE[0], CORE[1]]);
  while (h.size) { const [d, c, r] = h.pop(); if (d > D[c * GH + r]) continue; const cu = enterCost(tileAt(c, r));
    for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (!inGrid(nc, nr)) continue; const nt = tileAt(nc, nr); if (nt === extraBlock || enterCost(nt) === Infinity) continue;
      const nd = d + cu; if (nd < D[nc * GH + nr]) { D[nc * GH + nr] = nd; h.push([nd, nc, nr]); } } }
  return D;
}
function computeDist() { G.stats.distCalcs++; G.D = dijkstra(); G.distDirty = false; drawRoute(); }
const dAt = (c, r) => G.D[c * GH + r];
function nextStep(c, r) {
  let best = null, bs = Infinity;
  for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (!inGrid(nc, nr)) continue; const t = tileAt(nc, nr), ec = enterCost(t); if (ec === Infinity) continue; const s = ec + dAt(nc, nr); if (s < bs) { bs = s; best = [nc, nr]; } }
  return best;
}
// ---- 몬스터 길 시각화: 참호 가장자리 빛 + 예상 경로(점선) + 코어로 흐르는 화살표 ----
const pathT = t => t.t === T.CARVED || t.t === T.SPAWN || t.t === T.CORE;
const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb84a).multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: .9 });
const edgeIM = IM(new THREE.BoxGeometry(S, .1, .16), edgeMat, NT * 4, 0, false);
const floorTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); const g = x.createRadialGradient(64, 64, 10, 64, 64, 90);
  g.addColorStop(0, 'rgba(255,220,150,.55)'); g.addColorStop(.7, 'rgba(255,200,120,.25)'); g.addColorStop(1, 'rgba(255,170,80,.7)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(255,230,170,.9)'; x.lineWidth = 5; x.strokeRect(4, 4, 120, 120); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const floorMat = new THREE.MeshBasicMaterial({ map: floorTex, color: 0xffd890, transparent: true, opacity: .3, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
const floorIM = IM(new THREE.PlaneGeometry(S * .96, S * .96).rotateX(-Math.PI / 2), floorMat, NT, 0, false);
function refreshEdges() {
  for (let c = 0; c < GW; c++) for (let r = 0; r < GH; r++) { const t = tileAt(c, r), i = c * GH + r;
    if (t.t === T.CARVED) setI(floorIM, i, tileX(c), -.455, tileZ(r), 1); else hideI(floorIM, i);
    DIRS.forEach(([dc, dr], k) => { const n = inGrid(c + dc, r + dr) ? tileAt(c + dc, r + dr) : null, j = i * 4 + k;
      if (t.t === T.CARVED && !(n && pathT(n))) setI(edgeIM, j, tileX(c) + dc * (S / 2 - .05), -.43, tileZ(r) + dr * (S / 2 - .05), 1, 1, 1, dc ? Math.PI / 2 : 0);
      else hideI(edgeIM, j); }); }
}
const chevGeo = (() => { const sh = new THREE.Shape(); sh.moveTo(.32, 0); sh.lineTo(-.18, .3); sh.lineTo(-.05, 0); sh.lineTo(-.18, -.3); sh.closePath(); return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2); })();
const flowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: .85, depthWrite: false });
const olMat = new THREE.MeshBasicMaterial({ color: 0x140a04, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide });
const NCH = 60, NDASH = 260, chevIM = IM(chevGeo, flowMat, NCH, 0, false), dashIM = IM(new THREE.BoxGeometry(.4, .07, .2), dashMat, NDASH, 0, false);
const chevOL = IM(chevGeo, olMat, NCH, 0, false), dashOL = IM(new THREE.BoxGeometry(.4, .07, .2), olMat, NDASH, 0, false);
chevIM.renderOrder = dashIM.renderOrder = 6; chevOL.renderOrder = dashOL.renderOrder = 5;
const olM = new THREE.Matrix4(), olS = new THREE.Matrix4();
function olWrite(im, i, k) { olS.makeScale(k, 1, k); olM.copy(dummy.matrix).multiply(olS); olM.elements[13] -= .015; im.setMatrixAt(i, olM); }
let routeCurve = null, routeLen = 0, routeDig = []; const C_DASHO = new THREE.Color(0xfffbe8).multiplyScalar(1.5), C_DASHD = new THREE.Color(0xffe0b0).multiplyScalar(1.5); const C_OPEN = new THREE.Color(0xfff07a).multiplyScalar(1.5), C_DIG = new THREE.Color(0xff6a3a).multiplyScalar(1.5), C_FLOW = new THREE.Color(0xffe27a).multiplyScalar(1.6), C_FLOWD = new THREE.Color(0xff7a3a).multiplyScalar(1.6);
G.route = [];
// 경로 리본 (테두리 어두운 띠 + 빛나는 띠), 경로가 바뀔 때마다 다시 만듦
const ribbonMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .7, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const ribbonOLMat = new THREE.MeshBasicMaterial({ color: 0x1a0c04, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide });
const ribbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat), ribbonOL = new THREE.Mesh(new THREE.BufferGeometry(), ribbonOLMat);
ribbon.renderOrder = 4; ribbonOL.renderOrder = 3; ribbon.frustumCulled = ribbonOL.frustumCulled = false; scene.add(ribbonOL, ribbon);
function ribbonGeo(curve, dig, w, dy, colored) {
  const N = Math.max(8, Math.ceil(curve.getLength() * 3)), pos = [], col = [], idx = [], p = new THREE.Vector3(), t = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i <= N; i++) { const u = i / N; curve.getPointAt(u, p); curve.getTangentAt(u, t); const nx = -t.z, nz = t.x, l = Math.hypot(nx, nz) || 1;
    pos.push(p.x + nx / l * w, p.y + dy, p.z + nz / l * w, p.x - nx / l * w, p.y + dy, p.z - nz / l * w);
    if (colored) { const d = dig[Math.min(dig.length - 1, Math.round(u * (dig.length - 1)))]; c.copy(d ? C_DIG : C_OPEN).multiplyScalar(.75); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (colored) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
}
function drawRoute() {
  const pts = [], dig = []; let cur = SPAWN.slice(), k = 0; G.route = [];
  while (cur && k++ < 199) { const t = tileAt(cur[0], cur[1]), d = isBlock(t.t) || !!t.bar; G.route.push(cur);
    pts.push(new THREE.Vector3(tileX(cur[0]), d ? (t.bar ? 1.6 : t.t === T.ROCK ? 1.25 : t.t === T.FOREST ? 2.3 : 1.15) : t.t === T.CARVED ? -.32 : .14, tileZ(cur[1]))); dig.push(d);
    if (cur[0] === CORE[0] && cur[1] === CORE[1]) break; cur = nextStep(cur[0], cur[1]); }
  routeDig = dig; if (pts.length < 2) { routeCurve = null; return; }
  routeCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', .5); routeLen = routeCurve.getLength(); refreshEdges();
  ribbon.geometry.dispose(); ribbon.geometry = ribbonGeo(routeCurve, dig, .36, .02, true); ribbonOL.geometry.dispose(); ribbonOL.geometry = ribbonGeo(routeCurve, dig, .56, 0, false);
}
const rv = new THREE.Vector3(), rt = new THREE.Vector3();
function updRoute() {
  const show = (G.phase === 'build' || G.phase === 'wave') && routeCurve, build = G.phase === 'build';
  let n = 0; edgeMat.opacity = .75 + Math.sin(G.t * 3) * .15; floorMat.opacity = .2 + G.night * .22 + Math.sin(G.t * 2.2) * .05;
  if (show) { // 점선: 건설 단계에선 선명하게, 전투 중엔 은은하게. 천천히 코어 쪽으로 흐름
    const gap = .85, off = (G.t * 1.2) % gap;
    for (let s = off; s < routeLen && n < NDASH; s += gap) { const u = s / routeLen; routeCurve.getPointAt(u, rv); routeCurve.getTangentAt(u, rt); rv.y += .05;
      const di = routeDig[Math.min(routeDig.length - 1, Math.round(u * (routeDig.length - 1)))]; dashIM.setColorAt(n, di ? C_DASHD : C_DASHO);
      dummy.position.copy(rv); dummy.rotation.set(0, Math.atan2(-rt.z, rt.x), Math.asin(Math.max(-1, Math.min(1, rt.y)))); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); dashIM.setMatrixAt(n, dummy.matrix); olWrite(dashOL, n, 1.45); n++; } }
  for (let i = n; i < NDASH; i++) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); dashIM.setMatrixAt(i, dummy.matrix); dashOL.setMatrixAt(i, dummy.matrix); } dashOL.instanceMatrix.needsUpdate = true;
  dashMat.opacity = build ? 1 : .85; ribbon.visible = ribbonOL.visible = !!show; ribbonMat.opacity = (build ? .8 : .6) + Math.sin(G.t * 3) * .08; ribbonOLMat.opacity = build ? .5 : .35; dashIM.instanceMatrix.needsUpdate = true; if (dashIM.instanceColor) dashIM.instanceColor.needsUpdate = true;
  let m = 0; if (show) { const gap = 2.6, off = (G.t * 3.4) % gap;
    for (let s = off; s < routeLen && m < NCH; s += gap) { const u = s / routeLen; routeCurve.getPointAt(u, rv); routeCurve.getTangentAt(u, rt); const fade = Math.min(1, s / 2, (routeLen - s) / 2);
      dummy.position.set(rv.x, rv.y + .1 + Math.sin(G.t * 5 + s) * .04, rv.z); dummy.rotation.set(0, Math.atan2(-rt.z, rt.x), 0); const sc = (build ? 1.6 : 1.25) * Math.max(.05, fade); dummy.scale.set(sc, 1, sc); dummy.updateMatrix(); chevIM.setMatrixAt(m, dummy.matrix); olWrite(chevOL, m, 1.4); chevIM.setColorAt(m++, routeDig[Math.min(routeDig.length - 1, Math.round(u * (routeDig.length - 1)))] ? C_FLOWD : C_FLOW); } }
  for (let i = m; i < NCH; i++) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); chevIM.setMatrixAt(i, dummy.matrix); chevOL.setMatrixAt(i, dummy.matrix); } chevOL.instanceMatrix.needsUpdate = true; olMat.opacity = build ? .6 : .4;
  chevIM.instanceMatrix.needsUpdate = true; if (chevIM.instanceColor) chevIM.instanceColor.needsUpdate = true; flowMat.opacity = build ? .95 : .8;
}

// ================= 바리케이드 =================
const barMaxHp = () => 320 * (1 + .25 * G.ups.bar);
const woodM = toon(0xa8703a), woodD = toon(0x6a4422), ropeM = toon(0xe0c890);
function addBarricade(t) {
  const g = new THREE.Group(), x = tileX(t.c), z = tileZ(t.r); g.position.set(x, t.t === T.CARVED ? -.46 : 0, z); scene.add(g);
  const wl = (c, r) => inGrid(c, r) && enterCost(tileAt(c, r)) < 3; const horiz = wl(t.c - 1, t.r) || wl(t.c + 1, t.r);
  const inner = new THREE.Group(); inner.rotation.y = horiz ? Math.PI / 2 : 0; g.add(inner);
  for (const y of [.45, 1]) { const l = mk(new THREE.CylinderGeometry(.13, .13, 1.9, 8), woodD, 0, y, -.1, inner); l.rotation.z = Math.PI / 2; }
  for (let i = -2; i <= 2; i++) { const s = mk(new THREE.CylinderGeometry(.1, .12, 1.3, 7), woodM, i * .4, .75, 0, inner); s.rotation.x = (i % 2 ? .3 : -.2); mk(new THREE.ConeGeometry(.1, .35, 7), toon(0xe8c890), 0, .82, 0, s, .02); }
  for (const sx of [-1, 1]) { const x2 = mk(new THREE.CylinderGeometry(.09, .09, 1.6, 7), woodD, sx * .55, .8, .22, inner); x2.rotation.z = sx * .7; }
  mk(new THREE.TorusGeometry(.15, .04, 6, 12), ropeM, -.4, 1, -.1, inner, 0);
  const hb = hpBar(g, 2, 1.6, 0xffb03a, { auto: true }); const b = { t, g, hp: barMaxHp(), max: barMaxHp(), hb, kind: 'bar' }; t.bar = b; refreshTile(t); return b;
}
function removeBarricade(t, broken) {
  const b = t.bar; if (!b) return; scene.remove(b.g); b.hb.dispose(); t.bar = null; if (G.sel === b) select(null);
  if (broken) { debris(b.g.position.x, 1, b.g.position.z, 18, [0xa8703a, 0x6a4422, 0xe0c890], 7); emit(P, b.g.position.x, 1, b.g.position.z, 30, 0xc08a4a, 6, .8, -12, 3); banner('바리케이드 파괴!', '#ffb03a', 900); Snd.play('breakWood', { pos: b.g.position }); }
  computeDist();
}

// ================= 타워 =================
const stoneM = toon(0xe0dacb), stoneD = toon(0x9e98ae), metalM = toon(0x4a4e5e), goldM = toon(0xffcc44, { emissive: 0x3a2200 });
function towerModel(type, lvl) {
  const g = new THREE.Group(), head = new THREE.Group(), muzzle = new THREE.Object3D(), anim = {};
  mk(new RoundedBoxGeometry(1.75, .45, 1.75, 2, .14), stoneD, 0, .22, 0, g);
  for (let k = 0; k < lvl; k++) mk(new THREE.OctahedronGeometry(.11, 0), glow(0xffd23a, 1.4), (k - (lvl - 1) / 2) * .45, .3, .9, g, .015);
  if (type === 'arrow') {
    const h = 1.3 + .45 * lvl, roofC = [0x3a7aff, 0xff4a6a, 0x9a5aff][lvl - 1];
    mk(new THREE.CylinderGeometry(.55, .72, h, 12), stoneM, 0, .45 + h / 2, 0, g); mk(new THREE.CylinderGeometry(.76, .76, .16, 12), stoneD, 0, .45 + h * .33, 0, g);
    const top = .45 + h; mk(new THREE.CylinderGeometry(.98, .82, .28, 12), woodM, 0, top + .14, 0, g);
    for (let k = 0; k < 4; k++) mk(new THREE.CylinderGeometry(.06, .06, 1, 6), woodD, Math.cos(k * 1.57 + .78) * .78, top + .78, Math.sin(k * 1.57 + .78) * .78, g, .02);
    const rh = 1 + .2 * lvl; mk(new THREE.ConeGeometry(1.18, rh, 12), toon(roofC), 0, top + 1.28 + rh / 2, 0, g);
    if (lvl >= 2) { const pole = mk(new THREE.CylinderGeometry(.03, .03, .8, 5), woodD, 0, top + 1.28 + rh + .3, 0, g, .015); anim.flag = mk(new THREE.BoxGeometry(.5, .28, .03), toon(0xffe06a), .25, .25, 0, pole, .015); }
    if (lvl >= 3) { mk(new THREE.TorusGeometry(1.0, .06, 6, 24), goldM, 0, top + .3, 0, g, .015).rotation.x = Math.PI / 2; anim.gem = mk(new THREE.OctahedronGeometry(.25), glow(0x9affff, 2.4), 0, top + 1.28 + rh + .9, 0, g, .02); }
    mk(new THREE.BoxGeometry(.16, .16, .9), woodD, 0, 0, .1, head, .02);
    const bow = mk(new THREE.TorusGeometry(.42, .045, 6, 14, Math.PI), lvl >= 3 ? goldM : woodM, 0, 0, .45, head, .02); bow.rotation.x = Math.PI / 2;
    mk(new THREE.ConeGeometry(.06, .2, 6), metalM, 0, 0, .65, head, 0).rotation.x = Math.PI / 2;
    head.position.y = top + .55; muzzle.position.set(0, 0, .7);
  } else if (type === 'cannon') {
    const h = .9 + .2 * lvl; mk(new THREE.CylinderGeometry(.95, 1.1, h, 14), stoneD, 0, .45 + h / 2, 0, g);
    for (let k = 0; k < 8; k++) mk(new RoundedBoxGeometry(.32, .3, .32, 1, .06), stoneM, Math.cos(k * .785) * .92, .45 + h + .1, Math.sin(k * .785) * .92, g, .02);
    if (lvl >= 2) mk(new THREE.TorusGeometry(1.05, .07, 6, 24), lvl >= 3 ? goldM : metalM, 0, .45 + h * .5, 0, g, .015).rotation.x = Math.PI / 2;
    mk(new THREE.SphereGeometry(.55, 16, 12), metalM, 0, 0, 0, head);
    for (const bx of lvl >= 2 ? [-.24, .24] : [0]) { const b = mk(new THREE.CylinderGeometry(.17 + lvl * .02, .24 + lvl * .02, 1.3, 12), toon(0x30333e), bx, .1, .55, head); b.rotation.x = Math.PI / 2 - .25;
      mk(new THREE.TorusGeometry(.2 + lvl * .02, .05, 6, 12), lvl >= 3 ? goldM : toon(0x5a5e70), bx, .27, 1.15, head, .015).rotation.x = -.25; }
    if (lvl >= 3) mk(new THREE.SphereGeometry(.16, 10, 8), glow(0xff6a2a, 2.5), 0, .45, -.2, head, 0);
    head.position.y = .45 + h + .55; muzzle.position.set(0, .3, 1.2);
  } else {
    const h = 1.5 + .5 * lvl, cc = [0x6af0ff, 0xc07aff, 0xff7ad0][lvl - 1];
    mk(new THREE.CylinderGeometry(.42, .78, h, 6), toon(0x6a4aa8), 0, .45 + h / 2, 0, g);
    mk(new THREE.CylinderGeometry(.62, .5, .3, 6), toon(0x8a6ad0), 0, .45 + h + .15, 0, g);
    for (let k = 0; k < 3; k++) { const s = mk(new THREE.OctahedronGeometry(.18), glow(cc, 1.2), Math.cos(k * 2.09) * .62, .45 + h + .3, Math.sin(k * 2.09) * .62, g, .015); s.scale.y = 1.8; }
    const crys = mk(new THREE.OctahedronGeometry(.42 + lvl * .08, 0), glow(cc, 2.2), 0, 0, 0, head, .025); crys.scale.y = 1.5; anim.crys = crys;
    anim.rings = []; for (let k = 0; k < lvl; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.8 + k * .22, .035, 6, 32), glow(k % 2 ? 0xffe06a : cc, 1.8)); ring.rotation.x = Math.PI / 2 + k * .6; head.add(ring); anim.rings.push(ring); }
    head.position.y = .45 + h + 1.2; anim.baseY = head.position.y;
  }
  head.add(muzzle); g.add(head); return { g, head, muzzle, anim };
}
function placeTower(t, type) {
  const D = TOWERS[type], tw = { kind: 'tower', type, lvl: 1, t, c: t.c, r: t.r, cd: .5, invest: D.cost, pop: 0, recoil: 0 };
  tw.m = towerModel(type, 1); tw.m.g.position.set(tileX(t.c), 0, tileZ(t.r)); Snd.play('build', { pos: tw.m.g.position }); Snd.play('place', { delay: .12 }); scene.add(tw.m.g); t.tower = tw; G.towers.push(tw); refreshTile(t); return tw;
}
function upgradeTower(tw) {
  if (tw.lvl >= 3) return; const c = TOWERS[tw.type].up[tw.lvl - 1]; if (G.gold < c) return Snd.play('error'); G.gold -= c; tw.invest += c; tw.lvl++; Snd.play('upgrade', { pos: { x: tileX(tw.c), z: tileZ(tw.r) } }); Snd.play('levelUp', { vol: .7 });
  const ry = tw.m.head.rotation.y; scene.remove(tw.m.g); tw.m = towerModel(tw.type, tw.lvl); tw.m.head.rotation.y = ry; tw.m.g.position.set(tileX(tw.c), 0, tileZ(tw.r)); scene.add(tw.m.g); tw.pop = 0;
  const p = tw.m.g.position; emit(P, p.x, 1, p.z, 50, 0xffe066, 6, .9, -4, 2); emit(PB, p.x, 2, p.z, 10, 0xffd23a, 3, .8, 2, 1); ringFx(p, 2.5, 0xffd23a, .6); banner(`${TOWERS[tw.type].n} Lv.${tw.lvl}!`, '#ffe066', 900); refreshHud();
}
function sellTower(tw) {
  const v = Math.floor(tw.invest * .7); G.gold += v; Snd.play('sell'); Snd.play('breakWood', { pos: { x: tileX(tw.c), z: tileZ(tw.r) }, vol: .5 }); scene.remove(tw.m.g); G.towers.splice(G.towers.indexOf(tw), 1); tw.t.tower = null; refreshTile(tw.t);
  const p = tw.m.g.position; debris(p.x, 1, p.z, 14, [0xe0dacb, 0x9e98ae, 0xa8703a], 6); popCoins(p.clone().setY(1.5), 4); dmgText(p.clone().setY(2.5), `+${v}G`, '#ffe066', true); select(null); computeDist(); refreshHud();
}
function enemyAim(e) { return e.g.position.clone().setY(e.E.fly ? e.m.inner.position.y : e.E.h * .55 + e.g.position.y); }
function updTowers(dt) {
  for (const tw of G.towers) {
    const D = TOWERS[tw.type], L = tw.lvl - 1, m = tw.m, p = m.g.position; tw.cd -= dt; tw.pop = Math.min(1, tw.pop + dt * 3);
    const s = tw.pop < 1 ? 1 + Math.sin(tw.pop * Math.PI) * .25 : 1; m.g.scale.set(s, tw.pop < 1 ? .4 + tw.pop * .6 : 1, s);
    if (m.anim.crys) { m.head.position.y = m.anim.baseY + Math.sin(G.t * 2.4 + tw.c) * .15; m.anim.crys.rotation.y += dt * 1.6; m.anim.rings.forEach((r, k) => { r.rotation.z += dt * (1.2 + k * .7) * (k % 2 ? -1 : 1); }); }
    if (m.anim.flag) m.anim.flag.rotation.y = Math.sin(G.t * 5 + tw.c) * .4; if (m.anim.gem) m.anim.gem.rotation.y += dt * 2;
    tw.recoil = Math.max(0, tw.recoil - dt * 4);
    const rng = D.range[L]; let best = null, bd = Infinity;
    for (const e of G.enemies) { if (e.dead || (e.E.fly && !D.air)) continue; const dx = e.g.position.x - p.x, dz = e.g.position.z - p.z; if (dx * dx + dz * dz > rng * rng) continue;
      const prog = e.E.fly ? Math.hypot(core.position.x - e.g.position.x, core.position.z - e.g.position.z) : dAt(e.tile[0], e.tile[1]); if (prog < bd) { bd = prog; best = e; } }
    if (!best) continue;
    const want = Math.atan2(best.g.position.x - p.x, best.g.position.z - p.z); let d = want - m.head.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); m.head.rotation.y += d * Math.min(1, dt * 10);
    if (tw.type === 'cannon') { const k = tw.recoil * .25; m.head.position.x = -Math.sin(m.head.rotation.y) * k; m.head.position.z = -Math.cos(m.head.rotation.y) * k; }
    if (tw.cd > 0) continue; tw.cd = 1 / D.rate[L]; const from = new THREE.Vector3(); m.muzzle.getWorldPosition(from);
    if (tw.type === 'arrow') { shoot('arrow', from, best, D.dmg[L], { spd: 34, color: L >= 2 ? 0x9affff : 0xfff0c0 }); Snd.play('arrow', { pos: from, rate: 1.15 }); }
    else if (tw.type === 'cannon') { const dest = best.g.position.clone(); if (best.next) { const v = new THREE.Vector3(tileX(best.next[0]) - dest.x, 0, tileZ(best.next[1]) - dest.z); if (v.length() > .01) dest.addScaledVector(v.normalize(), Math.min(1.5, best.E.spd * .6)); }
      const ball = mk(new THREE.SphereGeometry(.22 + L * .04, 12, 8), toon(0x26282e), from.x, from.y, from.z, scene, .02); G.projs.push({ kind: 'ball', m: ball, from: from.clone(), dest, t: 0, dur: .7, dmg: D.dmg[L], r: D.splash[L] });
      tw.recoil = 1; emit(P, from.x, from.y, from.z, 14, 0xffaa4a, 4, .35, 0, .5); emit(P, from.x, from.y, from.z, 8, 0x8a8a8a, 2, .8, 1.5, .5); Snd.play('cannon', { pos: from }); }
    else chainLightning(from, best, D.dmg[L], D.chain[L], D.slow[L]);
  }
}
function chainLightning(from, first, dmg, n, slow) {
  const hit = new Set(); let cur = first, a = from.clone();
  for (let k = 0; k < n && cur; k++) { const b = enemyAim(cur); bolt(a, b, k ? 0xc0a0ff : 0x9ae8ff); const ce = cur; hit.add(ce); ce.slowT = 1.3; ce.slowAmt = slow; hurt(ce, dmg * Math.pow(.85, k), '#c8b8ff'); emit(P, b.x, b.y, b.z, 8, 0xb8a0ff, 4, .35, 0, .5);
    a = b; let nb = null, nd = 3.8 * 3.8; for (const e of G.enemies) { if (e.dead || hit.has(e)) continue; const d = e.g.position.distanceToSquared(ce.g.position); if (d < nd) { nd = d; nb = e; } } cur = nb; }
  Snd.crackle(first.g.position);
}
function bolt(a, b, color) {
  for (let w = 0; w < 2; w++) { const pts = [], n = 9; for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); if (i > 0 && i < n) p.add(new THREE.Vector3(rnd(-.4, .4), rnd(-.4, .4), rnd(-.4, .4))); pts.push(p); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: w ? 0xffffff : color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); scene.add(l); G.fxs.push({ m: l, t: 0, dur: .2, kind: 'fade' }); }
}

// ================= 영웅 =================
let hero = null;
const stat = {
  dmg: () => hero.C.dmg * (1 + .15 * G.ups.atk), rate: () => hero.C.rate * (1 + .1 * G.ups.spd), range: () => hero.C.range * (1 + .08 * G.ups.rng),
  skillMul: () => 1 + .25 * G.ups.skill, skillCd: () => hero.C.cd * Math.pow(.92, G.ups.skill),
};
function spawnHero(cls) {
  const C = CLASSES[cls], ch = makeHeroModel(cls); ch.g.position.set(tileX(CORE[0] - 1), 0, tileZ(CORE[1])); ch.g.rotation.y = -Math.PI / 2; scene.add(ch.g);
  hero = G.hero = { cls, C, ch, g: ch.g, hp: C.hp, max: C.hp, cd: 0, skillCd: 0, atkT: 0, path: [], dead: 0, spinT: 0, flash: 0, face: -Math.PI / 2 };
  hero.hb = hpBar(ch.g, 3.1, 1.6, 0x55ff77); play(ch, 'Idle');
  $('heroName').textContent = `${C.n} · 스킬 [Q] ${C.skill}`; $('skillName').textContent = C.skill;
}
function heroDamage(d) {
  if (hero.dead > 0) return; d *= 1 - hero.C.armor; hero.hp -= d; hero.flash = .1; Snd.play('heroHurt', { pos: hero.g.position, vol: .8 });
  if (hero.hp <= 0) { hero.hp = 0; hero.dead = 5; hero.spinT = 0; if (hero.swirl) hero.swirl.visible = false; hero.path = []; play(hero.ch, 'Death_A', { once: true }); hero.hb.show(false); emit(P, hero.g.position.x, 1.5, hero.g.position.z, 50, 0xff4a5a, 6, .9); banner('영웅 쓰러짐! 5초 후 부활', '#ff8a9a', 1500); }
}
const heroPass = (c, r) => { if (!inGrid(c, r)) return false; const t = tileAt(c, r); return (t.t === T.GRASS || t.t === T.CARVED || t.t === T.SPAWN || t.t === T.CORE) && !t.tower && !t.bar; };
function passAt(x, z) { for (const [ox, oz] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) { const [c, r] = toTile(x + ox, z + oz); if (!heroPass(c, r)) return false; } return true; }
function astar(s, g) {
  const key = (c, r) => c * GH + r, gs = new Map([[key(s[0], s[1]), 0]]), from = new Map(), h = new Heap(), H = (c, r) => Math.abs(c - g[0]) + Math.abs(r - g[1]);
  h.push([H(s[0], s[1]), s[0], s[1]]);
  while (h.size) { const [, c, r] = h.pop(); if (c === g[0] && r === g[1]) { const path = []; let k = key(c, r); while (from.has(k)) { path.unshift([k / GH | 0, k % GH]); k = from.get(k); } return path; }
    const gc = gs.get(key(c, r)); for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (!heroPass(nc, nr)) continue; const nk = key(nc, nr), ng = gc + 1; if (ng < (gs.get(nk) ?? Infinity)) { gs.set(nk, ng); from.set(nk, key(c, r)); h.push([ng + H(nc, nr), nc, nr]); } } }
  return null;
}
function heroGoTo(p) {
  const s = toTile(hero.g.position.x, hero.g.position.z); const [gc, gr] = toTile(p.x, p.z); let exact = heroPass(gc, gr);
  let path = exact ? astar(s, [gc, gr]) : null;
  if (!path) { // 도달 불가 → 도달 가능한 가장 가까운 칸
    const seen = new Set([s[0] * GH + s[1]]), q = [s]; let best = s, bd = Infinity;
    while (q.length) { const [c, r] = q.shift(); const d = Math.hypot(tileX(c) - p.x, tileZ(r) - p.z); if (d < bd) { bd = d; best = [c, r]; }
      for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr, k = nc * GH + nr; if (heroPass(nc, nr) && !seen.has(k)) { seen.add(k); q.push([nc, nr]); } } }
    path = astar(s, best) || []; exact = false;
  }
  hero.path = path.map(([c, r]) => new THREE.Vector3(tileX(c), 0, tileZ(r))); if (exact) { hero.path.pop(); hero.path.push(new THREE.Vector3(p.x, 0, p.z)); }
}
function groundY(x, z) { const [c, r] = toTile(x, z); return inGrid(c, r) && tileAt(c, r).t === T.CARVED ? -.46 : 0; }
function enemyWalk(x, z) { const [c, r] = toTile(x, z); if (!inGrid(c, r)) return false; const t = tileAt(c, r); return !isBlock(t.t) && t.t !== T.BEDROCK && !t.tower && !t.bar; }
function separate(dt) {
  const L = G.enemies.filter(e => !e.dead && !e.E.fly && e.state !== 'spawn');
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i].g.position, b = L[j].g.position, dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, m = (L[i].E.h + L[j].E.h) * .2;
    if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = Math.min(.5, (m - d) * .5) * Math.min(1, dt * 8), ux = dx / d * k, uz = dz / d * k;
      if (enemyWalk(a.x - ux, a.z - uz)) { a.x -= ux; a.z -= uz; } if (enemyWalk(b.x + ux, b.z + uz)) { b.x += ux; b.z += uz; } } }
}

// ================= 적 =================
function spawnEnemy(type, hpMul) {
  const E = ETYPES[type], m = makeEnemyModel(type), hp = E.hp * hpMul; scene.add(m.g);
  m.g.position.set(tileX(SPAWN[0]) + .4, 0, tileZ(SPAWN[1]) + rnd(-.5, .5)); m.g.rotation.y = Math.PI / 2;
  const e = { type, E, m, g: m.g, hp, max: hp, tile: SPAWN.slice(), next: null, off: [rnd(-.45, .45), rnd(-.45, .45)], slowT: 0, slowAmt: 0, flash: 0, atkCd: rnd(0, .5), hitT: rnd(0, .3), state: 'walk', spawnT: 0, dead: false, bob: rand() * 6 };
  if (!E.fly) { const a = play(m, 'Spawn_Ground_Skeletons', { once: true, speed: 2, fade: 0 }); e.state = 'spawn'; e.spawnT = a ? Math.min(1.4, a.getClip().duration / 2) : 0; emit(P, m.g.position.x, .3, m.g.position.z, 12, 0x9a7a5a, 3, .6, -6, 1.5); }
  e.hb = hpBar(m.g, E.fly ? 4 : E.h + .35, E.boss ? 3 : Math.max(1.1, E.h * .55), E.boss ? 0xff3a4a : 0x55ff77, { auto: !E.boss, h: E.boss ? .22 : .15 });
  if (E.boss) { G.shake = .7; Snd.roar(m.g.position); banner('⚠ 보스 출현: 해골 군주 ⚠', '#ff4a5a', 2200); emit(PB, m.g.position.x, 2, m.g.position.z, 40, 0xff3a3a, 8, 1, -2, 2); }
  emit(P, m.g.position.x, 1.5, m.g.position.z, 14, 0xc07aff, 4, .5); G.enemies.push(e); return e;
}
function hurt(e, dmg, color = '#fff', big = false) {
  if (e.dead) return; Snd.play(e.E.armor ? 'hitArmor' : 'hit', { pos: e.g.position }); dmg *= 1 - (e.E.armor || 0); e.hp -= dmg; e.flash = .09; const p = enemyAim(e); p.y += e.E.fly ? .8 : e.E.h * .55; dmgText(p, dmg, color, big);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; e.hb.show(false); const p = enemyAim(e);
  emit(P, p.x, p.y, p.z, e.E.boss ? 160 : 22, e.E.fly ? 0xb08aff : 0xe8e0d0, e.E.boss ? 10 : 5, .8, -10, 1.5); emit(P, p.x, p.y, p.z, 10, 0xffe066, 4, .6);
  if (!e.E.fly) debris(p.x, p.y, p.z, e.E.boss ? 30 : 5, [0xf0ead8, 0xd8d0c0], 5);
  if (e.E.boss) { G.shake = 1.1; emit(PB, p.x, p.y, p.z, 60, 0xff8a3a, 12, 1.2, -3, 3); banner('해골 군주 처치!', '#ffd23a'); Snd.play('boom', { pos: p, force: true }); later(.6, () => Snd.play('victory', { force: true, exact: true })); }
  G.gold += e.E.gold; G.stats.goldEarned += e.E.gold; G.stats.kills[e.type] = (G.stats.kills[e.type] || 0) + 1; popCoins(p, Math.ceil(e.E.gold / 2)); Snd.play(e.E.fly ? 'poof' : 'bones', { pos: p, rate: e.E.boss ? .6 : 1, force: e.E.boss }); e.dying = e.E.fly ? .7 : 1.6;
  if (!e.E.fly) play(e.m, 'Death_A', { once: true, fade: .1 });
}
function damageTile(t, dmg) {
  if (t.bar) { t.bar.hp -= dmg; t.bar.hb.set(Math.max(0, t.bar.hp / t.bar.max)); t.bar.g.position.x = tileX(t.c) + rnd(-.07, .07); G.distDirty = true; if (t.bar.hp <= 0) removeBarricade(t, true); return; }
  if (!isBlock(t.t)) return; t.hp -= dmg; t.shk = .12; G.dirty.add(t); G.distDirty = true; if (t.hp <= 0) carve(t);
}
function carve(t) {
  const B = BLK[t.t], x = tileX(t.c), z = tileZ(t.r); debris(x, .8, z, t.t === T.ROCK ? 26 : 18, B.deb, 7.5); emit(P, x, .8, z, 30, t.t === T.ROCK ? 0x9a9aaa : 0x9a7048, 4, .9, -3, 2.5);
  if (t.t === T.FOREST) emit(P, x, 2.4, z, 30, 0x6ad05a, 4, 1, -3, 2);
  if (t.t === T.ROCK) G.shake = Math.max(G.shake, .22); Snd.play(t.t === T.ROCK ? 'breakRock' : t.t === T.FOREST ? 'breakWood' : 'breakDirt', { pos: { x, z }, force: true });
  t.t = T.CARVED; t.hp = t.max = 0; t.shk = 0; G.dirty.add(t); G.carved = (G.carved || 0) + 1; computeDist();
}
function reachCore(e) {
  G.coreHp -= e.E.core; G.stats.leaked++; e.dead = true; removeEnemy(e); G.shake = Math.max(G.shake, .35);
  emit(P, core.position.x, 3, core.position.z, 30, 0xff3a5a, 6, .7); crystalMat.emissive.setHex(0xff2a3a); later(.22, () => crystalMat.emissive.setHex(0x1890c0)); Snd.play('coreHit', { force: true }); Snd.play('glass', { vol: .6 });
  banner(`코어 피격! -${e.E.core}`, '#ff6a7a', 700); if (G.coreHp <= 0) gameOver();
}
function removeEnemy(e) { scene.remove(e.g); e.hb.dispose(); if (e.m.mats) e.m.mats.forEach(m => m.dispose()); if (e.m.mixer) e.m.mixer.stopAllAction(); const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); }
function faceTo(g, x, z, dt, k = 10) { let d = Math.atan2(x - g.position.x, z - g.position.z) - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * k); }
function updEnemies(dt) {
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i], E = e.E, g = e.g; if (e.m.mixer) e.m.mixer.update(dt);
    if (e.dying !== undefined) { e.dying -= dt; if (E.fly) { e.m.inner.position.y = Math.max(.3, e.m.inner.position.y - dt * 7); e.m.inner.rotation.z += dt * 8; } else if (e.dying < .5) g.position.y -= dt * 2.5; if (e.dying <= 0) removeEnemy(e); continue; }
    if (e.flash > 0) { e.flash -= dt; flashMats(e.m.mats, true); } else if (e.slowT > 0) flashMats(e.m.mats, true, 0x2a3aaa); else flashMats(e.m.mats, false);
    e.hb.set(Math.max(0, e.hp / e.max)); if (e.state === 'spawn') { e.spawnT -= dt; if (e.spawnT <= 0) e.state = 'walk'; continue; }
    const slowK = e.slowT > 0 ? 1 - (e.slowAmt || .45) : 1, spd = E.spd * slowK; e.slowT -= dt;
    if (E.fly) {
      const tx = core.position.x, tz = core.position.z, dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
      if (d < 1) { reachCore(e); continue; } g.position.x += dx / d * spd * dt; g.position.z += dz / d * spd * dt; faceTo(g, tx, tz, dt);
      e.bob += dt; const f = Math.sin(G.t * 16 + e.bob); e.m.wings[0].rotation.y = f * .8; e.m.wings[1].rotation.y = -f * .8; e.m.inner.position.y = 3 + Math.sin(G.t * 3 + e.bob) * .35; e.m.inner.rotation.x = .15;
      const [tc, tr] = toTile(g.position.x, g.position.z); if (inGrid(tc, tr)) e.tile = [tc, tr]; continue;
    }
    // 영웅과 근접 전투
    const hd = hero && hero.dead <= 0 ? Math.hypot(hero.g.position.x - g.position.x, hero.g.position.z - g.position.z) : 99;
    if (hd < 1.25 + E.h * .2) { faceTo(g, hero.g.position.x, hero.g.position.z, dt, 14); play(e.m, E.dig, { speed: 1.2 }); e.atkCd -= dt; if (e.atkCd <= 0) { e.atkCd = .85; heroDamage(E.dps * .85); } continue; }
    if (e.next && enterCost(tileAt(e.next[0], e.next[1])) === Infinity) e.next = null;
    if (!e.next) e.next = nextStep(e.tile[0], e.tile[1]);
    if (!e.next) { reachCore(e); continue; }
    const nt = tileAt(e.next[0], e.next[1]), cx = tileX(e.tile[0]), cz = tileZ(e.tile[1]);
    if (isBlock(nt.t) || nt.bar) { // 지형/바리케이드 부수기
      const dx = e.next[0] - e.tile[0], dz = e.next[1] - e.tile[1], sx = -dz, sz = dx;
      const tx = cx + dx * .55 + sx * e.off[0] * 1.2, tz = cz + dz * .55 + sz * e.off[0] * 1.2;
      const ddx = tx - g.position.x, ddz = tz - g.position.z, d = Math.hypot(ddx, ddz);
      if (d > .75) { const mv = Math.min(d, spd * dt); g.position.x += ddx / d * mv; g.position.z += ddz / d * mv; faceTo(g, tx, tz, dt); play(e.m, E.walk, { speed: spd * E.ws }); }
      else { if (d > .05) { const mv = Math.min(d, spd * dt * .5); g.position.x += ddx / d * mv; g.position.z += ddz / d * mv; } faceTo(g, tileX(nt.c), tileZ(nt.r), dt, 12); play(e.m, E.dig, { speed: 1.15 * slowK + .1 }); e.digging = true;
        damageTile(nt, E.dps * dt); e.hitT -= dt;
        if (e.hitT <= 0) { e.hitT = .55; const hx = (g.position.x + tileX(nt.c)) / 2, hz = (g.position.z + tileZ(nt.r)) / 2;
          if (nt.bar || isBlock(nt.t)) { const cols = nt.bar ? [0xa8703a, 0x6a4422] : BLK[nt.t].deb; debris(hx, .9, hz, E.boss ? 5 : 2, cols, 4); emit(P, hx, .9, hz, 6, nt.t === T.ROCK ? 0xffffff : 0xc8a070, 3, .4, -6, .6); Snd.play(nt.bar || nt.t === T.FOREST ? 'digWood' : nt.t === T.ROCK ? 'dig' : 'digSoft', { pos: g.position, rate: E.boss ? .7 : 1 }); }
          if (E.boss) G.shake = Math.max(G.shake, .15); } }
    } else {
      e.digging = false;
      const tx = tileX(e.next[0]) + e.off[0], tz = tileZ(e.next[1]) + e.off[1], dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
      if (d < spd * dt + .03) { g.position.x = tx; g.position.z = tz; e.tile = e.next; e.next = null; if (e.tile[0] === CORE[0] && e.tile[1] === CORE[1]) { reachCore(e); continue; } }
      else { g.position.x += dx / d * spd * dt; g.position.z += dz / d * spd * dt; faceTo(g, tx, tz, dt); }
      play(e.m, E.walk, { speed: spd * E.ws });
      if (E.boss && Math.sin(G.t * 4.5) * Math.sin((G.t - dt) * 4.5) < 0) { G.shake = Math.max(G.shake, .16); Snd.play('stomp', { pos: g.position, rate: .55, force: true }); emit(P, g.position.x, .2, g.position.z, 6, 0x8a7a6a, 3, .4); }
    }
    g.position.y += (groundY(g.position.x, g.position.z) - g.position.y) * Math.min(1, dt * 8);
  }
}
function gameOver() { if (G.phase === 'over') return; G.phase = 'over'; Snd.setMusic('none'); Snd.play('gameOver', { force: true, exact: true }); Snd.play('breakRock', { force: true }); Snd.play('glass', { force: true }); $('over').classList.remove('hidden'); $('overTxt').textContent = `웨이브 ${G.wave}에서 코어가 파괴되었습니다 · 최고 기록 ${Math.max(G.wave, +localStorage.getItem('hd3d_best') || 0)}`; }

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
      if (p.kind === 'arrow') { hurt(p.target, p.dmg, '#ffffff'); emit(P, tp.x, tp.y, tp.z, 5, p.color || 0xd0ffd0, 3, .3); }
      else { aoe(tp, p.aoe, p.dmg, '#d0a0ff', { slow: true }); emit(P, tp.x, tp.y, tp.z, 18, 0xb07aff, 5, .5, -4, 1.5); ringFx(tp, p.aoe, 0xb07aff, .3); }
      continue; }
    m.position.addScaledVector(d.normalize(), mv); m.lookAt(tp);
    emit(P, m.position.x, m.position.y, m.position.z, 1, p.kind === 'arrow' ? (p.color || 0x9affb0) : 0xb07aff, .3, .25, 0, 0);
  }
}

// ================= 스킬 =================
function castSkill() {
  if (!hero || hero.dead > 0 || hero.skillCd > 0 || G.phase === 'select' || G.phase === 'over') return;
  const mul = stat.skillMul(), base = stat.dmg(); hero.skillCd = stat.skillCd();
  const tgt = mouseGround.clone(); const hp = hero.g.position; if (hp.distanceTo(tgt) > 16) tgt.sub(hp).setLength(16).add(hp);
  if (hero.cls !== 'warrior') hero.face = Math.atan2(tgt.x - hp.x, tgt.z - hp.z);
  if (hero.cls === 'archer') {
    ringFx(tgt, 4.2, 0x6aff8a, 1.4); banner('화살비!', '#8aff9a', 900); play(hero.ch, '2H_Ranged_Shoot', { once: true, force: true, speed: 1.2 }); hero.atkT = .6;
    for (let i = 0; i < 36; i++) later(i * .038, () => { const a = rand() * 6.28, rr = Math.sqrt(rand()) * 4, p = new THREE.Vector3(tgt.x + Math.cos(a) * rr, 18, tgt.z + Math.sin(a) * rr);
      const m = makeArrow(0x9affb0); m.position.copy(p); m.rotation.x = Math.PI / 2; scene.add(m); G.projs.push({ kind: 'rain', m, dest: p.clone().setY(0), dmg: base * 1.3 * mul, spd: 40 }); });
  } else if (hero.cls === 'mage') {
    ringFx(tgt, 4.8, 0xff6a2a, .9); banner('메테오!', '#ffaa5a', 900); play(hero.ch, 'Spellcast_Long', { once: true, force: true, speed: 1.4 }); hero.atkT = 1;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), glow(0xff6a1a, 5)); m.position.set(tgt.x - 8, 26, tgt.z - 4); scene.add(m);
    G.projs.push({ kind: 'meteor', m, dest: tgt.clone(), dmg: base * 16 * mul, spd: 30 });
  } else {
    hero.spinT = 2.5; banner('회오리 베기!', '#ffaa7a', 900); play(hero.ch, '2H_Melee_Attack_Spinning', { speed: 1.3 });
    if (!hero.swirl) { hero.swirl = new THREE.Mesh(new THREE.TorusGeometry(2.8, .25, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); hero.swirl.rotation.x = Math.PI / 2; hero.swirl.position.y = 1.2; hero.g.add(hero.swirl); }
    hero.swirl.visible = true; hero.spinTick = 0;
  }
  if (hero.cls === 'archer') { Snd.play('draw', { pos: hp }); Snd.whoosh(tgt, .9, 300, 3000, .35); for (let k = 1; k < 7; k++) Snd.play('arrow', { pos: tgt, delay: k * .12, force: true, vol: .7 }); }
  else if (hero.cls === 'mage') { Snd.play('meteorCast', { pos: hp, rate: .8 }); Snd.whoosh(tgt, 1.1, 150, 900, .5); }
  else { Snd.whoosh(hp, .5, 400, 1600, .5); for (let k = 0; k < 4; k++) Snd.play('sword', { pos: hp, delay: k * .3, force: true, rate: 1.1 }); }
}

// ================= 웨이브 =================
function startWave() {
  if (G.phase !== 'build') return; G.wave++; G.phase = 'wave'; G.nightTarget = 1; select(null);
  const n = G.wave, boss = n % 5 === 0, hpMul = Math.pow(1.16, n - 1), q = [], count = 8 + n * 3;
  for (let i = 0; i < count; i++) { let t = 'grunt'; const r = rand(); if (r < .32) t = 'imp'; else if (n >= 3 && r > .86) t = 'golem'; else if (n >= 4 && r > .73 && r <= .86) t = 'bat'; q.push(t); }
  if (boss) q.splice(Math.floor(count / 2), 0, 'boss');
  G.spawnQ = q; G.spawnT = 1; G.hpMul = hpMul; Snd.horn(); Snd.duck(.4, 2.2); banner(boss ? `웨이브 ${n} · 보스 웨이브!` : `웨이브 ${n}`, boss ? '#ff5a6a' : '#ffffff'); setPhaseUI();
}
function endWave() {
  G.phase = 'build'; G.nightTarget = 0; const bonus = 25 + G.wave * 6; G.gold += bonus; G.stats.goldEarned += bonus; Snd.play('waveClear', { force: true, exact: true }); Snd.play('coins', { delay: .3 }); Snd.duck(.4, 1.6); banner(`웨이브 ${G.wave} 클리어! +${bonus}G`, '#ffe066');
  if (hero && hero.dead <= 0) { hero.hp = hero.max; play(hero.ch, 'Cheer', { once: true }); hero.atkT = 1.5; } computeDist(); setPhaseUI();
  try { localStorage.setItem('hd3d_best', Math.max(G.wave, +localStorage.getItem('hd3d_best') || 0)); } catch (e) {}
}
function setPhaseUI() { const ph = $('phase'); ph.textContent = G.phase === 'wave' ? '전투 중 (밤)' : '건설 단계 (낮)'; ph.classList.toggle('night', G.phase === 'wave'); $('startWave').disabled = G.phase !== 'build'; }

// ================= 입력 / 건설 =================
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), mouseGround = new THREE.Vector3();
const hover = new THREE.Mesh(new THREE.BoxGeometry(S * .98, 3, S * .98), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: .2, depthWrite: false })); hover.visible = false; scene.add(hover);
const rangeRing = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 72), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); rangeRing.rotation.x = -Math.PI / 2; rangeRing.visible = false; scene.add(rangeRing);
const rangeFill = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: .1, depthWrite: false, side: THREE.DoubleSide })); rangeRing.add(rangeFill);
const moveMark = new THREE.Mesh(new THREE.RingGeometry(.4, .55, 24), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, toneMapped: false })); moveMark.rotation.x = -Math.PI / 2; moveMark.visible = false; scene.add(moveMark);
let rdrag = null; const keys = {};
const cvs = renderer.domElement; cvs.addEventListener('contextmenu', e => e.preventDefault());
function showRange(x, z, r, color = 0x9ae8ff) { rangeRing.visible = true; rangeRing.position.set(x, .25, z); rangeRing.scale.setScalar(r); rangeRing.material.color.set(color); rangeFill.material.color.set(color); }
function tileInfo(t) {
  if (t.tower) return `<b>${TOWERS[t.tower.type].n} Lv.${t.tower.lvl}</b> · 클릭하여 강화/판매`;
  if (t.bar) return `<b>바리케이드</b> ${Math.ceil(t.bar.hp)}/${Math.ceil(t.bar.max)}`;
  if (isBlock(t.t)) return `<b>${BLK[t.t].n}</b> 내구도 ${Math.ceil(t.hp)}/${t.max} · 개간 ${BLK[t.t].clear}G`;
  return `<b>${TNAME[t.t]}</b>${t.t === T.GRASS ? ' · 타워 건설 가능' : t.t === T.CARVED ? ' · 바리케이드 설치 가능' : t.t === T.BEDROCK ? ' · 파괴 불가' : ''}`;
}
function onMove(cx, cy) {
  mouse.set(cx / innerWidth * 2 - 1, -cy / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera); ray.ray.intersectPlane(groundPlane, mouseGround);
  const [c, r] = toTile(mouseGround.x, mouseGround.z), ok = inGrid(c, r) && G.phase !== 'select' && G.phase !== 'loading', tip = $('tip');
  hover.visible = ok && G.tool !== 'move'; rangeRing.visible = false;
  if (ok) { const t = tileAt(c, r); tip.classList.remove('hidden'); tip.style.left = cx + 'px'; tip.style.top = cy + 'px'; tip.innerHTML = tileInfo(t);
    if (hover.visible) { hover.position.set(tileX(c), 1.2, tileZ(r)); hover.material.color.set(canBuild(c, r) ? 0x66ff88 : 0xff4a4a); if (TOWERS[G.tool]) showRange(tileX(c), tileZ(r), TOWERS[G.tool].range[0]); }
    else if (t.tower) showRange(tileX(c), tileZ(r), TOWERS[t.tower.type].range[t.tower.lvl - 1]); }
  else tip.classList.add('hidden');
  if (G.sel && G.sel.kind === 'tower' && !rangeRing.visible) showRange(tileX(G.sel.c), tileZ(G.sel.r), TOWERS[G.sel.type].range[G.sel.lvl - 1], 0xffe066);
}
cvs.addEventListener('pointermove', e => {
  if (rdrag) { cam.theta -= (e.clientX - rdrag.x) * .008; cam.phi = Math.min(1.25, Math.max(.45, cam.phi - (e.clientY - rdrag.y) * .005)); rdrag = { x: e.clientX, y: e.clientY }; }
  onMove(e.clientX, e.clientY);
});
cvs.addEventListener('pointerleave', () => $('tip').classList.add('hidden'));
cvs.addEventListener('pointerdown', e => {
  SFX.init(); if (e.button === 2) { rdrag = { x: e.clientX, y: e.clientY }; return; } if (e.button !== 0 || !hero || G.phase === 'select' || G.phase === 'over') return;
  onMove(e.clientX, e.clientY); const [c, r] = toTile(mouseGround.x, mouseGround.z);
  if (G.tool === 'move' || !inGrid(c, r)) {
    if (inGrid(c, r)) { const t = tileAt(c, r); if (t.tower) return select(t.tower); if (t.bar) return select(t.bar); } select(null);
    if (hero.dead > 0) return; heroGoTo(mouseGround); moveMark.position.set(mouseGround.x, groundY(mouseGround.x, mouseGround.z) + .1, mouseGround.z); moveMark.visible = true; moveMark.scale.setScalar(1.5); return;
  }
  build(c, r);
});
addEventListener('pointerup', () => rdrag = null);
cvs.addEventListener('wheel', e => { cam.r = Math.min(90, Math.max(14, cam.r + e.deltaY * .03)); }, { passive: true });
addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys[k] = true; if (k === 'q') castSkill(); const tools = ['arrow', 'cannon', 'magic', 'barricade', 'clear']; if (e.key >= '1' && e.key <= '5') setTool(tools[+e.key - 1]); if (e.key === 'Escape') { setTool('move'); select(null); } if (e.key === ' ' && G.phase === 'build') { e.preventDefault(); startWave(); } });
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
$('rotL').onclick = () => { cam.theta += Math.PI / 4; Snd.play('ui'); }; $('rotR').onclick = () => { cam.theta -= Math.PI / 4; Snd.play('ui'); };
function occupied(c, r) {
  if (G.enemies.some(e => !e.dead && !e.E.fly && ((e.tile[0] === c && e.tile[1] === r) || (e.next && e.next[0] === c && e.next[1] === r)))) return true;
  if (hero && hero.dead <= 0) { const [hc, hr] = toTile(hero.g.position.x, hero.g.position.z); if (hc === c && hr === r) return true; } return false;
}
function canBuild(c, r) {
  if (!inGrid(c, r)) return false; const t = tileAt(c, r), tool = G.tool;
  if (TOWERS[tool]) { if (t.t !== T.GRASS || t.tower || t.bar || G.gold < TOWERS[tool].cost || occupied(c, r)) return false; return isFinite(dijkstra(t)[SPAWN[0] * GH + SPAWN[1]]); }
  if (tool === 'barricade') return (t.t === T.CARVED || t.t === T.GRASS) && !t.tower && !t.bar && G.gold >= 30 && !occupied(c, r);
  if (tool === 'clear') return isBlock(t.t) && G.gold >= BLK[t.t].clear;
  return false;
}
function build(c, r) {
  if (!canBuild(c, r)) { Snd.play('error'); if (inGrid(c, r) && TOWERS[G.tool] && tileAt(c, r).t === T.GRASS && G.gold >= TOWERS[G.tool].cost && !occupied(c, r)) banner('길을 완전히 막을 수 없습니다', '#ff8a9a', 900); return false; }
  const t = tileAt(c, r), p = new THREE.Vector3(tileX(c), .5, tileZ(r));
  if (TOWERS[G.tool]) { G.gold -= TOWERS[G.tool].cost; placeTower(t, G.tool); emit(P, p.x, .5, p.z, 30, 0xffe066, 5, .6, -6, 2); debris(p.x, .3, p.z, 8, [0xe0dacb, 0x9e98ae], 4); ringFx(p, 2, 0xffe066, .4); }
  else if (G.tool === 'barricade') { G.gold -= 30; addBarricade(t); emit(P, p.x, .6, p.z, 16, 0xffb03a, 4, .5); }
  else if (G.tool === 'clear') { const B = BLK[t.t]; G.gold -= B.clear; debris(p.x, .8, p.z, 16, B.deb, 6); emit(P, p.x, .8, p.z, 24, 0x8ad05a, 4, .7); t.t = T.GRASS; t.hp = t.max = 0; refreshTile(t); }
  if (!TOWERS[G.tool]) Snd.play(G.tool === 'barricade' ? 'build' : 'breakDirt', { pos: { x: tileX(c), z: tileZ(r) }, force: true }); computeDist(); refreshHud(); return true;
}
function setTool(t) { if (G.tool !== t) Snd.play('ui'); G.tool = t; document.querySelectorAll('.tool').forEach(b => b.classList.toggle('sel', b.dataset.tool === t)); if (t !== 'move') select(null); }
document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
(function sndUI() { const C = Snd.cfg; $('bgmOn').checked = C.bgmOn; $('sfxOn').checked = C.sfxOn; $('bgmVol').value = Math.round(C.bgm * 100); $('sfxVol').value = Math.round(C.sfx * 100);
  const upd = () => { C.bgmOn = $('bgmOn').checked; C.sfxOn = $('sfxOn').checked; C.bgm = $('bgmVol').value / 100; C.sfx = $('sfxVol').value / 100; Snd.apply(); Snd.save(); $('sndBtn').classList.toggle('muted', !C.bgmOn && !C.sfxOn); };
  ['bgmOn', 'sfxOn', 'bgmVol', 'sfxVol'].forEach(id => $(id).addEventListener('input', upd)); $('sfxVol').addEventListener('change', () => Snd.play('coin', { force: true }));
  $('sndBtn').onclick = () => { Snd.unlock(); $('sndPanel').classList.toggle('hidden'); Snd.play('ui'); }; upd();
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'm' && !e.repeat) { const on = !(C.bgmOn || C.sfxOn); $('bgmOn').checked = $('sfxOn').checked = on; upd(); } });
})();
$('startWave').onclick = startWave; $('skillBtn').onclick = castSkill;
const upCost = k => Math.round(UPS[k].base * Math.pow(1.45, G.ups[k]));
document.querySelectorAll('.up').forEach(b => b.onclick = () => { const k = b.dataset.up, c = upCost(k); if (G.gold < c) return Snd.play('error'); G.gold -= c; G.ups[k]++;
  if (k === 'bar') for (const col of G.tiles) for (const t of col) if (t.bar) { const r = t.bar.hp / t.bar.max; t.bar.max = barMaxHp(); t.bar.hp = t.bar.max * r; }
  Snd.play('upgrade'); Snd.play('levelUp', { vol: .6 }); if (hero) emit(P, hero.g.position.x, 1.5, hero.g.position.z, 24, 0xffe066, 4, .7); refreshHud(); });
function select(o) { G.sel = o; $('tinfo').classList.toggle('hidden', !o); if (o && o.kind === 'tower') showRange(tileX(o.c), tileZ(o.r), TOWERS[o.type].range[o.lvl - 1], 0xffe066); else rangeRing.visible = false; refreshHud(); }
$('tUp').onclick = () => { if (G.sel && G.sel.kind === 'tower') { upgradeTower(G.sel); select(G.sel); } };
$('tSell').onclick = () => { const s = G.sel; if (!s) return; if (s.kind === 'tower') sellTower(s); else { G.gold += 15; removeBarricade(s.t, false); refreshHud(); } };
function setBar(f, t, r) { const w = Math.max(0, Math.min(1, r)) * 100 + '%', a = $(f), b = $(t); if (a.style.width !== w) { a.style.width = w; b.style.width = w; } }
function updBossBar() { const b = G.enemies.find(e => e.E.boss && !e.dead); $('bossHud').classList.toggle('hidden', !b); if (b) setBar('bossFill', 'bossTr', b.hp / b.max); }
function refreshHud() {
  $('gold').textContent = G.gold; $('wave').textContent = G.wave; setBar('coreBar', 'coreTr', G.coreHp / G.coreMax); if (G.coreHb) G.coreHb.set(G.coreHp / G.coreMax); $('coreTxt').textContent = `${Math.max(0, G.coreHp)}/${G.coreMax}`;
  $('enemyCnt').textContent = `적 ${G.enemies.filter(e => !e.dead).length + (G.spawnQ ? G.spawnQ.length : 0)}`;
  document.querySelectorAll('.up').forEach(b => { const k = b.dataset.up, c = upCost(k); b.innerHTML = `<span class="row"><span>${UPS[k].n} Lv.${G.ups[k]}</span><small>${c}G</small></span><span class="desc">${UPS[k].d}</span>`; b.disabled = G.gold < c; });
  document.querySelectorAll('.tool').forEach(b => { const T2 = TOWERS[b.dataset.tool]; if (T2) b.disabled = G.gold < T2.cost; if (b.dataset.tool === 'barricade') b.disabled = G.gold < 30; });
  const s = G.sel;
  if (s && s.kind === 'tower') { const D = TOWERS[s.type], L = s.lvl - 1; $('tName').textContent = `${D.n} Lv.${s.lvl}`;
    $('tStats').innerHTML = `${D.d}<br>피해 ${D.dmg[L]} · 초당 ${D.rate[L]}회<br>사거리 ${D.range[L]}${D.splash ? ` · 폭발 ${D.splash[L]}` : ''}${D.chain ? ` · 연쇄 ${D.chain[L]}` : ''}`;
    const u = $('tUp'); if (s.lvl < 3) { const c = D.up[L]; u.textContent = `강화 → Lv.${s.lvl + 1} (${c}G)`; u.disabled = G.gold < c; } else { u.textContent = '최대 레벨'; u.disabled = true; }
    $('tSell').textContent = `판매 (+${Math.floor(s.invest * .7)}G)`; }
  else if (s && s.kind === 'bar') { $('tName').textContent = '바리케이드'; $('tStats').innerHTML = `내구도 ${Math.ceil(s.hp)}/${Math.ceil(s.max)}<br>몬스터가 돌아가거나 부숴야 합니다`; $('tUp').textContent = '-'; $('tUp').disabled = true; $('tSell').textContent = '철거 (+15G)'; }
  if (hero) { setBar('heroBar', 'heroTr', hero.hp / hero.max); const cdp = hero.skillCd > 0 ? hero.skillCd / stat.skillCd() * 100 : 0; $('skillCd').style.setProperty('--p', cdp + '%'); $('skillCd').textContent = hero.skillCd > 0 ? Math.ceil(hero.skillCd) : ''; $('skillBtn').classList.toggle('ready', hero.skillCd <= 0); }
}

// ================= 영웅 선택 =================
const preview = []; let podium = null, hoverCls = null;
function showSelect() {
  G.phase = 'select'; $('select').classList.remove('hidden');
  podium = new THREE.Group(); podium.position.set(0, 0, GH + 6); scene.add(podium);
  mk(new THREE.CylinderGeometry(6.2, 6.8, .7, 48), toon(0x6ab84a), 0, -.35, 0, podium, .04); mk(new THREE.CylinderGeometry(6.9, 7.2, .5, 48), toon(0x9a7a5a), 0, -.8, 0, podium, .04);
  for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28; mk(new THREE.IcosahedronGeometry(.2, 1), toon([0xff8ac0, 0xffe05a, 0xffffff][k % 3]), Math.cos(a) * 5.6, .1, Math.sin(a) * 5.6, podium, .015); }
  ['archer', 'mage', 'warrior'].forEach((cls, i) => { const ch = makeHeroModel(cls); ch.g.position.set((i - 1) * 2.7, 0, i === 1 ? -.4 : 0); ch.g.rotation.y = (1 - i) * .25; podium.add(ch.g); ch.cls = cls; play(ch, 'Idle'); ch.mixer.update(i * .7); ch.nextCheer = 1.5 + i * 2.2; ch.cheerT = 0; preview.push(ch); });
  cam.target.set(0, 1.5, GH + 6); cam.r = 13.5; cam.phi = 1.3; cam.theta = 0;
  document.querySelectorAll('.card').forEach(c => { c.onclick = () => { SFX.init(); Snd.play('confirm'); choose(c.dataset.cls); }; c.onmouseenter = () => { hoverCls = c.dataset.cls; Snd.play('select'); const p = preview.find(p => p.cls === hoverCls); if (p) { play(p, 'Cheer', { once: true }); p.cheerT = 1.8; } }; c.onmouseleave = () => hoverCls = null; });
}
function updSelect(dt) {
  for (const p of preview) { p.mixer.update(dt); p.nextCheer -= dt; if (p.cheerT > 0) { p.cheerT -= dt; if (p.cheerT <= 0) play(p, 'Idle', { fade: .3 }); }
    else if (p.nextCheer <= 0) { p.nextCheer = rnd(5, 9); play(p, p.cls === 'mage' ? 'Spellcast_Raise' : p.cls === 'archer' ? '2H_Ranged_Shoot' : '1H_Melee_Attack_Slice_Horizontal', { once: true }); p.cheerT = 1.6; }
    p.ring.material.opacity = hoverCls === p.cls ? .95 : .45; p.ring.scale.setScalar(hoverCls === p.cls ? 1.2 + Math.sin(G.t * 6) * .05 : 1); }
  if (!G.heroShot) cam.theta = Math.sin(G.t * .2) * .18;
}
function choose(cls) {
  preview.forEach(p => p.mixer.stopAllAction()); preview.length = 0; scene.remove(podium); $('select').classList.add('hidden'); $('hud').classList.remove('hidden');
  spawnHero(cls); G.phase = 'build'; cam.target.set(0, 0, 1); cam.r = 58; cam.phi = .9; cam.theta = .22;
  computeDist(); setPhaseUI(); refreshHud(); banner(`${CLASSES[cls].n} 출전!`, '#ffe066');
}
Object.assign(G, { nextStep, SPAWN, CORE, choose, startWave, castSkill, mouseGround, select, upgradeTower, sellTower, T, tileAt, cam, TOWERS, enterCost, spawnEnemy, GL, BARS, hurt, ETYPES, CLASSES, BLK, heroDamage, toTile, GW, GH });
G.build = (c, r, tool) => { setTool(tool); const ok = build(c, r); setTool('move'); return ok; };
G.heroGoTo = (x, z) => heroGoTo(new THREE.Vector3(x, 0, z));
G.tileXZ = (c, r) => [tileX(c), tileZ(r)];
G.heroShotMode = () => { G.heroShot = true; $('select').classList.add('hidden'); cam.target.set(0, 1.3, GH + 5.8); cam.r = 8.6; cam.phi = 1.4; cam.theta = 0; };

// ================= 영웅 업데이트 =================
function updHero(dt) {
  const h = hero; h.ch.mixer.update(dt);
  if (h.dead > 0) { h.dead -= dt; if (h.dead <= 0) { h.hp = h.max; h.hb.show(true); h.g.position.set(tileX(CORE[0] - 1), 0, tileZ(CORE[1])); play(h.ch, 'Cheer', { once: true }); h.atkT = 1.2; emit(P, h.g.position.x, 1, h.g.position.z, 40, 0x8aff9a, 5, .8); ringFx(h.g.position, 2.5, 0x8aff9a, .6); } return; }
  const fwd = new THREE.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta)), right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  if (keys.w) mv.add(fwd); if (keys.s) mv.sub(fwd); if (keys.d) mv.add(right); if (keys.a) mv.sub(right);
  if (mv.lengthSq() > 0) h.path = [];
  else if (h.path.length) { mv.subVectors(h.path[0], h.g.position).setY(0); if (mv.length() < .15) { h.path.shift(); if (!h.path.length) mv.set(0, 0, 0); } }
  let moving = false;
  if (mv.lengthSq() > 0) { mv.normalize().multiplyScalar(h.C.speed * dt * (h.spinT > 0 ? .7 : 1)); const p = h.g.position;
    if (passAt(p.x + mv.x, p.z)) p.x += mv.x; if (passAt(p.x, p.z + mv.z)) p.z += mv.z; h.face = Math.atan2(mv.x, mv.z); moving = true; }
  h.g.position.y += (groundY(h.g.position.x, h.g.position.z) - h.g.position.y) * Math.min(1, dt * 10);
  const rng = stat.range(); let tgt = null, bd = rng * rng;
  for (const e of G.enemies) { if (e.dead) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = dx * dx + dz * dz; if (d < bd && (h.cls !== 'warrior' || !e.E.fly)) { bd = d; tgt = e; } }
  h.cd -= dt; h.atkT -= dt;
  if (tgt && h.spinT <= 0) { const want = Math.atan2(tgt.g.position.x - h.g.position.x, tgt.g.position.z - h.g.position.z); if (!moving) h.face = want;
    if (h.cd <= 0) { h.cd = 1 / stat.rate();
      if (!moving) { const nm = h.cls === 'warrior' && rand() < .5 ? '1H_Melee_Attack_Slice_Horizontal' : h.C.atk; play(h.ch, nm, { once: true, force: true, speed: h.C.atkSpd * Math.max(1, stat.rate() / h.C.rate) }); h.atkT = Math.min(.55, 1 / stat.rate()); }
      const t0 = tgt; later(h.cls === 'warrior' ? .12 : .08, () => { if (!t0.dead && hero.dead <= 0) attack(t0); }); } }
  if (h.spinT > 0) { h.spinT -= dt; h.spinTick -= dt; h.g.rotation.y += dt * 9;
    if (h.spinTick <= 0) { h.spinTick = .25; aoe(h.g.position, 3.6, stat.dmg() * 1.3 * stat.skillMul(), '#ffb07a', { groundOnly: true }); emit(P, h.g.position.x, 1.2, h.g.position.z, 20, 0xffa04a, 7, .4, 0, 4); }
    h.swirl.rotation.z += dt * 15; if (h.spinT <= 0) { h.swirl.visible = false; play(h.ch, 'Idle'); } }
  else { let d = h.face - h.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); h.g.rotation.y += d * Math.min(1, dt * 14); }
  if (h.spinT <= 0) { if (moving) play(h.ch, 'Running_A', { speed: 1.1 }); else if (h.atkT <= 0) play(h.ch, 'Idle', { fade: .25 }); }
  h.ch.ring.material.opacity = .5 + Math.sin(G.t * 4) * .2;
  if (h.flash > 0) { h.flash -= dt; flashMats(h.ch.mats, true, 0xff3030); } else flashMats(h.ch.mats, false);
  if (!G.enemies.some(e => !e.dead && e.g.position.distanceTo(h.g.position) < 4)) h.hp = Math.min(h.max, h.hp + h.max * .03 * dt);
  h.hb.set(h.hp / h.max);
}
function heroTip() { const p = hero.g.position, f = hero.g.rotation.y; return new THREE.Vector3(p.x + Math.sin(f) * .6, p.y + (hero.cls === 'mage' ? 2.2 : 1.5), p.z + Math.cos(f) * .6); }
function attack(t) {
  const h = hero, from = heroTip(); if (h.cls === 'archer') Snd.play('bolt', { pos: from }); else if (h.cls === 'mage') Snd.play('magic', { pos: from, rate: .8 }); else { Snd.play('sword', { pos: from }); Snd.whoosh(from, .22, 700, 2200, .25); }
  if (h.cls === 'archer') shoot('arrow', from, t, stat.dmg(), { color: 0xb0ffb8 });
  else if (h.cls === 'mage') { shoot('orb', from, t, stat.dmg(), { aoe: h.C.aoe }); emit(P, from.x, from.y, from.z, 10, 0xc07aff, 3, .3); }
  else { const fx2 = Math.sin(h.face), fz2 = Math.cos(h.face);
    for (const e of [...G.enemies]) { if (e.dead || e.E.fly) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = Math.hypot(dx, dz); if (d < stat.range() + .4 && (dx * fx2 + dz * fz2) / (d || 1) > .45) hurt(e, stat.dmg(), '#ffcf9a'); }
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.8, 24, 1, -Math.PI / 3, Math.PI * 2 / 3), new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: .8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    arc.rotation.x = -Math.PI / 2; arc.rotation.z = h.face - Math.PI / 2; arc.position.set(h.g.position.x, 1, h.g.position.z); scene.add(arc); G.fxs.push({ m: arc, t: 0, dur: .2, kind: 'fade' }); }
}

// ================= 조명 / 메인 루프 =================
function updLighting(dt) {
  G.night += (G.nightTarget - G.night) * Math.min(1, dt * 1.5); const n = G.night;
  skyU.top.value.copy(DAY.top).lerp(NIGHT.top, n); skyU.bot.value.copy(DAY.bot).lerp(NIGHT.bot, n); scene.fog.color.copy(DAY.fog).lerp(NIGHT.fog, n);
  sun.intensity = 2.6 * (1 - n) + .25; moon.intensity = 1.4 * n; hemi.intensity = 1.35 - .75 * n; stars.material.opacity = n;
  sun.color.setHSL(.1, .6 - n * .3, .88 - n * .2); bloom.strength = .32 + n * .22; portalLight.intensity = 20 + n * 60 + Math.sin(G.t * 6) * 8; coreLight.intensity = 3 + n * 5;
}
let lastT = performance.now(), hudT = 0;
function loop() { requestAnimationFrame(loop); const now = performance.now(), raw = (now - lastT) / 1000; lastT = now; if (!G.manual) step(Math.min(raw, .05)); composer.render(); }
G.Snd = Snd; G.sim = (sec, h = .05) => { for (let t = 0; t < sec; t += h) step(h); };
function step(dt) {
  G.t += dt;
  for (let i = G.timers.length - 1; i >= 0; i--) { const tm = G.timers[i]; tm.t -= dt; if (tm.t <= 0) { G.timers.splice(i, 1); tm.fn(); } }
  if (G.phase === 'select') updSelect(dt);
  if (G.phase === 'wave') { if (G.spawnQ.length) { G.spawnT -= dt; if (G.spawnT <= 0) { G.spawnT = rnd(.55, .9); spawnEnemy(G.spawnQ.shift(), G.hpMul); } } else if (!G.enemies.length) endWave(); }
  if (hero && G.phase !== 'over' && G.phase !== 'select') {
    updHero(dt); updEnemies(dt); separate(dt); updTowers(dt); updProjs(dt); if (hero.skillCd > 0) hero.skillCd -= dt;
    if (keys.w || keys.a || keys.s || keys.d || hero.path.length) cam.target.lerp(new THREE.Vector3(hero.g.position.x * .4, 0, hero.g.position.z * .4 + 1), dt * 2);
  }
  G.distT -= dt; if (G.distDirty && G.distT <= 0) { computeDist(); G.distT = .35; }
  for (const t of G.dirty) { refreshTile(t); if (t.shk > 0) t.shk -= dt; else G.dirty.delete(t); }
  updFx(dt); updParticles(P, dt); updParticles(PB, dt); updDebris(dt); updCoins(dt); updLighting(dt); updRoute(); updBars(dt); updBossBar(dt); Snd.listener = cam.target; if (G.phase !== 'over') Snd.setMusic(G.phase === 'wave' ? (G.enemies.some(e => e.E.boss && !e.dead) ? 'boss' : 'wave') : 'build');
  portalDisk.rotation.z -= dt * 2.5; if (rand() < .6) emit(P, portal.position.x + rnd(-.3, .3), rnd(.6, 3.2), portal.position.z + rnd(-1.4, 1.4), 1, 0xc07aff, 1.5, .8, 2, .3);
  crystal.rotation.y += dt * 1.2; crystal.position.y = 3.6 + Math.sin(G.t * 2) * .2; coreRings.forEach((r, k) => r.rotation.z += dt * (k ? -1.5 : 1));
  if (moveMark.visible) { moveMark.scale.multiplyScalar(1 - dt * 3); moveMark.material.opacity = moveMark.scale.x; if (moveMark.scale.x < .2) moveMark.visible = false; }
  G.shake = Math.max(0, G.shake - dt * 1.8); updateCam(); hudT += dt; if (hudT > .15) { hudT = 0; if (G.phase !== 'select' && G.phase !== 'loading') refreshHud(); }
}
genMap(); initTerrainColors(); refreshAll(); buildPortal(); buildCore(); computeDist(); updateCam(); loop();
loadAssets().then(() => { G.ready = true; $('loading').classList.add('hidden'); showSelect(); })
  .catch(err => { console.warn(err); $('loadTxt').textContent = '모델을 불러오지 못했습니다. 새로고침 해주세요.'; });
