// 보스 장비 드롭 연출: 등급색 빛기둥 + 회전하는 보석 + 입자, 4초 후 영웅에게 흡수
import * as THREE from 'three';
import { scene } from './scene.js';
import { P, PB, emit, ringFx } from './vfx.js';
import { G } from '../core/state.js';
import { GRADES } from '../account/equip.js';
// 셰이더 주의: MSAA(실제 GPU)에서는 varying이 삼각형 밖으로 외삽되어 vU.y가 1을 살짝 넘을 수 있음 → pow(음수)=NaN → 블룸이 NaN을 화면 전체로 번져 검은 화면.
// 그래서 uv/밑/알파를 모두 clamp (scene.js 블룸 입력에도 NaN 방어가 있음)
const L = [];
export function lootFx(pos, g) {
  const c = new THREE.Color(GRADES[g].c), grp = new THREE.Group(); grp.position.set(pos.x, 0, pos.z); scene.add(grp);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.45, .7, 18, 20, 1, true), new THREE.ShaderMaterial({ uniforms: { uC: { value: c.clone().multiplyScalar(1.6) }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: 'varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uC; uniform float uT; varying vec2 vU; void main(){ float y=clamp(vU.y,0.,1.); float a=pow(max(1.-y,0.),1.4)*(.55+.25*sin(uT*8.-y*25.)); gl_FragColor=vec4(uC, clamp(a,0.,1.)); }' }));
  beam.position.y = 9; grp.add(beam);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.45), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2), toneMapped: false })); gem.position.y = 1.4; grp.add(gem);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.9, 1.3, 32), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.5), transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .08; grp.add(ring);
  emit(PB, pos.x, 1.5, pos.z, 50, c.getHex(), 9, 1, -4, 1.5); ringFx(grp.position, 3, c.getHex(), .8);
  L.push({ grp, beam, gem, ring, t: 0, c: c.getHex() });
}
export function updLoot(dt) {
  for (let i = L.length - 1; i >= 0; i--) { const o = L[i]; o.t += dt; o.beam.material.uniforms.uT.value = o.t; o.gem.rotation.y += dt * 3; o.gem.position.y = 1.4 + Math.sin(o.t * 3) * .2; o.ring.scale.setScalar(1 + Math.sin(o.t * 4) * .1);
    if (Math.random() < .5) emit(P, o.grp.position.x + (Math.random() - .5), Math.random() * 4, o.grp.position.z + (Math.random() - .5), 1, o.c, 1.5, .8, 3, .2);
    if (o.t > 4 && G.hero) { const hp = G.hero.g.position; o.grp.position.lerp(hp, Math.min(1, dt * 4)); o.grp.scale.multiplyScalar(1 - dt * 1.5); }
    if (o.t > 5.5) { scene.remove(o.grp); o.grp.traverse(m => { m.geometry?.dispose(); m.material?.dispose(); }); L.splice(i, 1); if (G.hero) emit(PB, G.hero.g.position.x, 1.5, G.hero.g.position.z, 30, o.c, 5, .7); } }
}
