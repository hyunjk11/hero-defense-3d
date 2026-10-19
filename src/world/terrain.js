import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32, rnd } from '../core/util.js';
import { CORE, GH, GW, NT, S, SPAWN, SPAWNS, STAGE, T, isBlock, tileX, tileZ } from '../core/grid.js';
import { BLK } from '../data/terrain.js';
import { G } from '../core/state.js';
import { scene, VOLCANO } from '../render/scene.js';
import { lavaTiles } from '../data/stages.js';
import { buildLavaMesh, volcanoDeco } from '../render/volcano.js';
import { IM, glow, hideI, mk, setI, tmpC, toon } from '../render/toon.js';
import { P, debris, emit } from '../render/vfx.js';
import { hpBar } from '../render/hpbars.js';
import { computeDist, invalidatePaths } from './pathfinding.js';
import { removeBarricade } from './barricades.js';

// ================= 맵 생성 =================
const seed = STAGE ? STAGE.seed : +(new URLSearchParams(location.search).get('seed')) || (Math.random() * 1e9 | 0);
const SNOW = STAGE && STAGE.ch === 2;
const LAVA = lavaTiles(STAGE, GW, GH); // 화산: 용암 강 칸 (건널 수 없음 = BEDROCK 규칙, t.lava 로 따로 그림)
if (STAGE && STAGE.ch === 1) { BLK[T.DIRT].hp = 105; BLK[T.FOREST].hp = 180; } // 숲: 부드러운 흙
function genMap() {
  const R = mulberry32(seed), L = Array.from({ length: 64 }, () => Array.from({ length: 64 }, R)), sm = t => t * t * (3 - 2 * t);
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi), a = L[xi & 63][yi & 63], b = L[(xi + 1) & 63][yi & 63], c = L[xi & 63][(yi + 1) & 63], d = L[(xi + 1) & 63][(yi + 1) & 63]; return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  const V = []; for (let c = 0; c < GW; c++) { V[c] = []; for (let r = 0; r < GH; r++) V[c][r] = vn(c * .3 + 5.3, r * .3 + 2.1) * .6 + vn(c * .75 + 9.7, r * .75 + 4.4) * .4; }
  const all = V.flat().sort((a, b) => a - b), q = p => all[Math.floor(all.length * p)];
  const Q = STAGE ? STAGE.q : [.25, .6, .77], q1 = q(Q[0]), q2 = q(Q[1]), q3 = q(Q[2]);
  for (let c = 0; c < GW; c++) { G.tiles[c] = []; for (let r = 0; r < GH; r++) {
    const v = V[c][r]; let t = v < q1 ? T.GRASS : v < q2 ? T.DIRT : v < q3 ? T.FOREST : T.ROCK;
    const dS = Math.abs(c - SPAWN[0]) + Math.abs(r - SPAWN[1]), dC = Math.abs(c - CORE[0]) + Math.abs(r - CORE[1]);
    if (R() < (STAGE ? STAGE.bed : .04) && dS > 4 && dC > 4 && SPAWNS.every(s => Math.abs(c - s[0]) + Math.abs(r - s[1]) > 4)) t = T.BEDROCK;
    if ((c <= 1 && Math.abs(r - SPAWN[1]) <= 1) || (Math.abs(c - CORE[0]) <= 1 && Math.abs(r - CORE[1]) <= 1) || (STAGE && SPAWNS.some(s => Math.abs(c - s[0]) <= 1 && Math.abs(r - s[1]) <= 1))) t = T.GRASS;
    const hp = BLK[t] ? BLK[t].hp : 0;
    G.tiles[c][r] = { c, r, t, hp, max: hp, tower: null, bar: null, s: R(), s2: R(), s3: R(), shk: 0, ck: (c + r) % 2 ? .03 : 0 };
  } }
  for (const k of LAVA) { const [c, r] = k.split(',').map(Number), t = G.tiles[c][r]; t.t = T.BEDROCK; t.hp = t.max = 0; t.lava = true; }
  for (const s of SPAWNS) G.tiles[s[0]][s[1]].t = T.SPAWN; G.tiles[CORE[0]][CORE[1]].t = T.CORE;
}
const tileAt = (c, r) => G.tiles[c][r];
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
const crackIM = VOLCANO ? IM(new THREE.BoxGeometry(.07, .03, 1.1), glow(0xff5a14, .9), NT * 2, 0, false) : null;
function initTerrainColors() {
  for (let c = 0; c < GW; c++) for (let r = 0; r < GH; r++) {
    const t = tileAt(c, r), i = c * GH + r;
    dirtIM.setColorAt(i, SNOW ? tmpC.setHSL(.6, .22, .4 + t.s * .06) : VOLCANO ? tmpC.setHSL(.03, .35, .045 + t.s * .015) : tmpC.setHSL(.065, .55, .26 + t.s * .05));
    capIM.setColorAt(i, SNOW ? tmpC.setHSL(.58, .3, .78 + t.s * .05) : VOLCANO ? tmpC.setHSL(.04, .14, .06 + t.s * .015) : tmpC.setHSL(.22 + t.s2 * .04, .58, .38 + t.s * .05));
    for (let k = 0; k < 2; k++) leafIM.setColorAt(i * 2 + k, SNOW ? (k ? tmpC.setHSL(.58, .22, .8) : tmpC.setHSL(.42, .38, .27 + t.s2 * .05)) : VOLCANO ? (k ? tmpC.setHSL(.05, .5, .08 + t.s2 * .02) : tmpC.setHSL(.03, .1, .045 + t.s2 * .015)) : tmpC.setHSL(.27 + t.s * .07 + k * .02, .6, .4 + k * .07 + t.s2 * .05));
    for (let k = 0; k < 2; k++) rockIM.setColorAt(i * 2 + k, VOLCANO ? tmpC.setHSL(.03 + t.s * .03, .1 + t.s2 * .06, .05 + k * .018 + t.s * .015) : tmpC.setHSL(.6 + t.s * .05, .08 + t.s2 * .06, .55 + k * .08 + t.s * .06));
    for (let k = 0; k < 3; k++) tuftIM.setColorAt(i * 3 + k, SNOW ? tmpC.setHSL(.57, .3, .72) : VOLCANO ? tmpC.setHSL(.03, .25, .04 + k * .012) : tmpC.setHSL(.26 + t.s * .06, .6, .38 + k * .05));
    for (let k = 0; k < 2; k++) flowerIM.setColorAt(i * 2 + k, tmpC.set((VOLCANO ? [0xff6a1a, 0xffa040, 0xc83a10, 0xff8a2a] : [0xff8ac0, 0xffe05a, 0xffffff, 0xa0c8ff])[Math.floor(t.s3 * 4 + k * 1.7) % 4])); // 화산: 꽃 대신 불씨 알갱이
    if (t.t === T.BEDROCK && !t.lava) makeBedrock(t);
  }
  for (const im of [dirtIM, capIM, leafIM, rockIM, tuftIM, flowerIM]) im.instanceColor.needsUpdate = true;
  if (VOLCANO) { trunkIM.material.color.setHex(0x2e2220); buildLavaMesh([...LAVA].map(k => k.split(',').map(Number))); }
}
function makeBedrock(t) {
  const g = new THREE.Group(); g.position.set(tileX(t.c), 0, tileZ(t.r)); bedrock.add(g);
  const m = mk(rockGeo, toon(VOLCANO ? 0x2a2026 : 0x4a4660), 0, .9, 0, g); m.scale.set(1.05, 1.5, 1.05); m.rotation.y = t.s * 6;
  const cm = VOLCANO ? glow(0xff7a2a, 1.1) : glow(0xb47aff, 1.6); // 화산: 흑요석 + 주황 결정
  for (let k = 0; k < 3; k++) { const s = mk(new THREE.OctahedronGeometry(.38, 0), cm, Math.cos(k * 2.1 + t.s) * .55, 1.6 + k * .25, Math.sin(k * 2.1 + t.s) * .55, g); s.scale.set(.6, 1.6 + k * .3, .6); s.rotation.z = (k - 1) * .4; }
}
function refreshTile(t) {
  const i = t.c * GH + t.r, x = tileX(t.c), z = tileZ(t.r);
  const jx = t.shk > 0 ? rnd(-.09, .09) : 0, jz = t.shk > 0 ? rnd(-.09, .09) : 0, low = t.t === T.CARVED;
  setI(groundIM, i, x, t.lava ? -1.1 : low ? -.88 : -.4, z, 1);
  if (t.lava) groundIM.setColorAt(i, tmpC.set(0x1a1010));
  else if (low) groundIM.setColorAt(i, SNOW ? tmpC.setHSL(.54, .62, .5 + t.s * .05) : VOLCANO ? tmpC.setHSL(.045, .45, .14 + t.s * .025) : tmpC.setHSL(.09, .55, .56 + t.s * .05)); // 설원: 얼음 길, 화산: 잿빛 붉은 길
  else if (t.t === T.SPAWN) groundIM.setColorAt(i, tmpC.set(0x5a4a7a));
  else if (t.t === T.CORE) groundIM.setColorAt(i, tmpC.set(0xc8c0d8));
  else groundIM.setColorAt(i, SNOW ? tmpC.setHSL(.6, .24, .62 + t.ck * 2 + t.s2 * .04) : VOLCANO ? tmpC.setHSL(.035, .14, .034 + t.ck * .4 + t.s2 * .01) : tmpC.setHSL(.25 + t.s * .04, .55, .44 + t.ck + t.s2 * .04)); // 화산: 어두운 현무암
  groundIM.instanceColor.needsUpdate = true;
  [dirtIM, capIM, trunkIM].forEach(m => hideI(m, i)); for (let k = 0; k < 2; k++) { hideI(leafIM, i * 2 + k); hideI(rockIM, i * 2 + k); hideI(flowerIM, i * 2 + k); }
  for (let k = 0; k < 3; k++) { hideI(tuftIM, i * 3 + k); hideI(pebbleIM, i * 3 + k); }
  if (crackIM) { hideI(crackIM, i * 2); hideI(crackIM, i * 2 + 1); if (t.t === T.GRASS && t.s3 > .62) for (let q = 0; q < 2; q++) setI(crackIM, i * 2 + q, x + (t.s - .5) * .8 * (q ? -1 : 1), .015, z + (t.s2 - .5) * .8, 1, 1, .5 + t.s * .7 - q * .2, t.s3 * 9 + q * 1.3); } // 화산: 현무암 틈의 용암 균열
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
  const R = mulberry32(99), base = new THREE.Mesh(new THREE.CircleGeometry(260, 48), toon(SNOW ? 0xa9b8cc : VOLCANO ? 0x2a1e1a : 0x5aa84a)); base.rotation.x = -Math.PI / 2; base.position.y = -.81; base.receiveShadow = true; scene.add(base);
  const rim = new THREE.Mesh(new RoundedBoxGeometry(GW * S + 1.2, 1.6, GH * S + 1.2, 2, .4), toon(VOLCANO ? 0x3a2622 : 0x7a5a3a)); rim.position.y = -1.6; rim.receiveShadow = true; scene.add(rim);
  const n = 140, tr = IM(new THREE.CylinderGeometry(.22, .32, 1.6, 7), toon(VOLCANO ? 0x2e2220 : 0x7a4a2a), n, .04), lf = IM(new THREE.IcosahedronGeometry(1, 2), toon(0xffffff), n * 2, .045);
  for (let i = 0; i < n; i++) {
    let x, z; do { x = (R() - .5) * 130; z = (R() - .5) * 100; } while ((Math.abs(x) < GW + 3 && Math.abs(z) < GH + 3) || (Math.abs(x) < 16 && z > 14 && z < 40));
    const s = .9 + R() * .9; setI(tr, i, x, -.8 + .8 * s, z, s);
    setI(lf, i * 2, x, -.8 + 2.2 * s, z, 1.5 * s, 1.3 * s, 1.5 * s, R() * 6); setI(lf, i * 2 + 1, x + .2, -.8 + 3.4 * s, z, s, .9 * s, s, R() * 6);
    if (VOLCANO) { R(); R(); R(); R(); lf.setColorAt(i * 2, tmpC.setHSL(.03, .1, .03 + (i % 5) * .006)); lf.setColorAt(i * 2 + 1, tmpC.setHSL(.04, .12, .05 + (i % 3) * .008)); } // 화산: 타 버린 나무 · 잿더미
    else if (SNOW) { R(); R(); R(); R(); lf.setColorAt(i * 2, tmpC.setHSL(.45, .3, .3 + (i % 5) * .02)); lf.setColorAt(i * 2 + 1, tmpC.setHSL(.58, .22, .8)); } else { lf.setColorAt(i * 2, tmpC.setHSL(.25 + R() * .1, .55, .38 + R() * .1)); lf.setColorAt(i * 2 + 1, tmpC.setHSL(.27 + R() * .1, .55, .45 + R() * .1)); }
  }
  lf.instanceColor.needsUpdate = true;
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + .3, m = mk(new THREE.ConeGeometry(18 + R() * 10, 22 + R() * 14, 7), toon(VOLCANO ? new THREE.Color().setHSL(.03, .14, .03 + R() * .015) : new THREE.Color().setHSL(.58, .25, .55 + R() * .1)), Math.cos(a) * 140, 8, Math.sin(a) * 110, scene, 0); m.castShadow = false; }
  if (VOLCANO) volcanoDeco();
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
  portal.rotation.y = portalYaw(SPAWN); // 추가 포털 (스테이지 모드)
  for (const s of SPAWNS.slice(1)) { const p2 = portal.clone(true); p2.position.set(tileX(s[0]), 0, tileZ(s[1])); p2.rotation.y = portalYaw(s); scene.add(p2); extraPortals.push(p2); }
}
const extraPortals = [];
function portalYaw(s) { return s[0] <= 0 || s[0] >= GW - 1 ? Math.PI / 2 : 0; }
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
function damageTile(t, dmg) {
  if (t.bar) { t.bar.hp -= dmg; t.bar.hb.set(Math.max(0, t.bar.hp / t.bar.max)); t.bar.g.position.x = tileX(t.c) + rnd(-.07, .07); G.distDirty = true; invalidatePaths(false); if (t.bar.hp <= 0) removeBarricade(t, true); return; }
  if (!isBlock(t.t)) return; t.hp -= dmg; t.shk = .12; G.dirty.add(t); G.distDirty = true; invalidatePaths(false); if (t.hp <= 0) carve(t);
}
function carve(t) {
  const B = BLK[t.t], x = tileX(t.c), z = tileZ(t.r); debris(x, .8, z, t.t === T.ROCK ? 26 : 18, B.deb, 7.5); emit(P, x, .8, z, 30, t.t === T.ROCK ? 0x9a9aaa : 0x9a7048, 4, .9, -3, 2.5);
  if (t.t === T.FOREST) emit(P, x, 2.4, z, 30, 0x6ad05a, 4, 1, -3, 2);
  if (t.t === T.ROCK) G.shake = Math.max(G.shake, .22); Snd.play(t.t === T.ROCK ? 'breakRock' : t.t === T.FOREST ? 'breakWood' : 'breakDirt', { pos: { x, z }, force: true });
  t.t = T.CARVED; t.hp = t.max = 0; t.shk = 0; G.dirty.add(t); G.carved = (G.carved || 0) + 1; computeDist();
}

export { genMap, tileAt, initTerrainColors, refreshTile, refreshAll, portal, portalDisk, portalLight, buildPortal, core, crystal, coreLight, crystalMat, coreRings, buildCore, damageTile, carve };
