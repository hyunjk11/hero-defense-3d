import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { $ } from '../core/util.js';
import { CLASSES } from '../data/heroes.js';
import { ETYPES } from '../data/monsters.js';
import { addOutline, glow, grad, mk, toon } from './toon.js';

// ================= 캐릭터 (KayKit glTF, 스켈레탈 애니메이션) =================
const GL = {}; const ASSETS = ['archer_meshy', 'mage_meshy', 'warrior_meshy', 'gunner_meshy', 'mechanic_meshy', 'mech_robot_meshy', 'sk_minion', 'sk_warrior', 'sk_rogue', 'w_axe', 'w_blade', 'w_shield_large_a', 'sk_mage', 'w_shield_large_b'];
async function loadAssets() {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); let n = 0;
  await Promise.all(ASSETS.map(k => loader.loadAsync(`models/${k}.glb`).then(g => { GL[k] = g; prep(g); if (MESHY[k]) lockRoot(g.animations); if (MESHY[k]) extraClips(g.animations, MESHY[k]); $('loadTxt').textContent = `모델 불러오는 중… ${++n}/${ASSETS.length}`; })));
}
function prep(g) {
  g.scene.traverse(o => { if (o.isMesh) { const om = o.material; o.material = new THREE.MeshToonMaterial({ color: om.color ? om.color.clone() : 0xffffff, map: om.map || null, gradientMap: grad }); o.castShadow = true; } });
  g.scene.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(g.scene); g.userData.h = box.max.y - box.min.y || 1;
}
// Meshy 마법사: 루트 모션 잠금 (Hips 위치 트랙의 X/Z를 첫 프레임 값으로 고정, Y는 유지 → 쓰러짐/피격이 제자리에서)
function lockRoot(clips) { for (const c of clips) for (const t of c.tracks) { if (!/Hips\.position$/.test(t.name)) continue; const v = t.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } } }
// 파생 클립: sub = [이름, 원본, 시작초, 끝초] 구간 잘라내기 · mix = [이름, 상체 원본, 하체 원본] (하체=Hips·다리 트랙을 하체 원본에서 가져와 상체 길이에 맞춰 늘림 → 제자리 사격)
const LEG_RE = /^(Hips|.*(UpLeg|Leg|Foot|Toe).*)$/;
function extraClips(list, M) {
  const by = n => list.find(x => x.name === n);
  for (const [n, src, a, b] of M.sub || []) { const c = by(src); if (c) list.push(THREE.AnimationUtils.subclip(c, n, Math.round(a * 30), Math.round(b * 30), 30)); }
  for (const [n, up, lo] of M.mix || []) { const u = by(up), l = by(lo); if (!u || !l) continue; const k = u.duration / l.duration, bone = t => t.name.split('.')[0];
    const tr = [...u.tracks.filter(t => !LEG_RE.test(bone(t))).map(t => t.clone()), ...l.tracks.filter(t => LEG_RE.test(bone(t))).map(t => { const c = t.clone(); c.times = c.times.map(x => x * k); return c; })];
    list.push(new THREE.AnimationClip(n, u.duration, tr)); }
}
// 바인드 포즈에서 오른손 근처(수평 0.35 이내) 정점 중 가장 높은 곳 = 지팡이 끝 수정 → 조금 아래를 발사 지점으로
function staffTop(ch, hp) { let best = null; const v = new THREE.Vector3();
  ch.root.traverse(o => { if (!o.isSkinnedMesh || o.userData.ol) return; const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 2) { o.getVertexPosition(i, v); o.localToWorld(v); if (Math.hypot(v.x - hp.x, v.z - hp.z) < .35 && v.y > hp.y && (!best || v.y > best.y)) best = v.clone(); } });
  return best ? best.add(new THREE.Vector3(0, -.12, 0)) : hp.clone().add(new THREE.Vector3(0, .9, 0)); }
// 바인드 포즈에서 왼손 주변(0.45 이내) 정점들의 중심 = 활 손잡이 근처 → 화살 발사 지점
function bowGrip(ch, hp) { const v = new THREE.Vector3(), c = new THREE.Vector3(); let n = 0;
  ch.root.traverse(o => { if (!o.isSkinnedMesh || o.userData.ol) return; const cnt = o.geometry.attributes.position.count;
    for (let i = 0; i < cnt; i += 2) { o.getVertexPosition(i, v); o.localToWorld(v); if (v.distanceTo(hp) < .45) { c.add(v); n++; } } });
  return n ? c.divideScalar(n) : hp.clone(); }
