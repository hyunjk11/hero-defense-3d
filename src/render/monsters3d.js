// 챕터 몬스터 모델: 절차적 늑대/슬라임/서리 정령 + 해골 모델용 소품(고블린 귀, 버섯 갓, 나무껍질, 설인 털, 얼음 결정)
// 절차적 모델은 { g, inner, mats, anim(e, dt) } — 스켈레탈 믹서 대신 anim 이 걷기/파기/죽기 동작을 만든다
import * as THREE from 'three';
import { glow, mk, toon } from './toon.js';

const GEO = {}; const geo = (k, f) => GEO[k] || (GEO[k] = f()); // 공유 지오메트리 (몬스터마다 새로 만들지 않음)
const SPH = (r, a = 18, b = 12) => geo(`s${r}_${a}`, () => new THREE.SphereGeometry(r, a, b));
const CONE = (r, h, n = 10) => geo(`c${r}_${h}`, () => new THREE.ConeGeometry(r, h, n));
const CYL = (a, b, h, n = 10) => geo(`y${a}_${b}_${h}`, () => new THREE.CylinderGeometry(a, b, h, n));
const OCT = r => geo(`o${r}`, () => new THREE.OctahedronGeometry(r));
const TOR = (r, t) => geo(`t${r}_${t}`, () => new THREE.TorusGeometry(r, t, 6, 32));
const sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

function matSet() { const mats = []; const tm = (c, o) => { const m = toon(c, o); m.userData.e = m.emissive.clone(); mats.push(m); return m; }; return { mats, tm }; }
// 걷기 속도 추정 (위치 변화) — 상태와 무관하게 실제로 움직인 만큼 다리/통통 튀기
function moveSpeed(m, e, dt) { const p = e.g.position, l = m.last || (m.last = p.clone()); const v = dt > 0 ? Math.hypot(p.x - l.x, p.z - l.z) / dt : 0; l.copy(p); m.v += (Math.min(8, v) - m.v) * Math.min(1, dt * 10); return m.v; }

// 파란 발밑 고리 (서리늑대 무리 강화 표시)
function packRing(g, r, color = 0x6ad0ff) { const m = new THREE.Mesh(TOR(r, .05), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .08; m.visible = false; g.add(m); return m; }

// ---- 늑대 (숲늑대/서리늑대/용암 사냥개) ----
export function makeWolf(E) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner); const { mats, tm } = matSet(), s = E.h / 1.35;
  const fur = new THREE.Color(E.fur), furM = tm(fur.getHex()), belly = tm(fur.clone().lerp(new THREE.Color(0xffffff), .45).getHex()), dark = tm(fur.clone().multiplyScalar(.45).getHex()), nose = tm(0x1a1420);
  const eyeC = E.eye || 0xffd040; const eyeM = glow(eyeC, 1.8); eyeM.userData.e = eyeM.emissive.clone(); mats.push(eyeM);
  inner.scale.setScalar(s);
  const body = mk(SPH(.38), furM, 0, .74, -.02, inner, .035); body.scale.set(1, .85, 1.65);
  mk(SPH(.34), belly, 0, .8, .32, inner, .03).scale.set(1.05, 1.05, .9); // 가슴 털
  const head = new THREE.Group(); head.position.set(0, 1.0, .62); inner.add(head);
  mk(SPH(.27), furM, 0, 0, 0, head, .03).scale.set(1, .9, 1.05);
  mk(SPH(.15), belly, 0, -.08, .25, head, .025).scale.set(.95, .75, 1.6); mk(SPH(.06, 10, 8), nose, 0, -.02, .48, head, 0);
  for (const sx of [-1, 1]) { const ear = mk(CONE(.09, .26, 8), dark, sx * .15, .25, -.04, head, .02); ear.rotation.z = -sx * .25; mk(SPH(.05, 10, 8), eyeM, sx * .12, .06, .2, head, 0); }
  // 서리늑대: 등의 얼음 갈기
  if (E.ab && E.ab.pack) for (let k = 0; k < 4; k++) { const c = mk(CONE(.06, .28, 6), pm('mane', () => glow(0xbff4ff, .6)), 0, 1.04 - k * .03, .25 - k * .2, inner, .015); c.rotation.x = -.5; }
  const tail = new THREE.Group(); tail.position.set(0, .86, -.58); inner.add(tail); const tc = mk(CONE(.1, .55, 8), furM, 0, 0, -.25, tail, .025); tc.rotation.x = -Math.PI / 2 - .5;
  const legs = []; for (const [x, z] of [[-.2, .36], [.2, .36], [-.2, -.38], [.2, -.38]]) { const p = new THREE.Group(); p.position.set(x, .58, z); inner.add(p);
    mk(CYL(.075, .06, .5, 8), x < 0 ? furM : furM, 0, -.25, 0, p, .025); mk(SPH(.08, 10, 8), dark, 0, -.52, .03, p, .015); legs.push(p); }
  const m = { g, inner, mats, mixer: null, acts: null, legs, head, tail, v: 0, ph: 0, proc: 'wolf' };
  if (E.ab && E.ab.pack) m.ring = packRing(g, .8 * s, E.ringC);
  m.anim = (e, dt) => { const v = moveSpeed(m, e, dt), a = Math.min(1, v / 2.5);
    if (e.dying !== undefined) { const d = sm((1.6 - e.dying) / .5); inner.rotation.z = d * 1.45; inner.position.y = d * .15 * s; legs.forEach((l, i) => l.rotation.x = d * (i % 2 ? .4 : -.4)); if (m.ring) m.ring.visible = false; return; }
    m.ph += dt * (3 + v * 2.2); const sw = Math.sin(m.ph) * .75 * a;
    legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
    inner.position.y = Math.abs(Math.sin(m.ph)) * .07 * a * s; tail.rotation.y = Math.sin(G_t() * 6 + e.bob) * .4;
    if (e.digging) { const k = Math.sin(G_t() * 18); head.rotation.x = .45 + k * .2; legs[0].rotation.x = -.9 + k * .6; legs[1].rotation.x = -.9 - k * .6; inner.rotation.x = .12; }
    else { head.rotation.x = Math.sin(m.ph * 2) * .05; inner.rotation.x = 0; }
    if (m.ring) { m.ring.visible = !!e.packOn; if (e.packOn) { m.ring.rotation.z += dt * 2; m.ring.material.opacity = .55 + Math.sin(G_t() * 8) * .3; } } };
  return m;
}
const G_t = () => (window.G ? window.G.t : 0);

