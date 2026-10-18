import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from './scene.js';

// ================= 툰 셰이딩 + 외곽선 =================
const grad = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 195, 195, 195, 255, 255, 255, 255, 255]), 3, 1);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...o });
const glow = (color, i = 2.5) => new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: i, gradientMap: grad });
const olMats = {};
function outlineMat(th) {
  const key = th.toFixed(4); if (olMats[key]) return olMats[key];
  const m = new THREE.MeshBasicMaterial({ color: 0x1c1428, side: THREE.BackSide }); const u = { value: th };
  m.onBeforeCompile = s => { s.uniforms.uTh = u; s.vertexShader = 'uniform float uTh;\n' + s.vertexShader.replace('#include <project_vertex>', '#ifdef USE_SKINNING\n transformed += normalize(objectNormal) * uTh;\n#else\n transformed += normalize(normal) * uTh;\n#endif\n#include <project_vertex>'); };
  m.customProgramCacheKey = () => 'outline'; return olMats[key] = m;
}
const olCache = new WeakMap();
function olGeo(g) {
  if (olCache.has(g)) return olCache.get(g);
  const gf = ['getX', 'getY', 'getZ', 'getW'], plain = a => { const n = a.itemSize, Arr = a.isInterleavedBufferAttribute ? a.data.array.constructor : a.array.constructor, arr = new Arr(a.count * n);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) arr[i * n + k] = a[gf[k]](i); return new THREE.BufferAttribute(arr, n, a.normalized); };
  let o = new THREE.BufferGeometry(); for (const k of ['position', 'skinIndex', 'skinWeight']) if (g.attributes[k]) o.setAttribute(k, plain(g.attributes[k]));
  if (g.index) o.setIndex(g.index.clone());
  o = mergeVertices(o, 1e-3); o.computeVertexNormals(); olCache.set(g, o); return o;
}
function addOutline(m, th) {
  const geo = olGeo(m.geometry); let o;
  if (m.isSkinnedMesh) { o = new THREE.SkinnedMesh(geo, outlineMat(th)); o.bind(m.skeleton, m.bindMatrix); }
  else o = new THREE.Mesh(geo, outlineMat(th));
  o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.raycast = () => {}; o.userData.ol = true; m.add(o); return o;
}
function mk(geo, mat, x = 0, y = 0, z = 0, parent, ol = .035) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (ol) addOutline(m, ol); if (parent) parent.add(m); return m;
}
const WHITE = new THREE.Color(1, 1, 1), dummy = new THREE.Object3D(), tmpC = new THREE.Color();
function IM(geo, mat, count, ol = .03, shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, count); m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); const z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) { m.setMatrixAt(i, z); m.setColorAt(i, WHITE); } scene.add(m);
  if (ol) { const o = new THREE.InstancedMesh(olGeo(geo), outlineMat(ol), count); o.instanceMatrix = m.instanceMatrix; o.frustumCulled = false; scene.add(o); }
  return m;
}
function setI(im, i, x, y, z, sx, sy = sx, sz = sx, ry = 0, rx = 0) { dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.instanceMatrix.needsUpdate = true; }
function hideI(im, i) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.instanceMatrix.needsUpdate = true; }

export { grad, toon, glow, addOutline, mk, dummy, tmpC, IM, setI, hideI, olGeo, outlineMat };