const MAGE_ALIAS = { Running_A: 'Run', Death_A: 'Death', Cheer: 'IdleLookAround', Spellcast_Shoot: 'Cast', Spellcast_Long: 'CastCharged' };
// Meshy 궁수/전사: 기존 KayKit 동작 이름 → 새 클립. hitAt = 클립 내 타격 시점(초, 오른손 속도 최대 = 칼 휘두름 정점)
const MESHY = {
  mage_meshy: { alias: MAGE_ALIAS },
  archer_meshy: { alias: { Running_A: 'Run', Death_A: 'Death', Cheer: 'IdleLookAround', '2H_Ranged_Shoot': 'Shoot', Ranged_Skill: 'ShootQuick' },
    aim: { Shoot: -2.15, ShootQuick: -1.7, ShootCharged: -1.75 } }, // 사격 클립은 몸이 옆으로 서서 활이 왼쪽(+X)을 겨눔 → 활 방향이 정면(목표)이 되게 모델 회전
  // Meshy 총사 로즈: 쌍권총(왼손·오른손 뼈에 스킨). ShootLoop = Shoot 1.1–2.7초(뽑기 동작 제외) 반복, ShootCharged = 회전 사격(스킬), Flourish = 총 돌리기(선택 화면·승리)
  gunner_meshy: { alias: { Running_A: 'Run', Death_A: 'Death', Cheer: 'Flourish', Melee_Show: 'Flourish' }, sub: [['ShootLoop', 'Shoot', 1.1, 2.7]], mix: [['ShootStand', 'ShootWalk', 'Idle']], aim: { ShootStand: .38, ShootWalk: .58 } }, // 두 총의 평균 조준 방향이 정면(목표)이 되게 모델 회전
  // Meshy 메카닉 버들: 등의 로봇 팔이 팔 뼈에 스킨됨 (오른팔 = 드릴, 왼팔 = 집게 주먹). Drill = 펀치 콤보 구간(다단 히트), Hammer = 해머 스윙 구간(내려찍기)
  mechanic_meshy: { alias: { Running_A: 'Run', Death_A: 'Death', Cheer: 'FistPump', Melee_Show: 'Uppercut' }, sub: [['Drill', 'PunchCombo', .4, 1.9], ['Hammer', 'HammerSwing', .5, 1.75]], arms: 1 },
  // 변신 로봇 (버들 [Q] 변신 중 교체되는 모델). Run = Monster_Walk(느린 거구 걸음) → 빠르게 재생
  mech_robot_meshy: { alias: { Running_A: 'Run', Death_A: 'Hit', Cheer: 'FistPump' }, sub: [['Drill', 'PunchCombo', .4, 1.9], ['Hammer', 'HammerSwing', .5, 1.75], ['Rocket', 'DoublePunch', .2, 1.7], ['StompS', 'Stomp', 0, 1.3]], arms: 1, runSpd: 2.4, h: 4.6 },
  warrior_meshy: { alias: { Running_A: 'Run', Death_A: 'Death', Cheer: 'IdleLookAround', '1H_Melee_Attack_Chop': 'Slash', '1H_Melee_Attack_Slice_Horizontal': 'Slash', '2H_Melee_Attack_Spinning': 'Spin', Melee_Show: 'SlashHeavy' }, hitAt: .53 },
};
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
  if (ch.cur) ch.cur.fadeOut(fade); ch.cur = a; if (ch.aim) ch.yawT = ch.aim[a.getClip().name] || 0; return a;
}
function flashMats(mats, on, col = 0xffffff) { for (const m of mats) { if (on) m.emissive.setHex(col); else if (m.userData.e) m.emissive.copy(m.userData.e); else m.emissive.setHex(0); } }
const heroClips = () => (GL.warrior || GL.warrior_meshy).animations, skClips = () => GL.sk_minion.animations;
function makeHeroModel(cls, key0) {
  const key = key0 || CLASSES[cls].model, M = MESHY[key], ch = makeChar(key, M ? M.h || 2.8 : 2.5, M ? GL[key].animations : heroClips(), .032);
  if (M) { for (const [a, b] of Object.entries(M.alias)) if (ch.acts[b]) ch.acts[a] = ch.acts[b]; // 기존 동작 이름 → 새 클립
    ch.hitAt = M.hitAt || 0; ch.root.updateMatrixWorld(true);
    if (M.aim) { ch.aim = M.aim; ch.yawT = 0; const up = ch.mixer.update.bind(ch.mixer); ch.mixer.update = dt => { ch.root.rotation.y += (ch.yawT - ch.root.rotation.y) * Math.min(1, dt * 16); return up(dt); }; }
    if (key === 'mage_meshy') { const hand = ch.root.getObjectByName('RightHand'); if (hand) { const hp = hand.getWorldPosition(new THREE.Vector3()), tip = new THREE.Object3D();
      tip.position.copy(hand.worldToLocal(staffTop(ch, hp))); hand.add(tip); ch.tip = tip; } } // 지팡이 수정 위치
    else if (key === 'gunner_meshy') gunMuzzles(ch);
    else if (M.arms) mechArms(ch, M);
    else if (key === 'archer_meshy') { const hand = ch.root.getObjectByName('LeftHand'); if (hand) { const tip = new THREE.Object3D(); tip.position.copy(hand.worldToLocal(bowGrip(ch, hand.getWorldPosition(new THREE.Vector3())))); hand.add(tip); ch.tip = tip; } } } // 활 손잡이(왼손에 스킨된 활) = 화살 발사 지점
  if (key0) return ch; // 변신 로봇: 링/색은 본체 것을 사용
  const ring = new THREE.Mesh(new THREE.RingGeometry(.75, .95, 32), new THREE.MeshBasicMaterial({ color: CLASSES[cls].color, transparent: true, opacity: .7, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .06; ch.g.add(ring); ch.ring = ring;
  return ch;
}
// 메카닉 로봇 팔: 바인드 포즈에서 손 주변 정점 중 아래팔 뼈에서 가장 먼 점 = 드릴 끝 / 주먹 끝. 드릴 끝에는 회전하는 가산 드릴 잔상(평소 숨김)
function armTip(ch, hand, fore, rad) { const hp = hand.getWorldPosition(new THREE.Vector3()), fp = fore.getWorldPosition(new THREE.Vector3()), v = new THREE.Vector3(); let best = null, bd = -1;
  ch.root.traverse(o => { if (!o.isSkinnedMesh || o.userData.ol) return; const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 3) { o.getVertexPosition(i, v); o.localToWorld(v); if (v.distanceTo(hp) < rad) { const d = v.distanceTo(fp); if (d > bd) { bd = d; best = v.clone(); } } } });
  return { p: best || hp, axis: (best || hp).clone().sub(fp).normalize() }; }
function mechArms(ch, M) {
  ch.runSpd = M.runSpd || 0; const s = (M.h || 2.8) / 2.8; ch.tips = {};
  for (const [k, hb, fb] of [['drill', 'RightHand', 'RightForeArm'], ['fist', 'LeftHand', 'LeftForeArm']]) { const hand = ch.root.getObjectByName(hb), fore = ch.root.getObjectByName(fb); if (!hand || !fore) continue;
    const t = armTip(ch, hand, fore, .75 * s), o = new THREE.Object3D(); o.position.copy(hand.worldToLocal(t.p.clone())); hand.add(o); ch.tips[k] = o;
    if (k === 'drill') { // 드릴 잔상: 손 로컬에서 드릴 축 방향(+Y)으로 맞춘 원뿔 2겹
      const ws = hand.getWorldScale(wsV).x || .01, q = hand.getWorldQuaternion(new THREE.Quaternion()).invert(), ax = t.axis.clone().applyQuaternion(q).normalize();
      const g = new THREE.Group(); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax); g.scale.setScalar(s / ws); o.add(g);
      const mat = new THREE.MeshBasicMaterial({ color: 0x9aff6a, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, wireframe: true });
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(.26, .75, 10, 3, true).translate(0, -.32, 0), mat), c2 = new THREE.Mesh(new THREE.ConeGeometry(.34, .5, 7, 1, true).translate(0, -.5, 0), mat.clone()); c2.material.color.setHex(0xfff0a0); c2.material.opacity = .4;
      g.add(c1, c2); g.visible = false; ch.drillFx = { g, c1, c2 }; } }
}
// 총구: 각 손 뼈 로컬 (0, 26, -3) (뼈 월드 스케일 0.01, 총열 = 로컬 +Y) + 총구 섬광(가산 별 모양, 평소엔 숨김)
let flashTex = null;
function starTex() { if (flashTex) return flashTex; const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'), c = 64;
  const gr = x.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, '#fff'); gr.addColorStop(.18, 'rgba(255,240,190,.95)'); gr.addColorStop(.45, 'rgba(255,150,80,.35)'); gr.addColorStop(1, 'rgba(255,90,60,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,230,160,.9)'; for (let k = 0; k < 6; k++) { x.save(); x.translate(c, c); x.rotate(k / 6 * Math.PI * 2); x.beginPath(); x.moveTo(-5, 0); x.lineTo(0, -62); x.lineTo(5, 0); x.fill(); x.restore(); }
  return (flashTex = new THREE.CanvasTexture(cv)); }