// ---- 슬라임 (분열) ----
export function makeSlime(E) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner); const { mats, tm } = matSet(), r = E.h * .45;
  const body = tm(E.col, { emissive: new THREE.Color(E.col).multiplyScalar(.12) }); body.userData.e = body.emissive.clone();
  const blob = mk(SPH(.5, 28, 18), body, 0, .5, 0, inner, .035); blob.scale.set(1.1, .95, 1.05);
  mk(SPH(.32, 16, 12), tm(new THREE.Color(E.col).multiplyScalar(.6).getHex()), 0, .45, 0, inner, 0).scale.set(1, .8, 1); // 속 (겉 뒤에 가려 외곽선 없음)
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff }); mk(SPH(.09, 10, 8), shine, -.22, .82, .28, inner, 0).scale.set(1.3, .8, .6);
  const eyeM = tm(0x1a1428); for (const sx of [-1, 1]) { mk(SPH(.09, 12, 10), eyeM, sx * .17, .6, .46, inner, 0).scale.set(1, 1.35, .6); mk(SPH(.03, 8, 6), shine, sx * .15, .65, .51, inner, 0); }
  mk(SPH(.05, 8, 6), tm(0xff8aa0), 0, .45, .52, inner, 0).scale.set(1.6, .5, .5); // 입
  inner.scale.setScalar(r / .5);
  const m = { g, inner, blob, mats, mixer: null, acts: null, v: 0, ph: Math.random() * 6, proc: 'slime' };
  m.anim = (e, dt) => { const v = moveSpeed(m, e, dt), a = Math.min(1, v / 1.5), k = r / .5;
    if (e.dying !== undefined) { const d = sm((1.6 - e.dying) / .5); inner.scale.set(k * (1 + d * .6), k * Math.max(.08, 1 - d * .92), k * (1 + d * .6)); inner.position.y = 0; return; }
    m.ph += dt * (e.digging ? 14 : 4 + v * 1.4); const h = Math.abs(Math.sin(m.ph)), sq = e.digging ? Math.sin(m.ph) * .15 : (h < .25 ? (.25 - h) * .9 : -h * .08) * Math.max(a, .3);
    inner.scale.set(k * (1 + sq * .6), k * (1 - sq), k * (1 + sq * .6)); inner.position.y = e.digging ? 0 : h * .35 * a * k; inner.rotation.x = e.digging ? Math.sin(m.ph) * .2 : 0; };
  return m;
}

