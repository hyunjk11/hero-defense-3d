import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { $ } from '../core/util.js';
import { CLASSES, HERO_KEYS, HIDDEN_HEROES, isHidden } from '../data/heroes.js';
import { ETYPES } from '../data/monsters.js';
import { addOutline, glow, grad, mk, shareGeo, toon } from './toon.js';
import { makeWolf, makeSlime, makeWisp, extraProp } from './monsters3d.js';

// ================= 캐릭터 (KayKit glTF, 스켈레탈 애니메이션) =================
const GL = {}; const ALL_ASSETS = ['archer_meshy', 'mage_meshy', 'warrior_meshy', 'gunner_meshy', 'budeul_meshy', 'budeul_gear', 'mech_robot_meshy', 'sk_minion', 'sk_warrior', 'sk_rogue', 'w_axe', 'w_blade', 'w_shield_large_a', 'sk_mage', 'w_shield_large_b', 'rose_rifle_meshy', 'rose_rifle_gun', 'seoyun_meshy'];
// 지연 로딩 (P-2): 모델은 키마다 한 번만 불러옴(LOADING 에 promise 캐시). 필요한 것만 먼저(loadAssets(keys)) → 나머지는 loadBackground 로 하나씩 (판 중 버벅임 방지)
// 몬스터: 모든 챕터가 같은 해골 모델 4개 + 무기 4개(약 1.9MB)를 공유 → '현재 챕터 몬스터' = MON_ASSETS 전체
const MON_ASSETS = [...new Set(Object.values(ETYPES).flatMap(E => [E.model, E.w, E.sh]).filter(k => k && ALL_ASSETS.includes(k)))];
// 영웅에 필요한 모델: 몸 + (버들) 장비. robot=true 면 변신 로봇까지 (판에서 영웅 생성 시 mechInit 이 바로 만듦)
const heroAssets = (cls, robot = false) => { const k = CLASSES[cls] && CLASSES[cls].model; if (!k) return []; return cls === 'mechanic' ? [k, 'budeul_gear', ...(robot ? ['mech_robot_meshy'] : [])] : [k]; };
// 숨긴 영웅(data/heroes.js hidden)의 모델은 불러오지 않음 — ASSETS = 실제로 불러올 수 있는 전체 목록
const HIDDEN_ASSETS = [...HIDDEN_HEROES].flatMap(c => heroAssets(c, true)).filter(k => !HERO_KEYS.some(h => !isHidden(h) && heroAssets(h, true).includes(k)));
const ASSETS = ALL_ASSETS.filter(k => !HIDDEN_ASSETS.includes(k));
const LOADING = {}; let loader = null;
function loadModel(k) {
  if (LOADING[k]) return LOADING[k]; if (HIDDEN_ASSETS.includes(k)) return Promise.reject(new Error('숨긴 영웅 모델: ' + k)); if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); }
  return (LOADING[k] = loader.loadAsync(`models/${k}.glb`).then(g => { prep(g); if (MESHY[k]) lockRoot(g.animations); if (MESHY[k]) extraClips(g.animations, MESHY[k]); GL[k] = g; for (let i = WAIT.length - 1; i >= 0; i--) if (modelsReady(WAIT[i][0])) { WAIT[i][1](); WAIT.splice(i, 1); } return g; })
    .catch(e => { delete LOADING[k]; if (!FALLBACK[k]) throw e; // 대체 모델 (안정성 우선): 격투가 몸을 못 받으면 세라 몸 + 절차적 고양이 귀 후드·주황 색조 (makeHeroModel)
      console.warn('model fallback', k, '→', FALLBACK[k], e); return loadModel(FALLBACK[k]).then(g => { FB[k] = FALLBACK[k]; GL[k] = g; G_FB.push(k); return g; }); }));
}
// 대체 모델 표 (지연 로딩 실패 시). FB[k] = 실제로 쓰인 대체 키, G_FB = 테스트용 목록
const FALLBACK = { seoyun_meshy: 'warrior_meshy' }, FB = {}, G_FB = (globalThis.__hd3dModelFallback = []);
const modelsReady = keys => keys.every(k => GL[k]);
// 불러오기를 새로 시작하지 않고, (백그라운드 등으로) 다 도착하면 resolve — 영웅 단상처럼 '있으면 보여 주기'용
const WAIT = []; const whenModels = keys => modelsReady(keys) ? Promise.resolve() : new Promise(r => WAIT.push([keys, r]));
const ensureModels = keys => Promise.all([...new Set(keys)].map(loadModel));
async function loadAssets(keys = ASSETS) {
  keys = [...new Set(keys)]; let n = 0; const tx = $('loadTxt');
  await Promise.all(keys.map(k => loadModel(k).then(() => { if (tx) tx.textContent = `모델 불러오는 중… ${++n}/${keys.length}`; })));
}
// 백그라운드: 순서대로 하나씩 (실패해도 계속, 필요할 때 ensureModels 가 다시 시도)
async function loadBackground(keys) { for (const k of keys) { if (GL[k]) continue; try { await loadModel(k); } catch (e) { console.warn('bg model', k, e); } } return true; }
function prep(g) {
  g.scene.traverse(o => { if (o.isMesh) { const om = o.material; o.material = new THREE.MeshToonMaterial({ color: om.color ? om.color.clone() : 0xffffff, map: om.map || null, gradientMap: grad }); o.castShadow = true; shareGeo(o.geometry); } });
  g.scene.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(g.scene); g.userData.h = box.max.y - box.min.y || 1;
}
// Meshy 마법사: 루트 모션 잠금 (Hips 위치 트랙의 X/Z를 첫 프레임 값으로 고정, Y는 유지 → 쓰러짐/피격이 제자리에서)
function lockRoot(clips) { for (const c of clips) for (const t of c.tracks) { if (!/Hips\.position$/.test(t.name)) continue; const v = t.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } } }
// 파생 클립: sub = [이름, 원본, 시작초, 끝초] 구간 잘라내기 · mix = [이름, 상체 원본, 하체 원본] (하체=Hips·다리 트랙을 하체 원본에서 가져와 상체 길이에 맞춰 늘림 → 제자리 사격)
const LEG_RE = /^(Hips|.*(UpLeg|Leg|Foot|Toe).*)$/;
function extraClips(list, M) {
  const by = n => list.find(x => x.name === n);
  // yaw: 몸 전체가 옆으로 서 있는 클립 → Hips 회전 키 전체에 Y축 회전(도)을 미리 곱해 정면으로 (루트를 돌리는 방식이 아니라 데이터 보정)
  for (const [n, deg] of Object.entries(M.yaw || {})) { const c = by(n); if (!c) continue; const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg * Math.PI / 180), q = new THREE.Quaternion();
    for (const t of c.tracks) if (t.name === 'Hips.quaternion') { const v = t.values; for (let i = 0; i < v.length; i += 4) { q.fromArray(v, i).premultiply(qy); q.toArray(v, i); } } }
  for (const [n, src, a, b] of M.sub || []) { const c = by(src); if (c) list.push(THREE.AnimationUtils.subclip(c, n, Math.round(a * 30), Math.round(b * 30), 30)); }
  for (const [n, up, lo] of M.mix || []) { const u = by(up), l = by(lo); if (!u || !l) continue; const k = u.duration / l.duration, bone = t => t.name.split('.')[0];
    const tr = [...u.tracks.filter(t => !LEG_RE.test(bone(t))).map(t => t.clone()), ...l.tracks.filter(t => LEG_RE.test(bone(t))).map(t => { const c = t.clone(); c.times = c.times.map(x => x * k); return c; })];
    list.push(new THREE.AnimationClip(n, u.duration, tr)); }
  // graft = [이름, 바탕 클립, 자세 클립, 뼈 정규식]: 바탕 클립을 복제하고 정규식에 맞는 뼈의 회전을 자세 클립 첫 프레임 값으로 고정 (소총 로즈: 숨쉬는 대기/달리기 몸 + 소총 든 팔)
  for (const [n, base, src, re] of M.graft || []) { const b = by(base), sc = by(src); if (!b || !sc) continue; const R = new RegExp(re);
    list.push(new THREE.AnimationClip(n, b.duration, b.tracks.map(t => { const bn = t.name.split('.')[0]; if (!R.test(bn) || !/quaternion$/.test(t.name)) return t.clone(); const st = sc.tracks.find(x => x.name === t.name); if (!st) return t.clone();
      const v = st.values.slice(0, 4); return new THREE.QuaternionKeyframeTrack(t.name, [0, b.duration], [...v, ...v]); }))); }
  // calm: 지정 클립의 지정 뼈 회전을 기준 자세(ref 클립 첫 프레임, 없으면 자기 첫 프레임) 쪽으로 k만큼 당김
  for (const C of M.calm || []) { const q = new THREE.Quaternion(), q0 = new THREE.Quaternion(), K = C.k, R = C.ref && by(C.ref);
    for (const c of list) { if (!C.clips.includes(c.name)) continue; c.tracks = c.tracks.map(t => { const bn = t.name.split('.')[0]; if (!C.bones.includes(bn) || !/quaternion$/.test(t.name)) return t;
      const rt = R && R.tracks.find(x => x.name === t.name), v = t.values.slice(); q0.fromArray(rt ? rt.values : v, 0); for (let i = 0; i < v.length; i += 4) { q.fromArray(v, i).slerp(q0, K); q.toArray(v, i); } const nt = t.clone(); nt.values = v; return nt; }); } }
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
  // Meshy 메카닉 버들 (몸만 리깅 · 등의 로봇 팔/백팩은 별도 강체 모델 budeul_gear → Spine02 뼈에 고정, 팔은 어깨 관절에서 절차적으로 회전 = 스킨 변형·늘어남 없음)
  // 몸 클립은 위치 트랙(Hips 제외)·스케일 트랙을 모델 파일에서 제거함. Drill/Hammer = 몸이 로봇 팔을 지휘하는 짧은 동작 구간
  budeul_meshy: { alias: { Idle: 'IdleAlt', Running_A: 'Run', Death_A: 'Death', Cheer: 'FistPump', Melee_Show: 'CheerUp' }, yaw: { IdleAlt: 25, Hit: 59, Combat: 52, Idle5: 52 }, sub: [['Drill', 'DoublePunch', .75, 2.15], ['Hammer', 'FistPump', .05, 1.25]], hamHit: .46, gear: 1, // 해머 = 주먹 들어 올렸다 내려치기(0.4초 정점 → 0.5초 내림)와 로봇 주먹 내려찍기 동기
    calm: [{ clips: ['Drill', 'Hammer', 'FistPump', 'CheerUp', 'Uppercut'], bones: ['Spine', 'Spine01', 'Spine02', 'neck', 'Head'], k: .65, ref: 'IdleAlt' }, { clips: ['Hit', 'Run'], bones: ['Spine01', 'Spine02', 'neck', 'Head'], k: .45, ref: 'IdleAlt' },
      { clips: ['Drill', 'Hammer', 'FistPump', 'Hit'], bones: ['neck', 'Head'], k: .8, ref: 'IdleAlt' }, { clips: ['Drill'], bones: ['Hips'], k: .6, ref: 'IdleAlt' }] }, // 목·머리는 한 번 더 당김 → 공격 중 고개 숙임 ≤ 10° // 허리 굽힘·고개 끄덕임 완화(가슴 변형도 줄어듦)
  // 변신 로봇 (버들 [Q] 변신 중 교체되는 모델). Run = Monster_Walk(느린 거구 걸음) → 빠르게 재생
  mech_robot_meshy: { alias: { Running_A: 'Run', Death_A: 'Hit', Cheer: 'FistPump' }, sub: [['Drill', 'PunchCombo', .4, 1.9], ['Hammer', 'HammerSwing', .5, 1.75], ['Rocket', 'DoublePunch', .2, 1.7], ['StompS', 'Stomp', 0, 1.3]], hamHit: 1.0, arms: 1, runSpd: 2.4, h: 4.6,
    // 로봇 원본 클립은 몸통이 옆으로 최대 120° 돌고(Idle −86°, Drill −119°, Hit −60°) 해머는 80° 앞으로 접힘 → 엉덩이·척추·목·머리를 정면 자세(FistPump 첫 프레임) 쪽으로 강하게 당김 (팔·다리 동작은 그대로)
    // 메시는 정점마다 가장 큰 영향 뼈 하나에 묶음(rigidskin.mjs) + 스케일/위치(Hips 제외) 트랙 제거 → 장갑 부품이 늘어나지 않고 강체로 움직임
    calm: [{ clips: ['Idle', 'Drill', 'Hammer', 'Rocket', 'StompS', 'Uppercut', 'Hit'], bones: ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head'], k: .85, ref: 'FistPump' }, { clips: ['Run', 'Walk'], bones: ['Spine01', 'Spine02', 'neck', 'Head'], k: .5, ref: 'FistPump' }] },
  // 로즈 2차 전직 '장미 저격수' 전용 몸 (총 없는 로즈 + Meshy 소총 동작). 소총은 별도 강체 모델 rose_rifle_gun → 오른손 손바닥에 손잡이, 총열은 왼손 손바닥을 지나게 매 프레임 배치 (늘어남 없음)
  // Ready = 소총을 허리 높이로 겨눈 팔 자세(Rifle_Turn_Left 한 프레임) → 대기/피격 팔에 고정, Aim = 어깨 견착 조준(Gun_Hold_Left_Turn 0–1.3초), AimRun = 달리기 다리 + 견착 팔·상체
  rose_rifle_meshy: { alias: { Idle: 'IdleR', Running_A: 'Run', Death_A: 'Death', Cheer: 'Flourish', Melee_Show: 'Flourish', ShootStand: 'Aim', ShootWalk: 'AimRun', ShootLoop: 'Aim', ShootCharged: 'Aim', IdleLookAround: 'IdleR', Walk: 'Run' },
    graft: [['IdleR', 'IdleBase', 'Ready', '(Shoulder|Arm|ForeArm|Hand)$'], ['AimRun', 'Run', 'Aim', '^(Spine|Spine01|Spine02|neck|Head|.*(Shoulder|Arm|ForeArm|Hand))$']],
    calm: [{ clips: ['Hit'], bones: ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'], k: .85, ref: 'Ready' }],
    rifle: { s: .85, grip: [.44, -.01, 0], fore: [-.28, .06, 0], muz: [-.95, .085, .008], aim: ['Aim', 'AimRun'], one: ['Death', 'Flourish'], pitch: .05 } },
  // Meshy 격투가 진서윤 (고양이 귀 후드 = 몸 메시 일부, 무기·부착물 없음). 클립: /workspace/seoyun3d (merge.json · build.mjs), 타격 시점은 heroes/fighter.js HIT
  // JabLs/JabRs = 가드에서 왼/오른 잽 · SpinK = 회전 돌려차기 · ChargeIn/ChargeHold = 장풍 기 모으기(두 손 가슴 앞) · PalmS = 두 손 장풍 내지르기 · SlamS = 뛰어올라 내려찍기
  seoyun_meshy: { alias: { Running_A: 'Run', Death_A: 'Death', Cheer: 'CheerJ', Melee_Show: 'SpinK', IdleLookAround: 'Combat' },
    sub: [['JabLs', 'JabL', .25, .95], ['JabRs', 'JabR', .3, 1.0], ['SpinK', 'SpinKick', .55, 1.55], ['PalmS', 'Palm', 1.2, 2.3], ['ChargeIn', 'Charge', .27, .75], ['ChargeHold', 'Charge', .75, 1.45], ['SlamS', 'Slam', .25, 1.9], ['CheerJ', 'Cheer', 0, 3.2]] },
  lich_meshy: {}, // 던전 5층 보스 '망령 여왕 모르비아' (몬스터, 지연 로딩 · 클립 이름은 makeLich 에서 해골 클립 이름으로도 연결)
  warrior_meshy: { alias: { Running_A: 'Run', Death_A: 'Death', Cheer: 'IdleLookAround', '1H_Melee_Attack_Chop': 'Slash', '1H_Melee_Attack_Slice_Horizontal': 'Slash', '2H_Melee_Attack_Spinning': 'Spin', Melee_Show: 'SlashHeavy' }, hitAt: .53 },
};
const wsV = new THREE.Vector3();
// shared: 같은 종류 몬스터끼리 공유하는 몸 머티리얼 배열(메시 순서대로). 주면 복제하지 않고 그대로 씀 (피격 플래시는 flashCh 가 메시별로 플래시 머티리얼로 교체)
function makeChar(key, height, clips, olW = .03, shared = null) {
  const tpl = GL[key], root = SkeletonUtils.clone(tpl.scene), k = height / tpl.userData.h; root.scale.setScalar(k);
  const g = new THREE.Group(); g.add(root); const mats = [], meshes = [];
  root.traverse(o => { if (o.isMesh) { if (shared) o.material = shared[meshes.length]; else { o.material = o.material.clone(); o.material.userData.e = o.material.emissive.clone(); mats.push(o.material); } o.castShadow = true; o.frustumCulled = false; meshes.push(o); } });
  root.updateMatrixWorld(true); for (const m of meshes) addOutline(m, olW / m.getWorldScale(wsV).x);
  const mixer = new THREE.AnimationMixer(root), acts = {}; for (const c of clips) acts[c.name] = mixer.clipAction(c);
  return { g, root, mixer, acts, mats, meshes, cur: null, k };
}
function attach(ch, key, bone) {
  const b = ch.root.getObjectByName(bone); if (!b || !GL[key]) return null; const w = GL[key].scene.clone(true); b.add(w); ch.root.updateMatrixWorld(true);
  const ms = []; w.traverse(o => { if (o.isMesh) ms.push(o); }); for (const o of ms) { o.castShadow = true; addOutline(o, .03 / o.getWorldScale(wsV).x); } return w;
}
function play(ch, name, o = {}) {
  const a = ch.acts && ch.acts[name]; if (!a) return null; const { fade = .18, once = false, speed = 1, force = false } = o;
  if (ch.cur === a) { if (force) { a.reset(); a.timeScale = speed; a.play(); if (ch.gear) gearOn(ch, name, a, speed); } else a.timeScale = speed; return a; }
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed; a.setEffectiveWeight(1); a.fadeIn(fade).play();
  if (ch.cur) ch.cur.fadeOut(fade); ch.cur = a; if (ch.aim) ch.yawT = ch.aim[a.getClip().name] || 0; if (ch.gear) gearOn(ch, name, a, speed); return a;
}
function flashMats(mats, on, col = 0xffffff) { for (const m of mats) { if (on) m.emissive.setHex(col); else if (m.userData.e) m.emissive.copy(m.userData.e); else m.emissive.setHex(0); } }
// 몬스터 피격 플래시: 개체별 머티리얼(ch.mats)은 emissive 변경, 종류별 공유 몸 머티리얼(ch.shMeshes)은 (공유 머티리얼, 색)별 플래시 복제본으로 메시의 material 을 잠시 교체
const FLASH_V = new WeakMap();
function flashVar(base, col) { let t = FLASH_V.get(base); if (!t) FLASH_V.set(base, t = {}); if (!t[col]) { const m = base.clone(); m.emissive.setHex(col); t[col] = m; } return t[col]; }
function flashCh(ch, on, col = 0xffffff) {
  if (ch.mats) flashMats(ch.mats, on, col); const M = ch.shMeshes; if (!M) return;
  const k = on ? col : -1; if (ch.flK === k) return; ch.flK = k;
  for (let i = 0; i < M.length; i++) M[i].material = on ? flashVar(ch.shBase[i], col) : ch.shBase[i];
}
const heroClips = () => GL.warrior_meshy.animations, skClips = () => GL.sk_minion.animations;
// alt = 전직 전용 몸 모델 (로즈 장미 저격수 소총 몸). 모델이 아직 없거나 소품이 없으면 기본 모델 (안정성 우선)
const altOk = alt => !!(alt && GL[alt] && MESHY[alt] && (!MESHY[alt].rifle || GL.rose_rifle_gun));
function makeHeroModel(cls, key0, alt) {
  const want = key0 || (altOk(alt) ? alt : CLASSES[cls].model), key = FB[want] || want, M = MESHY[key], ch = makeChar(key, M ? M.h || 2.8 : 2.5, M ? GL[key].animations : heroClips(), .032);
  if (M) { for (const [a, b] of Object.entries(M.alias)) if (ch.acts[b]) ch.acts[a] = ch.acts[b]; // 기존 동작 이름 → 새 클립
    ch.hitAt = M.hitAt || 0; ch.root.updateMatrixWorld(true);
    if (M.aim) { ch.aim = M.aim; ch.yawT = 0; const up = ch.mixer.update.bind(ch.mixer); ch.mixer.update = dt => { ch.root.rotation.y += (ch.yawT - ch.root.rotation.y) * Math.min(1, dt * 16); return up(dt); }; }
    if (key === 'mage_meshy') { const hand = ch.root.getObjectByName('RightHand'); if (hand) { const hp = hand.getWorldPosition(new THREE.Vector3()), tip = new THREE.Object3D();
      tip.position.copy(hand.worldToLocal(staffTop(ch, hp))); hand.add(tip); ch.tip = tip; } } // 지팡이 수정 위치
    else if (key === 'gunner_meshy') gunMuzzles(ch);
    else if (M.rifle) rifleRig(ch, M.rifle);
    else if (M.gear) mechGear(ch, M);
    else if (M.arms) mechArms(ch, M);
    else if (key === 'archer_meshy') { const hand = ch.root.getObjectByName('LeftHand'); if (hand) { const tip = new THREE.Object3D(); tip.position.copy(hand.worldToLocal(bowGrip(ch, hand.getWorldPosition(new THREE.Vector3())))); hand.add(tip); ch.tip = tip; } } } // 활 손잡이(왼손에 스킨된 활) = 화살 발사 지점
  if (FB[want]) fallbackLook(ch, cls); // 대체 모델: 색조 + 고양이 귀 후드 (절차적)
  ch.key = key; if (key0) return ch; // 변신 로봇: 링/색은 본체 것을 사용
  const ring = new THREE.Mesh(new THREE.RingGeometry(.75, .95, 32), new THREE.MeshBasicMaterial({ color: CLASSES[cls].color, transparent: true, opacity: .7, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .06; ch.g.add(ring); ch.ring = ring;
  return ch;
}
// 대체 모델 꾸미기 (격투가 몸을 못 받았을 때 세라 몸 위에): 주황 색조 + 머리에 고양이 귀 2개 (원뿔, 안쪽 분홍)
function fallbackLook(ch, cls) { const col = new THREE.Color(CLASSES[cls].color); ch.mats.forEach(m => m.color.lerp(col, .45)); ch.fallback = true;
  const head = ch.root.getObjectByName('Head') || ch.root.getObjectByName('head'); if (!head) return; const g = new THREE.Group(), out = toon(CLASSES[cls].color), inn = toon(0xffb0c0);
  for (const s of [-1, 1]) { const e = mk(new THREE.ConeGeometry(.16, .34, 4), out, s * .2, .42, 0, g, .02); e.rotation.z = -s * .35; const i = mk(new THREE.ConeGeometry(.09, .2, 4), inn, s * .19, .4, .05, g, 0); i.rotation.z = -s * .35; }
  attachProp(ch, head.name, g, [0, .05, 0]); }
// 메카닉 로봇 팔: 바인드 포즈에서 손 주변 정점 중 아래팔 뼈에서 가장 먼 점 = 드릴 끝 / 주먹 끝. 드릴 끝에는 회전하는 가산 드릴 잔상(평소 숨김)
function armTip(ch, hand, fore, rad) { const hp = hand.getWorldPosition(new THREE.Vector3()), fp = fore.getWorldPosition(new THREE.Vector3()), v = new THREE.Vector3(); let best = null, bd = -1;
  ch.root.traverse(o => { if (!o.isSkinnedMesh || o.userData.ol) return; const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 3) { o.getVertexPosition(i, v); o.localToWorld(v); if (v.distanceTo(hp) < rad) { const d = v.distanceTo(fp); if (d > bd) { bd = d; best = v.clone(); } } } });
  return { p: best || hp, axis: (best || hp).clone().sub(fp).normalize() }; }
function mechArms(ch, M) {
  ch.runSpd = M.runSpd || 0; ch.hamHit = M.hamHit || 1; const s = (M.h || 2.8) / 2.8; ch.tips = {};
  for (const [k, hb, fb] of [['drill', 'RightHand', 'RightForeArm'], ['fist', 'LeftHand', 'LeftForeArm']]) { const hand = ch.root.getObjectByName(hb), fore = ch.root.getObjectByName(fb); if (!hand || !fore) continue;
    const t = armTip(ch, hand, fore, .75 * s), o = new THREE.Object3D(); o.position.copy(hand.worldToLocal(t.p.clone())); hand.add(o); ch.tips[k] = o;
    if (k === 'drill') { // 드릴 잔상: 손 로컬에서 드릴 축 방향(+Y)으로 맞춘 원뿔 2겹
      const ws = hand.getWorldScale(wsV).x || .01, q = hand.getWorldQuaternion(new THREE.Quaternion()).invert(), ax = t.axis.clone().applyQuaternion(q).normalize();
      const g = new THREE.Group(); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax); g.scale.setScalar(s / ws); o.add(g);
      const mat = new THREE.MeshBasicMaterial({ color: 0x9aff6a, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, wireframe: true });
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(.26, .75, 10, 3, true).translate(0, -.32, 0), mat), c2 = new THREE.Mesh(new THREE.ConeGeometry(.34, .5, 7, 1, true).translate(0, -.5, 0), mat.clone()); c2.material.color.setHex(0xfff0a0); c2.material.opacity = .4;
      g.add(c1, c2); g.visible = false; ch.drillFx = { g, c1, c2 }; } }
}
// ---- 버들 로봇 팔 (강체): budeul_gear = Pack / ArmR(드릴, 버들의 오른쪽) / ArmL(집게 주먹). 팔 노드 원점 = 어깨 관절, extras.tip = 팔 끝
// 몸에 스킨하지 않고 Spine02 뼈에 통째로 붙임(크기 고정) → 몸이 움직여도 늘어나거나 찌그러지지 않음. 팔은 어깨에서 회전만 함(절차적 동작)
// 모델 정면(+Z, 초록 패널)을 등 바깥으로: z 축 반전(= Y 180° 회전 + 좌우 반전) → 드릴은 그대로 버들의 오른쪽(-X)
export const GEAR = { s: .9, off: [0, -.3, -.59], rest: .6, splay: .42, arm: 1.3, sx: .08, sy: .05 }; // arm = 로봇 팔만 1.3배(어깨 관절 기준, 강체) · sx/sy = 어깨를 팩 바깥·위로 → 컨셉처럼 등에서 뻗은 큰 팔(옆으로 벌려 늘어뜨림) // off = Spine02 기준(게임 단위): 팩 윗면이 머리카락 아래(1.92), 안쪽 면이 등 뒤(-0.15)
const GEAR_ACT = { Drill: 'drill', Hammer: 'hammer', Uppercut: 'up', FistPump: 'cheer', CheerUp: 'cheer', Hit: 'hit', Death: 'death' };
function mechGear(ch, M) {
  ch.hamHit = M.hamHit || 1; ch.runSpd = 0; ch.tips = {}; const src = GL.budeul_gear && GL.budeul_gear.scene; if (!src) return;
  const S = GEAR.s, g = new THREE.Group(), body = new THREE.Group(); body.scale.set(S, S, -S); g.add(body); const arms = {};
  for (const n of ['Pack', 'ArmR', 'ArmL']) { const node = src.getObjectByName(n); if (!node) continue; const c = node.clone(true); body.add(c);
    c.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData.e = o.material.emissive.clone(); ch.mats.push(o.material); o.castShadow = true; o.frustumCulled = false; } });
    if (n !== 'Pack') { c.rotation.order = 'XYZ'; arms[n] = c; c.scale.multiplyScalar(GEAR.arm || 1); c.position.x += Math.sign(c.position.x || 1) * (GEAR.sx || 0); c.position.y += GEAR.sy || 0; const tip = new THREE.Object3D(); tip.position.fromArray(node.userData.tip || [0, -1, 0]); c.add(tip); ch.tips[n === 'ArmR' ? 'drill' : 'fist'] = tip; } }
  attachProp(ch, 'Spine02', g, GEAR.off); ch.root.updateMatrixWorld(true);
  g.traverse(o => { if (o.isMesh && !o.userData.ol) addOutline(o, .032 / o.getWorldScale(wsV).x); });
  // 드릴 잔상: 드릴 끝에서 팔 쪽으로 원뿔 2겹 (축 = 팔 아래쪽 정점 중심 → 끝)
  const R = arms.ArmR; if (R) { const tip = ch.tips.drill, mesh = R.children.find(o => o.isMesh) || R, P = mesh.geometry && mesh.geometry.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3(); let n = 0;
    if (P) for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); if (v.y < tip.position.y + .42) { c.add(v); n++; } }
    const ax = n ? tip.position.clone().sub(c.divideScalar(n)).normalize() : new THREE.Vector3(0, -1, 0), fx = new THREE.Group(); fx.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax); fx.scale.setScalar(.75 / S); tip.add(fx);
    const mat = new THREE.MeshBasicMaterial({ color: 0x9aff6a, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, wireframe: true });
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(.26, .75, 10, 3, true).translate(0, -.32, 0), mat), c2 = new THREE.Mesh(new THREE.ConeGeometry(.34, .5, 7, 1, true).translate(0, -.5, 0), mat.clone()); c2.material.color.setHex(0xfff0a0); c2.material.opacity = .4;
    fx.add(c1, c2); fx.visible = false; ch.drillFx = { g: fx, c1, c2 }; }
  ch.gear = { g, arms, act: null, clock: 0 }; ch.gearOn = (name, a, spd = 1) => gearOn(ch, name, a, spd); const up = ch.mixer.update.bind(ch.mixer); ch.mixer.update = dt => { const r = up(dt); gearUpd(ch, dt); return r; };
  gearUpd(ch, 0);
}
// 공격/동작 시작: 몸 클립과 같은 시간축(클립 시간) 사용. 움직이며 공격(몸 클립 없음)은 gearAct로 자체 시계
function gearOn(ch, name, a, spd) { const k = GEAR_ACT[a.getClip().name] || GEAR_ACT[name]; if (k) ch.gear.act = { k, a, t: 0, spd }; else if (ch.gear.act && ch.gear.act.k === 'death') ch.gear.act = null; }
function gearAct(ch, k, spd = 1) { if (ch.gear) ch.gear.act = { k, a: null, t: 0, spd }; }
const sm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x), lerp = (a, b, k) => a + (b - a) * k;
// 시간 t(클립 초)의 팔 자세: x = 앞뒤 회전(+ = 앞으로 들어 올림), z = 바깥 벌림, push = 어깨에서 앞으로 내지르기(게임 단위)
function gearPose(k, t) {
  const r = GEAR.rest, R = { x: r, z: GEAR.splay, push: 0 }, L = { x: r, z: GEAR.splay, push: 0 };
  if (k === 'drill') { const up = sm(t / .38) * (1 - sm((t - 1.0) / .4)); R.x = lerp(r, 1.72, up); R.z = lerp(GEAR.splay, -.12, up); L.x = lerp(r, .5, up);
    if (t > .42 && t < 1.0) { const j = ((t - .42) / .17) % 1; R.push = .16 * Math.sin(j * Math.PI); R.x += .05 * Math.sin(j * Math.PI * 2); } }
  else if (k === 'hammer') { const raise = sm(t / .33), slam = sm((t - .33) / .13), back = sm((t - .8) / .4); L.x = lerp(lerp(r, 2.8, raise), 1.42, slam); L.x = lerp(L.x, r, back); L.z = lerp(GEAR.splay, -.08, raise * (1 - back)); R.x = lerp(r, .6, raise * (1 - back)); if (t > .4 && t < .8) L.push = .16 * Math.min(1, (t - .4) / .06) * (1 - (t - .4) / .4); }
  else if (k === 'up') { const d = sm(t / .25), u = sm((t - .25) / .2), b = sm((t - .7) / .3); L.x = lerp(lerp(r, .55, d), 2.55, u); L.x = lerp(L.x, r, b); L.z = lerp(GEAR.splay, -.1, u * (1 - b)); R.x = lerp(r, 1.05, u * (1 - b)); }
  else if (k === 'cheer') { const u = sm(t / .3) * (1 - sm((t - 1.1) / .35)), w = .18 * Math.sin(t * 9) * u; R.x = L.x = lerp(r, 2.45, u); R.x += w; L.x -= w; R.z = L.z = lerp(GEAR.splay, .32, u); }
  else if (k === 'hit') { const j = Math.sin(Math.min(1, t / .45) * Math.PI); R.x = L.x = r - .32 * j; R.z = L.z = GEAR.splay + .14 * j; }
  else if (k === 'death') { const d = sm(t / .8); R.x = L.x = lerp(r, .18, d); R.z = L.z = lerp(GEAR.splay, .45, d); }
  return { R, L }; }