function gunMuzzles(ch) {
  ch.muz = []; ch.flashes = [];
  for (const bn of ['LeftHand', 'RightHand']) { const hand = ch.root.getObjectByName(bn); if (!hand) continue; const m = new THREE.Object3D(); m.position.set(0, 26, -3); hand.add(m); ch.muz.push(m);
    const ws = hand.getWorldScale(wsV).x || .01, f = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ map: starTex(), color: 0xffd8a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    for (const r of [0, Math.PI / 2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.55, .55), mat); p.rotation.y = r; p.position.y = .12; f.add(p); }
    const disk = new THREE.Mesh(new THREE.PlaneGeometry(.42, .42), mat); disk.rotation.x = Math.PI / 2; f.add(disk); f.scale.setScalar(1 / ws); f.visible = false; m.add(f); ch.flashes.push({ g: f, t: 0, s: 1 / ws, mat }); }
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
  if (E.tint) { const tc = new THREE.Color(E.tint); ch.mats.forEach(m => m.color.multiply(tc)); }
  if (E.prop) addProp(ch, E.prop, E);
  ch.root.traverse(o => { if (o.isMesh && !o.userData.ol && /Eyes/.test(o.name)) { o.material.emissive.setHex(E.boss ? 0xff2020 : E.eye || 0x40d0ff); o.material.emissiveIntensity = E.boss ? 3 : 1.6; o.material.userData.e = o.material.emissive.clone(); } });
  if (E.boss) { const head = ch.root.getObjectByName('head'); if (head) { const cr = new THREE.Group(), gm = glow(0xffc828, .7);
    const band = mk(new THREE.CylinderGeometry(.42, .38, .28, 12, 1, true), gm, 0, 0, 0, cr, .02); band.material.side = THREE.DoubleSide;
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; mk(new THREE.ConeGeometry(.09, .3, 6), gm, Math.cos(a) * .4, .25, Math.sin(a) * .4, cr, .015); mk(new THREE.OctahedronGeometry(.06), glow(0xff3a5a, 2), Math.cos(a) * .41, 0, Math.sin(a) * .41, cr, 0); }
    head.add(cr); ch.crown = cr; ch.root.updateMatrixWorld(true); const ws = head.getWorldScale(wsV).x; cr.scale.setScalar(1.25 / ws); cr.position.y = 1.15 / ws; } }
  return ch;
}

