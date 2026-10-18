import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { $ } from '../core/util.js';
import { CLASSES } from '../data/heroes.js';
import { ETYPES } from '../data/monsters.js';
import { addOutline, glow, grad, mk, toon } from './toon.js';

// ================= 캐릭터 (KayKit glTF, 스켈레탈 애니메이션) =================
const GL = {}; const ASSETS = ['archer', 'mage', 'warrior', 'sk_minion', 'sk_warrior', 'sk_rogue', 'w_axe', 'w_blade', 'w_shield_large_a'];
async function loadAssets() {
  const loader = new GLTFLoader(); let n = 0;
  await Promise.all(ASSETS.map(k => loader.loadAsync(`models/${k}.glb`).then(g => { GL[k] = g; prep(g); $('loadTxt').textContent = `모델 불러오는 중… ${++n}/${ASSETS.length}`; })));
}
function prep(g) {
  g.scene.traverse(o => { if (o.isMesh) { const om = o.material; o.material = new THREE.MeshToonMaterial({ color: om.color ? om.color.clone() : 0xffffff, map: om.map || null, gradientMap: grad }); o.castShadow = true; } });
  g.scene.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(g.scene); g.userData.h = box.max.y - box.min.y || 1;
}
const wsV = new THREE.Vector3();
function makeChar(key, height, clips, olW = .03) {
  const tpl = GL[key], root = SkeletonUtils.clone(tpl.scene), k = height / tpl.userData.h; root.scale.setScalar(k);
  const g = new THREE.Group(); g.add(root); const mats = [], meshes = [];
  root.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData.e = o.material.emissive.clone(); mats.push(o.material); o.castShadow = true; o.frustumCulled = false; meshes.push(o); } });
  root.updateMatrixWorld(true); for (const m of meshes) addOutline(m, olW / m.getWorldScale(wsV).x);
  const mixer = new THREE.AnimationMixer(root), acts = {}; for (const c of clips) acts[c.name] = mixer.clipAction(c);
  return { g, root, mixer, acts, mats, cur: null, k };
}
function attach(ch, key, bone) {
  const b = ch.root.getObjectByName(bone); if (!b || !GL[key]) return null; const w = GL[key].scene.clone(true); b.add(w); ch.root.updateMatrixWorld(true);
  const ms = []; w.traverse(o => { if (o.isMesh) ms.push(o); }); for (const o of ms) { o.castShadow = true; addOutline(o, .03 / o.getWorldScale(wsV).x); } return w;
}
function play(ch, name, o = {}) {
  const a = ch.acts && ch.acts[name]; if (!a) return null; const { fade = .18, once = false, speed = 1, force = false } = o;
  if (ch.cur === a) { if (force) { a.reset(); a.timeScale = speed; a.play(); } else a.timeScale = speed; return a; }
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed; a.setEffectiveWeight(1); a.fadeIn(fade).play();
  if (ch.cur) ch.cur.fadeOut(fade); ch.cur = a; return a;
}
function flashMats(mats, on, col = 0xffffff) { for (const m of mats) { if (on) m.emissive.setHex(col); else if (m.userData.e) m.emissive.copy(m.userData.e); else m.emissive.setHex(0); } }
const heroClips = () => GL.warrior.animations, skClips = () => GL.sk_minion.animations;
function makeHeroModel(cls) {
  const ch = makeChar(CLASSES[cls].model, 2.5, heroClips(), .032);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.75, .95, 32), new THREE.MeshBasicMaterial({ color: CLASSES[cls].color, transparent: true, opacity: .7, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .06; ch.g.add(ring); ch.ring = ring;
  return ch;
}
// 귀여운 유령 박쥐 (절차적 모델)
function makeBat() {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner); inner.position.y = 3; const mats = [];
  const tm = c => { const m = toon(c); m.userData.e = new THREE.Color(0); mats.push(m); return m; };
  const bodyM = tm(0x8a5ad8), bellyM = tm(0xe0c4ff), dark = tm(0x5a3a9a);
  mk(new THREE.SphereGeometry(.6, 24, 16), bodyM, 0, 0, 0, inner, .045).scale.set(1, .95, .95);
  mk(new THREE.SphereGeometry(.4, 20, 14), bellyM, 0, -.12, .28, inner, 0).scale.set(1, .9, .6);
  for (const s of [-1, 1]) { const e = mk(new THREE.ConeGeometry(.17, .45, 12), bodyM, s * .3, .6, 0, inner, .035); e.rotation.z = -s * .35;
    mk(new THREE.SphereGeometry(.17, 16, 12), toon(0xffffff), s * .21, .12, .48, inner, .02); mk(new THREE.SphereGeometry(.095, 12, 10), toon(0x1a1028), s * .21, .12, .62, inner, 0);
    mk(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), s * .18, .17, .69, inner, 0);
    mk(new THREE.ConeGeometry(.04, .12, 6), toon(0xffffff), s * .08, -.12, .56, inner, 0).rotation.x = Math.PI;
    mk(new THREE.SphereGeometry(.08, 10, 8), toon(0xff8ab0, { emissive: 0x401020 }), s * .38, -.03, .45, inner, 0).scale.set(1, .6, .4); }
  const sh = new THREE.Shape(); sh.moveTo(0, .1); sh.quadraticCurveTo(.6, .55, 1.45, .45); sh.quadraticCurveTo(1.3, .1, 1.35, -.2); sh.quadraticCurveTo(1.1, -.05, .95, -.25); sh.quadraticCurveTo(.75, -.05, .55, -.25); sh.quadraticCurveTo(.35, -.05, 0, -.15); sh.lineTo(0, .1);
  const wg = new THREE.ExtrudeGeometry(sh, { depth: .05, bevelEnabled: false }); wg.translate(0, 0, -.025);
  const wings = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * .45, .05, -.05); p.scale.x = s; inner.add(p); mk(wg, dark, 0, 0, 0, p, .03); return p; });
  return { g, inner, mats, wings, acts: null, mixer: null };
}
function makeEnemyModel(type) {
  const E = ETYPES[type]; if (E.fly) return makeBat();
  const ch = makeChar(E.model, E.h, skClips(), E.boss ? .05 : .03); attach(ch, E.w, 'handslotr'); if (E.sh) attach(ch, E.sh, 'handslotl');
  ch.root.traverse(o => { if (o.isMesh && !o.userData.ol && /Eyes/.test(o.name)) { o.material.emissive.setHex(E.boss ? 0xff2020 : 0x40d0ff); o.material.emissiveIntensity = E.boss ? 3 : 1.6; o.material.userData.e = o.material.emissive.clone(); } });
  if (E.boss) { const head = ch.root.getObjectByName('head'); if (head) { const cr = new THREE.Group(), gm = glow(0xffc828, .7);
    const band = mk(new THREE.CylinderGeometry(.42, .38, .28, 12, 1, true), gm, 0, 0, 0, cr, .02); band.material.side = THREE.DoubleSide;
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; mk(new THREE.ConeGeometry(.09, .3, 6), gm, Math.cos(a) * .4, .25, Math.sin(a) * .4, cr, .015); mk(new THREE.OctahedronGeometry(.06), glow(0xff3a5a, 2), Math.cos(a) * .41, 0, Math.sin(a) * .41, cr, 0); }
    head.add(cr); ch.crown = cr; ch.root.updateMatrixWorld(true); const ws = head.getWorldScale(wsV).x; cr.scale.setScalar(1.25 / ws); cr.position.y = 1.15 / ws; } }
  return ch;
}

export { GL, loadAssets, play, flashMats, makeHeroModel, makeEnemyModel };
