import * as THREE from 'three';
import { GW, GH, S, T, isBlock, tileX, tileZ } from '../core/grid.js';
import { G } from '../core/state.js';
import { scene } from '../render/scene.js';
import { tileAt } from '../world/terrain.js';
import { towerModel } from '../world/towers.js';

// ================= 건설/개간 미리보기 =================
// 칸 강조(굵은 테두리 + 채움, 초록=가능/빨강=불가), 반투명 고스트 타워 + 사거리, 개간 대상 블록 펄스, 건설 가능 칸 격자 오버레이
const OK = 0x5cff7a, BAD = 0xff4a4a, CLR = 0xffb03a;
const frameGeo = (() => { const o = S * .5, i = S * .5 - .28, sh = new THREE.Shape([[-o, -o], [o, -o], [o, o], [-o, o]].map(([x, y]) => new THREE.Vector2(x, y)));
  sh.holes.push(new THREE.Path([[-i, -i], [-i, i], [i, i], [i, -i]].map(([x, y]) => new THREE.Vector2(x, y)))); return new THREE.ShapeGeometry(sh); })();
const basic = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const frame = new THREE.Mesh(frameGeo, basic(OK, 1)); frame.material.depthTest = false; frame.scale.setScalar(1.06); frame.rotation.x = -Math.PI / 2; frame.renderOrder = 5;
const fill = new THREE.Mesh(new THREE.PlaneGeometry(S * .9, S * .9), basic(OK, .35)); fill.rotation.x = -Math.PI / 2; fill.renderOrder = 4; fill.material.depthTest = false;
const box = new THREE.Mesh(new THREE.BoxGeometry(S * 1.02, 1.5, S * 1.02), basic(CLR, .25)); // 개간 대상 블록 감싸기
const boxEdge = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: CLR, toneMapped: false })); box.add(boxEdge);
const cursorG = new THREE.Group(); cursorG.add(frame, fill, box); cursorG.visible = false; scene.add(cursorG);
// 격자 오버레이 (건설 가능 칸)
const grid = new THREE.InstancedMesh(frameGeo, basic(0xbff6ff, .22), GW * GH); grid.visible = false; grid.renderOrder = 3; scene.add(grid);
const gridFill = new THREE.InstancedMesh(new THREE.PlaneGeometry(S * .94, S * .94), basic(0x9ae8ff, .1), GW * GH); gridFill.visible = false; scene.add(gridFill);
const M = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), ZERO = new THREE.Vector3();
let ghost = null, ghostType = null, gridT = 0, gridTool = null;
const ghostMats = [];
function topY(t) { return isBlock(t.t) ? 1.22 : t.t === T.CARVED ? -.4 : .06; }
function setGhost(type) { if (ghostType === type) return; if (ghost) scene.remove(ghost); ghost = null; ghostType = type; if (!type) return;
  ghost = towerModel(type, 1).g; ghostMats.length = 0; ghost.traverse(o => { if (!o.isMesh) return; o.castShadow = false; if (o.userData.ol) return; const m = o.material.clone(); m.transparent = true; m.opacity = .7; m.depthWrite = false; if (m.emissive) { m.emissive.set(OK); m.emissiveIntensity = .45; } o.material = m; ghostMats.push(m); }); scene.add(ghost); }
const usable = (tool, t) => tool === 'clear' ? isBlock(t.t) : tool === 'barricade' ? (t.t === T.CARVED || t.t === T.GRASS) && !t.tower && !t.bar : t.t === T.GRASS && !t.tower && !t.bar;
function refreshGrid() { const tool = G.tool, col = tool === 'clear' ? CLR : 0x9ae8ff; grid.material.color.set(col); gridFill.material.color.set(col); let n = 0;
  for (let c = 0; c < GW; c++) for (let r = 0; r < GH; r++) { const t = tileAt(c, r), on = usable(tool, t); V.set(tileX(c), topY(t) + .01, tileZ(r)); M.compose(V, Q, on ? ONE : ZERO); grid.setMatrixAt(n, M); gridFill.setMatrixAt(n, M); n++; }
  grid.instanceMatrix.needsUpdate = gridFill.instanceMatrix.needsUpdate = true; }
// c,r 위치 미리보기. valid: 가능 여부, tool: 현재 도구
function showPreview(c, r, valid, tool, range) {
  const t = tileAt(c, r); cursorG.visible = true; const col = tool === 'clear' && valid ? CLR : valid ? OK : BAD, y = topY(t) + .03;
  cursorG.position.set(tileX(c), 0, tileZ(r)); frame.position.y = y + .02; fill.position.y = y; frame.material.color.set(col); fill.material.color.set(col);
  box.visible = tool === 'clear' && isBlock(t.t); box.position.y = .6; box.material.color.set(col); boxEdge.material.color.set(col);
  setGhost(G.TOWERS && G.TOWERS[tool] ? tool : null); if (ghost) { ghost.visible = t.t === T.GRASS; ghost.position.set(tileX(c), 0, tileZ(r)); for (const m of ghostMats) if (m.emissive) m.emissive.set(valid ? OK : BAD); }
}
function hidePreview() { cursorG.visible = false; if (ghost) ghost.visible = false; }
function updPreview(dt) {
  const on = G.tool && G.tool !== 'move' && G.phase !== 'select' && G.phase !== 'loading' && G.phase !== 'over'; grid.visible = gridFill.visible = !!on;
  if (!on) { hidePreview(); return; }
  gridT -= dt; if (gridT <= 0 || gridTool !== G.tool) { gridT = .3; gridTool = G.tool; refreshGrid(); }
  const k = .5 + .5 * Math.sin(performance.now() / 160); frame.material.opacity = 1; fill.material.opacity = .4 + .2 * k; frame.scale.setScalar(1.04 + .06 * k); box.material.opacity = .15 + .25 * k; box.scale.setScalar(1 + .04 * k);
}
export { showPreview, hidePreview, updPreview };