// ---- 신규 몬스터 소품 (절차적, 뼈에 부착; 크기/방향은 월드 기준으로 지정) ----
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
function attachProp(ch, bone, obj, off = [0, 0, 0]) {
  const b = ch.root.getObjectByName(bone); if (!b) return null; ch.root.updateMatrixWorld(true);
  const ws = b.getWorldScale(_v).x; b.getWorldQuaternion(_q).invert(); obj.quaternion.copy(_q); obj.scale.setScalar(1 / ws);
  obj.position.set(off[0], off[1], off[2]).applyQuaternion(_q).multiplyScalar(1 / ws); b.add(obj); return obj;
}
const propMats = {}; const pm = (k, f) => propMats[k] || (propMats[k] = f());
function addProp(ch, kind, E) {
  const s = E.h / 2;
  if (kind === 'pickaxe') { // 곡괭이 + 광부 헬멧(램프)
    const g = new THREE.Group(), wood = pm('wood', () => toon(0x9a6a3a)), iron = pm('iron', () => toon(0x8a94a8));
    mk(new THREE.CylinderGeometry(.05, .06, 1.2, 8), wood, 0, .5, 0, g, .02);
    const head = new THREE.Group(); head.position.y = 1.08; g.add(head);
    for (const sx of [-1, 1]) { const c = mk(new THREE.ConeGeometry(.08, .55, 8), iron, sx * .27, -.04, 0, head, .02); c.rotation.z = sx * -1.75; }
    mk(new THREE.BoxGeometry(.16, .16, .14), iron, 0, 0, 0, head, .02);
    attachProp(ch, 'handslotr', g, [0, 0, 0]); g.scale.multiplyScalar(s * .9); ch.pick = g;
    const hel = new THREE.Group(); mk(new THREE.SphereGeometry(.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), pm('hel', () => toon(0xffc020)), 0, 0, 0, hel, .02);
    mk(new THREE.CylinderGeometry(.47, .47, .05, 16), pm('hel', () => toon(0xffc020)), 0, 0, 0, hel, .015);
    const lamp = mk(new THREE.CylinderGeometry(.09, .11, .1, 10), glow(0xfff2a0, 2.5), 0, .17, .4, hel, .01); lamp.rotation.x = Math.PI / 2;
    attachProp(ch, 'head', hel, [0, .55 * s, .02]); hel.scale.multiplyScalar(s * 1.05); }
  if (kind === 'horns') { // 돌격병: 붉은 뿔
    const g = new THREE.Group(), hm = pm('horn', () => toon(0xff5a3a, { emissive: 0x401008 }));
    for (const sx of [-1, 1]) { const c = mk(new THREE.ConeGeometry(.09, .5, 8), hm, sx * .3, .25, .1, g, .02); c.rotation.set(.6, 0, -sx * .7); }
    attachProp(ch, 'head', g, [0, .35 * s, 0]); g.scale.multiplyScalar(s * 1.1); }
  if (kind === 'plume') { // 방패병: 파란 깃털 장식
    const g = new THREE.Group(); const p = mk(new THREE.SphereGeometry(.16, 12, 10), pm('plume', () => toon(0x3a7aff, { emissive: 0x0a1a50 })), 0, .25, -.05, g, .02); p.scale.set(.6, 1.6, 1.8);
    attachProp(ch, 'head', g, [0, .5 * s, 0]); g.scale.multiplyScalar(s * 1.1); }
  if (kind === 'bomb') { // 자폭병: 등에 큰 폭탄, 손에 작은 폭탄, 깜빡이는 심지
    const mk1 = (r) => { const g = new THREE.Group(); mk(new THREE.SphereGeometry(r, 18, 14), pm('bomb', () => toon(0x26262e)), 0, 0, 0, g, .03);
      mk(new THREE.CylinderGeometry(r * .3, r * .3, r * .25, 10), pm('cap', () => toon(0x8a8a9a)), 0, r * .95, 0, g, .015);
      const fuse = mk(new THREE.CylinderGeometry(.025, .025, r * .5, 6), pm('wood', () => toon(0x9a6a3a)), 0, r * 1.25, 0, g, 0);
      const spark = mk(new THREE.SphereGeometry(r * .18, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc040).multiplyScalar(3), toneMapped: false }), 0, r * 1.55, 0, g, 0); return [g, spark]; };
    const [back, sp1] = mk1(.42); attachProp(ch, 'chest', back, [0, .1 * s, -.42 * s]); back.scale.multiplyScalar(s);
    const [hand, sp2] = mk1(.2); attachProp(ch, 'handslotr', hand, [0, .1, 0]); hand.scale.multiplyScalar(s); ch.sparks = [sp1, sp2]; }
  if (kind === 'ram') { // 공성병: 쇠 머리가 달린 공성 망치 (가슴 앞, 몸 방향으로)
    const g = new THREE.Group(), wood = pm('logw', () => toon(0x8a5a2a)), iron = pm('iron', () => toon(0x8a94a8));
    const log = mk(new THREE.CylinderGeometry(.2, .22, 2.0, 12), wood, 0, 0, 0, g, .025); log.rotation.x = Math.PI / 2;
    for (const z of [-.6, .3]) { const b = mk(new THREE.TorusGeometry(.22, .05, 6, 16), iron, 0, 0, z, g, .015); }
    const hd = mk(new THREE.CylinderGeometry(.3, .25, .35, 12), iron, 0, 0, 1.1, g, .025); hd.rotation.x = Math.PI / 2;
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.28, c = mk(new THREE.ConeGeometry(.07, .25, 6), iron, Math.cos(a) * .18, Math.sin(a) * .18, 1.35, g, .01); c.rotation.x = Math.PI / 2; }
    attachProp(ch, 'chest', g, [0, -.15 * s, .55 * s]); g.scale.multiplyScalar(s * .75); ch.ram = g; }
}

export { GL, MESHY, loadAssets, play, flashMats, makeHeroModel, makeEnemyModel };