const ACT_LEN = { drill: 1.45, hammer: 1.2, up: 1.05, cheer: 1.5, hit: .5, death: 1e9 };
function gearUpd(ch, dt) {
  const G0 = ch.gear; G0.clock += dt; let act = G0.act; if (act) { act.t = act.a && act.a === ch.cur && act.a.isRunning() ? act.a.time : act.t + dt * act.spd; /* 몸 클립이 끝났거나(LoopOnce) 다른 클립이면 자체 시계 */ if (act.t > ACT_LEN[act.k]) act = G0.act = null; }
  const P = gearPose(act ? act.k : 'rest', act ? act.t : 0), cn = ch.cur ? ch.cur.getClip().name : '', mv = cn === 'Run' ? 1 : cn === 'Walk' ? .5 : 0, c = G0.clock;
  // 대기 = 숨쉬듯 흔들림, 걷기·달리기 = 팔을 번갈아 앞뒤로 (몸 동작과 같은 주기)
  const ph = ch.cur && mv ? ch.cur.time / ch.cur.getClip().duration * Math.PI * 2 : 0, sw = .035 * Math.sin(c * 2.1);
  for (const [n, side, p] of [['ArmR', -1, P.R], ['ArmL', 1, P.L]]) { const a = G0.arms[n]; if (!a) continue;
    a.rotation.x = p.x + sw + (act ? 0 : mv * .2 * Math.sin(ph + (side > 0 ? Math.PI : 0)));
    a.rotation.z = side * (p.z + (act ? 0 : .02 * Math.sin(c * 1.7 + side))); a.rotation.y = 0;
    const b = a.userData.p0 || (a.userData.p0 = a.position.clone()); a.position.set(b.x, b.y, b.z - p.push / GEAR.s); } /* 몸체 공간이 z 반전 → 앞(+Z 월드) = -z */
}
export { gearAct };
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
// ---- 소총 (장미 저격수): 강체 소총을 ch.g 안에 두고 매 프레임 '오른손 손바닥 = 손잡이(grip)', '총열 방향 = 오른손→왼손 손바닥' 으로 배치 (위쪽 = 월드 위)
// 조준 클립(aim)에서는 ① 모델을 돌려 총열이 정면(목표)을 향하게 ② 가슴(Spine)을 숙여 총열 기울기를 pitch 로 ③ 사격 반동(ch.recoil) 을 더함. one = 한 손 클립(쓰러짐·환호): 직전 자세 기준 오른손에 고정
function palmOf(ch, hn) { const hb = ch.root.getObjectByName(hn); let sm = null; ch.root.traverse(o => { if (o.isSkinnedMesh && !o.userData.ol && !sm) sm = o; }); if (!hb || !sm) return null;
  const B = sm.skeleton.bones, set = new Set(); B.forEach((b, i) => { for (let q = b; q; q = q.parent) if (q === hb) { set.add(i); break; } });
  const g = sm.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, v = new THREE.Vector3(), c = new THREE.Vector3(); let n = 0; ch.root.updateMatrixWorld(true);
  for (let i = 0; i < g.attributes.position.count; i++) { let w = 0; for (let j = 0; j < 4; j++) if (set.has(si.getComponent(i, j))) w += sw.getComponent(i, j); if (w < .5) continue; sm.getVertexPosition(i, v); v.applyMatrix4(sm.matrixWorld); c.add(v); n++; }
  const o = new THREE.Object3D(); o.position.copy(hb.worldToLocal(n ? c.divideScalar(n) : hb.getWorldPosition(c))); hb.add(o); return o; }
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rc = new THREE.Vector3(), _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
function rifleRig(ch, R) {
  const src = GL.rose_rifle_gun && GL.rose_rifle_gun.scene; if (!src) return; const gun = new THREE.Group(), body = src.clone(true); body.scale.setScalar(R.s); gun.add(body); ch.g.add(gun);
  const mats = []; body.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData.e = o.material.emissive.clone(); mats.push(o.material); ch.mats.push(o.material); o.castShadow = true; o.frustumCulled = false; } });
  ch.g.updateMatrixWorld(true); body.traverse(o => { if (o.isMesh && !o.userData.ol) addOutline(o, .028 / o.getWorldScale(wsV).x); });
  const grip = new THREE.Vector3(...R.grip).multiplyScalar(R.s), fore = new THREE.Vector3(...R.fore).multiplyScalar(R.s), la = fore.clone().sub(grip).normalize(), lb = UP.clone().addScaledVector(la, -la.y).normalize();
  const L0 = new THREE.Matrix4().makeBasis(la, lb, new THREE.Vector3().crossVectors(la, lb)).invert();
  const pR = palmOf(ch, 'RightHand'), pL = palmOf(ch, 'LeftHand'), hand = ch.root.getObjectByName('RightHand'), spine = ch.root.getObjectByName('Spine');
  // 총구 + 섬광 (총열 = 소총 로컬 -X → 섬광 그룹 +Y 를 -X 로)
  const m = new THREE.Object3D(); m.position.fromArray(R.muz).multiplyScalar(R.s); gun.add(m);
  const mat = new THREE.MeshBasicMaterial({ map: starTex(), color: 0xffd8a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), f = new THREE.Group();
  for (const r of [0, Math.PI / 2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.7, .9), mat); p.rotation.y = r; p.position.y = .2; f.add(p); }
  const disk = new THREE.Mesh(new THREE.PlaneGeometry(.55, .55), mat); disk.rotation.x = Math.PI / 2; f.add(disk); f.visible = false; const fo = new THREE.Group(); fo.rotation.z = Math.PI / 2; fo.add(f); m.add(fo); // flash() 는 f.rotation.y(총열 축)만 돌림
  ch.muz = [m, m]; const fl = { g: f, t: 0, s: 1, mat }; ch.flashes = [fl, fl];
  const st = { gun, R, dir: new THREE.Vector3(0, 0, 1), rel: null, one: false, yaw: 0, recoil: 0 }; ch.rifle = st; ch.recoil = 0;
  const inv = new THREE.Matrix4();
  const place = () => { // 두 손 배치 (ch.g 로컬)
    ch.g.updateMatrixWorld(true); inv.copy(ch.g.matrixWorld).invert(); const a = pR.getWorldPosition(_ra).applyMatrix4(inv), b = pL.getWorldPosition(_rb).applyMatrix4(inv), d = _rc.subVectors(b, a);
    if (d.length() > .08) st.dir.copy(d).normalize(); const A = st.dir, B = UP.clone().addScaledVector(A, -A.y); if (B.lengthSq() < 1e-4) B.set(0, 0, 1); B.normalize();
    _rm.makeBasis(A, B, new THREE.Vector3().crossVectors(A, B)).multiply(L0); gun.quaternion.setFromRotationMatrix(_rm); gun.position.copy(a).sub(grip.clone().applyQuaternion(gun.quaternion)); };
  const up = ch.mixer.update.bind(ch.mixer);
  ch.mixer.update = dt => { const r = up(dt), cn = ch.cur ? ch.cur.getClip().name : '', aim = R.aim.includes(cn), one = R.one.includes(cn);
    st.recoil = Math.max(0, (ch.recoil || 0) - dt * 5); ch.recoil = st.recoil;
    if (one) { if (!st.one) { ch.root.updateMatrixWorld(true); gun.updateMatrixWorld(true); st.rel = hand.matrixWorld.clone().invert().multiply(gun.matrixWorld); st.one = true; }
      ch.root.updateMatrixWorld(true); _rm.copy(ch.g.matrixWorld).invert().multiply(hand.matrixWorld).multiply(st.rel); _rm.decompose(gun.position, gun.quaternion, _ra); }
    else { st.one = false;
      // 조준: 모델 회전으로 총열 수평 방향을 정면(+Z)에, 가슴 숙임으로 기울기를 pitch 로 (반동 = 위로 튐)
      const yawT = aim ? st.yaw : 0; ch.root.rotation.y += (yawT - ch.root.rotation.y) * Math.min(1, dt * 14 + (dt === 0 ? 1 : 0));
      place();
      if (aim && spine) { const A = st.dir, err = Math.atan2(A.x, A.z), w = ch.root.rotation.y - err; st.yaw += Math.atan2(Math.sin(w - st.yaw), Math.cos(w - st.yaw)) * Math.min(1, dt * 12 + (dt === 0 ? 1 : 0)); // 목표 = 지금 회전 - 오차 (클립 고유 각도의 반대)
        const pitch = Math.asin(Math.max(-1, Math.min(1, A.y))), want = R.pitch + st.recoil * .35, dp = Math.max(-.6, Math.min(.6, pitch - want));
        if (Math.abs(dp) > .01) { ch.g.updateMatrixWorld(true); const ax = new THREE.Vector3().crossVectors(A, UP).normalize().transformDirection(ch.g.matrixWorld);
          spine.parent.getWorldQuaternion(_rq); _rq2.setFromAxisAngle(ax, -dp); spine.quaternion.premultiply(_rq.clone().invert().multiply(_rq2).multiply(_rq)); ch.root.updateMatrixWorld(true); place(); } } }
    return r; };
  ch.mixer.update(0);
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
const SHARED_BODY = {};
// Meshy 보스 몸 (E.mesh 가 불러와졌을 때만). 해골 몬스터용 이름으로 부르는 동작(걷기·공격·죽음·출현)을 전용 클립에 연결
const LICH_ALIAS = { Walking_D_Skeletons: 'Walk', Unarmed_Melee_Attack_Punch_A: 'Attack', Death_A: 'Death', Spawn_Ground_Skeletons: 'Scream', Hit_A: 'Hit', Idle_Combat: 'Idle' };
function makeLich(E) { const ch = makeChar(E.mesh, E.h, GL[E.mesh].animations, .05); for (const [a, b] of Object.entries(LICH_ALIAS)) if (ch.acts[b] && !ch.acts[a]) ch.acts[a] = ch.acts[b]; ch.lich = true; for (const m of ch.mats) m.emissiveIntensity = .3; /* 피격 플래시를 약하게 (영웅 4명이 계속 때려도 하얗게 뜨지 않게) */ return ch; }
function makeEnemyModel(type) {
  const E = ETYPES[type]; if (E.mesh && GL[E.mesh]) return makeLich(E); if (E.proc === 'wisp') return makeWisp(E); if (E.proc === 'wolf') return makeWolf(E); if (E.proc === 'slime') return makeSlime(E); if (E.fly) return makeBat();
  // 몸 머티리얼은 종류별로 한 벌만 (첫 개체가 색조·눈 발광을 정한 뒤 공유) → 개체마다 clone 하던 머티리얼 수·GPU 유니폼 업로드 감소. 소품 머티리얼(버섯 갓·얼음 등 개체별 변화)은 그대로 개체별
  const sh = SHARED_BODY[type] || null, ch = makeChar(E.model, E.h, skClips(), E.boss ? .05 : .03, sh); attach(ch, E.w, 'handslotr'); if (E.sh) attach(ch, E.sh, 'handslotl');
  if (!sh && E.tint) { const tc = new THREE.Color(E.tint); ch.mats.forEach(m => m.color.multiply(tc)); }
  const body = sh || ch.mats.slice();
  if (E.prop) { addProp(ch, E.prop, E); extraProp(ch, E.prop, E, attachProp); }
  if (!sh) ch.root.traverse(o => { if (o.isMesh && !o.userData.ol && /Eyes/.test(o.name)) { o.material.emissive.setHex(E.boss ? 0xff2020 : E.eye || 0x40d0ff); o.material.emissiveIntensity = E.boss ? 3 : 1.6; o.material.userData.e = o.material.emissive.clone(); } });
  if (!sh) SHARED_BODY[type] = body; ch.mats = ch.mats.filter(m => !body.includes(m)); ch.shMeshes = ch.meshes; ch.shBase = body; // 공유 머티리얼은 개체 제거 때 dispose 하지 않음
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

export { altOk, GL, MESHY, ASSETS, MON_ASSETS, heroAssets, loadAssets, loadModel, loadBackground, ensureModels, modelsReady, whenModels, play, flashMats, flashCh, makeHeroModel, makeEnemyModel };
