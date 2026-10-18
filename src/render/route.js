import * as THREE from 'three';
import { CORE, DIRS, GH, GW, NT, S, SPAWN, T, inGrid, isBlock, tileX, tileZ } from '../core/grid.js';
import { G } from '../core/state.js';
import { scene } from './scene.js';
import { IM, dummy, hideI, setI } from './toon.js';
import { tileAt } from '../world/terrain.js';
import { nextStep } from '../world/pathfinding.js';

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

export { drawRoute, updRoute };