// ---- 서리 정령 (비행, 박쥐와 같은 인터페이스: inner.y = 비행 높이, wings[2]) ----
export function makeWisp(E) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner); inner.position.y = 3; const { mats, tm } = matSet();
  const coreM = glow(0xbff4ff, 1.4); coreM.userData.e = coreM.emissive.clone(); mats.push(coreM);
  const bodyM = tm(0xe8f8ff, { emissive: new THREE.Color(0x3a8ac8), emissiveIntensity: .6 }); bodyM.userData.e = bodyM.emissive.clone();
  mk(SPH(.42, 22, 16), bodyM, 0, 0, 0, inner, .035).scale.set(1, 1.05, 1);
  mk(OCT(.2), coreM, 0, 0, 0, inner, 0).scale.set(1, 1.3, 1);
  const tail = mk(CONE(.3, .7, 12), bodyM, 0, -.5, -.05, inner, .03); tail.rotation.x = Math.PI + .25;
  const eyeM = tm(0x1a2a4a); for (const sx of [-1, 1]) mk(SPH(.07, 10, 8), eyeM, sx * .15, .08, .38, inner, 0).scale.set(1, 1.4, .6);
  const crys = glow(0x8ae0ff, 1.1); crys.userData.e = crys.emissive.clone(); mats.push(crys);
  const wings = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * .45, .05, -.05); inner.add(p); const c = mk(OCT(.18), crys, sx * .25, .1, 0, p, .02); c.scale.set(1.6, .5, .9); c.rotation.z = sx * .4; return p; });
  const orbit = new THREE.Group(); inner.add(orbit); for (let k = 0; k < 3; k++) { const a = k / 3 * 6.28, c = mk(OCT(.1), crys, Math.cos(a) * .72, 0, Math.sin(a) * .72, orbit, .015); c.scale.y = 1.8; }
  const m = { g, inner, mats, wings, orbit, mixer: null, acts: null, proc: 'wisp', coreM };
  m.anim = (e, dt) => { orbit.rotation.y += dt * 2.2; orbit.rotation.z = Math.sin(G_t() * 1.3) * .3; const pulse = e.castT > 0 ? 3 : 1.4 + Math.sin(G_t() * 5 + e.bob) * .3; if (!(e.flash > 0)) coreM.emissiveIntensity = pulse; };
  return m;
}

