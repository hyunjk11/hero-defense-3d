import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { $, rnd } from '../core/util.js';
import { GH } from '../core/grid.js';
import { CLASSES, HERO_KEYS, heroLabel } from '../data/heroes.js';
import { G } from '../core/state.js';
import { cam, scene } from '../render/scene.js';
import { mk, toon } from '../render/toon.js';
import { SFX } from '../audio/sfx.js';
import { MON_ASSETS, ensureModels, heroAssets, makeHeroModel, modelsReady, whenModels, play } from '../render/characters.js';
import { computeDist } from '../world/pathfinding.js';
import { spawnHero } from '../heroes/hero.js';
import { banner, refreshHud, setPhaseUI } from './hud.js';
import { heroOwned } from '../account/shop.js';

// ================= 영웅 선택 =================
const preview = []; let podium = null, hoverCls = null;
function showSelect() {
  G.phase = 'select'; $('select').classList.remove('hidden');
  podium = new THREE.Group(); podium.position.set(0, 0, GH + 6); scene.add(podium);
  mk(new THREE.CylinderGeometry(6.2, 6.8, .7, 48), toon(0x6ab84a), 0, -.35, 0, podium, .04); mk(new THREE.CylinderGeometry(6.9, 7.2, .5, 48), toon(0x9a7a5a), 0, -.8, 0, podium, .04);
  for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28; mk(new THREE.IcosahedronGeometry(.2, 1), toon([0xff8ac0, 0xffe05a, 0xffffff][k % 3]), Math.cos(a) * 5.6, .1, Math.sin(a) * 5.6, podium, .015); }
  const L = HERO_KEYS, m = (L.length - 1) / 2;
  // 아직 안 불러온 영웅(지연 로딩)은 백그라운드로 모델이 도착하면 그 자리에 올림 (그 사이 선택 화면을 떠났으면 무시)
  const pd = podium, add = (cls, i) => { if (podium !== pd || !pd.parent) return; const ch = makeHeroModel(cls); ch.g.position.set((i - m) * 2.3, 0, Math.abs(i - m) < 1.5 ? -.45 : 0); ch.g.rotation.y = (m - i) * .18; pd.add(ch.g); ch.cls = cls; play(ch, 'Idle'); ch.mixer.update(i * .7); ch.nextCheer = 1.5 + i * 2.2; ch.cheerT = 0; preview.push(ch); };
  L.forEach((cls, i) => { const need = heroAssets(cls); if (modelsReady(need)) add(cls, i); else whenModels(need).then(() => add(cls, i)); }); // 새로 받지는 않음 (인트로·마을은 백그라운드 로딩이 채움, 스테이지 출정은 안 받음)
  cam.target.set(0, 1.5, GH + 6); cam.r = 13.5; cam.phi = 1.3; cam.theta = 0;
  document.querySelectorAll('.card').forEach(c => { c.classList.toggle('locked', !heroOwned(c.dataset.cls)); c.onclick = () => { SFX.init(); if (!heroOwned(c.dataset.cls)) { Snd.play('error'); banner(`🔒 ${CLASSES[c.dataset.cls].nm}는 마을 상점에서 구매 후 사용할 수 있어요`, '#ffb0d4', 2200); return; } Snd.play('confirm'); choose(c.dataset.cls); }; c.onmouseenter = () => { hoverCls = c.dataset.cls; Snd.play('select'); const p = preview.find(p => p.cls === hoverCls); if (p) { play(p, 'Cheer', { once: true }); p.cheerT = 1.8; } }; c.onmouseleave = () => hoverCls = null; });
}
function updSelect(dt) {
  for (const p of preview) { p.mixer.update(dt); p.nextCheer -= dt; if (p.cheerT > 0) { p.cheerT -= dt; if (p.cheerT <= 0) play(p, 'Idle', { fade: .3 }); }
    else if (p.nextCheer <= 0) { if (p.cls === 'gunner') { p.nextCheer = 6 + Math.random() * 4; play(p, 'Flourish', { once: true }); p.cheerT = 4; } else if (p.cls === 'mechanic') { p.nextCheer = 6 + Math.random() * 4; play(p, Math.random() < .5 ? 'Uppercut' : 'FistPump', { once: true }); p.cheerT = 1.6; } else { p.nextCheer = rnd(5, 9); play(p, p.cls === 'mage' ? 'Spellcast_Raise' : p.cls === 'archer' ? '2H_Ranged_Shoot' : (p.acts.Melee_Show ? 'Melee_Show' : '1H_Melee_Attack_Slice_Horizontal'), { once: true }); p.cheerT = 1.6; } } // 로즈·버들은 게임 난수 미사용(회귀 결정성)
    p.ring.material.opacity = hoverCls === p.cls ? .95 : .45; p.ring.scale.setScalar(hoverCls === p.cls ? 1.2 + Math.sin(G.t * 6) * .05 : 1); }
  if (!G.heroShot) cam.theta = Math.sin(G.t * .2) * .18;
}
function choose(cls) {
  const need = [...MON_ASSETS, ...heroAssets(cls, true)]; // 지연 로딩: 판에 필요한 모델이 아직이면 받은 뒤 시작
  if (!modelsReady(need)) { G.chooseWait = cls; $('loading').classList.remove('hidden'); $('loadTxt').textContent = '모델 불러오는 중…'; ensureModels(need).then(() => { $('loading').classList.add('hidden'); if (G.chooseWait === cls) { G.chooseWait = null; choose(cls); } }).catch(e => { console.warn(e); banner('모델을 불러오지 못했습니다. 새로고침 해주세요.', '#ff8a8a', 4000); }); return; }
  G.chooseWait = null;
  preview.forEach(p => p.mixer.stopAllAction()); preview.length = 0; scene.remove(podium); $('select').classList.add('hidden'); $('hud').classList.remove('hidden');
  spawnHero(cls); G.phase = 'build'; cam.target.set(0, 0, 1); cam.r = 58; cam.phi = .9; cam.theta = .22;
  computeDist(); setPhaseUI(); refreshHud(); banner(`${heroLabel(cls)} 출전!`, '#ffe066');
}

export { showSelect, updSelect, choose };