// ---- 해골 모델 소품 ----
const pmC = {}; const pm = (k, f) => pmC[k] || (pmC[k] = f());
export function extraProp(ch, kind, E, attachProp) {
  const s = E.h / 2;
  if (kind === 'ears') { // 고블린: 커다란 뾰족 귀 + 매부리코
    const g = new THREE.Group(), sk = pm('gob', () => toon(0x7ad04a));
    for (const sx of [-1, 1]) { const c = mk(CONE(.11, .6, 8), sk, sx * .42, .05, 0, g, .02); c.rotation.z = sx * 1.75; c.scale.z = .45; }
    const n = mk(CONE(.07, .26, 8), sk, 0, -.1, .4, g, .015); n.rotation.x = Math.PI / 2 + .4;
    attachProp(ch, 'head', g, [0, .3 * s, 0]); g.scale.multiplyScalar(s * 1.1); }
  if (kind === 'shroom') { // 버섯 주술사: 머리 위 큰 버섯 갓 (회복 직전 초록빛으로 부풀어 오름 = ch.cap)
    const g = new THREE.Group(), capM = toon(0xe0402a); capM.userData.e = capM.emissive.clone(); ch.mats.push(capM); ch.capMat = capM;
    const cap = mk(geo('cap', () => new THREE.SphereGeometry(.62, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2)), capM, 0, .1, 0, g, .03); cap.scale.y = .75;
    mk(CYL(.6, .6, .06, 22), pm('gill', () => toon(0xf4e0c0)), 0, .1, 0, g, .015);
    const dot = pm('dot', () => toon(0xfff8f0)); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + .3, rr = k ? .4 : 0, y = k ? .38 : .5; const d = mk(SPH(.09, 10, 8), dot, Math.cos(a) * rr, y, Math.sin(a) * rr, g, 0); d.scale.y = .45; d.lookAt(Math.cos(a) * rr * 3, y + 1, Math.sin(a) * rr * 3); }
    attachProp(ch, 'head', g, [0, .62 * s, 0]); g.scale.multiplyScalar(s * 1.05); ch.cap = g; }
  if (kind === 'treant') { // 고목 정령: 잎 왕관 + 나뭇가지 뿔 + 나무껍질 어깨
    const leaf = pm('leaf', () => toon(0x4aa83a)), leaf2 = pm('leaf2', () => toon(0x6ac84a)), bark = pm('bark', () => toon(0x6a4a2a)), moss = pm('moss', () => toon(0x8ad06a));
    const crown = new THREE.Group(); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28, l = mk(SPH(.24, 12, 10), k % 2 ? leaf : leaf2, Math.cos(a) * .32, .12 + (k % 3) * .05, Math.sin(a) * .32, crown, .02); l.scale.set(1, .7, 1); }
    mk(SPH(.3, 14, 10), leaf2, 0, .3, 0, crown, .02).scale.set(1, .7, 1);
    for (const sx of [-1, 1]) { const b = mk(CYL(.04, .07, .6, 6), bark, sx * .3, .45, -.05, crown, .015); b.rotation.z = -sx * .7; const b2 = mk(CYL(.03, .04, .3, 6), bark, sx * .5, .72, -.05, crown, .012); b2.rotation.z = -sx * .2; mk(SPH(.1, 8, 6), leaf, sx * .52, .9, -.05, crown, .012); }
    attachProp(ch, 'head', crown, [0, .5 * s, 0]); crown.scale.multiplyScalar(s * 1.1);
    const sh = new THREE.Group(); for (const sx of [-1, 1]) { const p = mk(geo('barkB', () => new THREE.BoxGeometry(.42, .2, .46)), bark, sx * .42, .35, 0, sh, .025); p.rotation.z = sx * .35; mk(SPH(.13, 10, 8), moss, sx * .46, .48, .05, sh, .015).scale.y = .5; }
    attachProp(ch, 'chest', sh, [0, .1 * s, 0]); sh.scale.multiplyScalar(s); }
  if (kind === 'yeti') { // 설인: 머리·어깨를 덮는 흰 털 뭉치 + 작은 뿔, 손에 눈덩이(던지기 직전에만 보임 = ch.snowball)
    const fur = pm('yfur', () => toon(0xf8fbff)), horn = pm('yhorn', () => toon(0x9aa8c0));
    const h = new THREE.Group(); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28, f = mk(SPH(.26, 12, 10), fur, Math.cos(a) * .3, .05 + (k % 2) * .08, Math.sin(a) * .3 - .05, h, .02); f.scale.set(1, .8, 1); }
    for (const sx of [-1, 1]) { const c = mk(CONE(.08, .36, 8), horn, sx * .28, .35, 0, h, .02); c.rotation.z = -sx * .5; }
    attachProp(ch, 'head', h, [0, .35 * s, 0]); h.scale.multiplyScalar(s * 1.05);
    const sh = new THREE.Group(); for (let k = 0; k < 7; k++) { const a = (k / 6 - .5) * 3.4, f = mk(SPH(.28, 12, 10), fur, Math.sin(a) * .5, .3 + Math.cos(a) * .05, Math.cos(a) * .15 - .05, sh, .02); f.scale.set(1, .75, 1); }
    attachProp(ch, 'chest', sh, [0, .15 * s, 0]); sh.scale.multiplyScalar(s);
    const ball = mk(SPH(.3, 16, 12), pm('snow', () => toon(0xffffff, { emissive: 0x8ac8ff, emissiveIntensity: .35 })), 0, 0, 0, null, .02); attachProp(ch, 'handslotr', ball, [0, .15, 0]); ball.scale.multiplyScalar(s * .9); ball.visible = false; ch.snowball = ball; }
  if (kind === 'ice') { // 서리 골렘·빙결의 군주: 어깨·등·머리의 얼음 결정 (갑옷이 깨지면 사라짐 = ch.iceParts)
    const im = toon(E.crystal ? E.crystal[0] : 0xc8f0ff, { emissive: E.crystal ? E.crystal[1] : 0x3aa8ff, emissiveIntensity: 1 }); /* 화산: 굳은 용암 껍질(E.crystal) */ im.userData.e = im.emissive.clone(); ch.mats.push(im); ch.iceMat = im; ch.iceParts = [];
    const add = (bone, pts, sc) => { const g = new THREE.Group(); for (const [x, y, z, rx, rz, l] of pts) { const c = mk(OCT(.16), im, x, y, z, g, .02); c.scale.set(.8, l, .8); c.rotation.set(rx, 0, rz); } attachProp(ch, bone, g, [0, sc[0] * s, sc[1] * s]); g.scale.multiplyScalar(s * (E.boss ? 1.35 : 1.15)); ch.iceParts.push(g); };
    add('chest', [[-.45, .4, 0, 0, .5, 2.2], [-.55, .25, -.1, .3, .9, 1.6], [.45, .4, 0, 0, -.5, 2.2], [.55, .25, -.1, .3, -.9, 1.6], [0, .2, -.4, -.7, 0, 2.6], [-.2, .1, -.42, -.9, .3, 1.8], [.2, .1, -.42, -.9, -.3, 1.8]], [.1, 0]);
    add('head', [[0, .3, 0, 0, 0, 1.8], [-.22, .2, 0, 0, .5, 1.3], [.22, .2, 0, 0, -.5, 1.3]], [.35, 0]); }
}
