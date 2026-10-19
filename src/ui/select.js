import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { $, rnd } from '../core/util.js';
import { GH } from '../core/grid.js';
import { CLASSES, heroLabel } from '../data/heroes.js';
import { G } from '../core/state.js';
import { cam, scene } from '../render/scene.js';
import { mk, toon } from '../render/toon.js';
import { SFX } from '../audio/sfx.js';
import { makeHeroModel, play } from '../render/characters.js';
import { computeDist } from '../world/pathfinding.js';
import { spawnHero } from '../heroes/hero.js';
import { banner, refreshHud, setPhaseUI } from './hud.js';

// ================= 영웅 선택 =================
const preview = []; let podium = null, hoverCls = null;
function showSelect() {
  G.phase = 'select'; $('select').classList.remove('hidden');
  podium = new THREE.Group(); podium.position.set(0, 0, GH + 6); scene.add(podium);
  mk(new THREE.CylinderGeometry(6.2, 6.8, .7, 48), toon(0x6ab84a), 0, -.35, 0, podium, .04); mk(new THREE.CylinderGeometry(6.9, 7.2, .5, 48), toon(0x9a7a5a), 0, -.8, 0, podium, .04);
  for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28; mk(new THREE.IcosahedronGeometry(.2, 1), toon([0xff8ac0, 0xffe05a, 0xffffff][k % 3]), Math.cos(a) * 5.6, .1, Math.sin(a) * 5.6, podium, .015); }
  ['archer', 'mage', 'warrior'].forEach((cls, i) => { const ch = makeHeroModel(cls); ch.g.position.set((i - 1) * 2.7, 0, i === 1 ? -.4 : 0); ch.g.rotation.y = (1 - i) * .25; podium.add(ch.g); ch.cls = cls; play(ch, 'Idle'); ch.mixer.update(i * .7); ch.nextCheer = 1.5 + i * 2.2; ch.cheerT = 0; preview.push(ch); });
  cam.target.set(0, 1.5, GH + 6); cam.r = 13.5; cam.phi = 1.3; cam.theta = 0;
  document.querySelectorAll('.card').forEach(c => { c.onclick = () => { SFX.init(); Snd.play('confirm'); choose(c.dataset.cls); }; c.onmouseenter = () => { hoverCls = c.dataset.cls; Snd.play('select'); const p = preview.find(p => p.cls === hoverCls); if (p) { play(p, 'Cheer', { once: true }); p.cheerT = 1.8; } }; c.onmouseleave = () => hoverCls = null; });
}
function updSelect(dt) {
  for (const p of preview) { p.mixer.update(dt); p.nextCheer -= dt; if (p.cheerT > 0) { p.cheerT -= dt; if (p.cheerT <= 0) play(p, 'Idle', { fade: .3 }); }
    else if (p.nextCheer <= 0) { p.nextCheer = rnd(5, 9); play(p, p.cls === 'mage' ? 'Spellcast_Raise' : p.cls === 'archer' ? '2H_Ranged_Shoot' : (p.acts.Melee_Show ? 'Melee_Show' : '1H_Melee_Attack_Slice_Horizontal'), { once: true }); p.cheerT = 1.6; }
    p.ring.material.opacity = hoverCls === p.cls ? .95 : .45; p.ring.scale.setScalar(hoverCls === p.cls ? 1.2 + Math.sin(G.t * 6) * .05 : 1); }
  if (!G.heroShot) cam.theta = Math.sin(G.t * .2) * .18;
}
function choose(cls) {
  preview.forEach(p => p.mixer.stopAllAction()); preview.length = 0; scene.remove(podium); $('select').classList.add('hidden'); $('hud').classList.remove('hidden');
  spawnHero(cls); G.phase = 'build'; cam.target.set(0, 0, 1); cam.r = 58; cam.phi = .9; cam.theta = .22;
  computeDist(); setPhaseUI(); refreshHud(); banner(`${heroLabel(cls)} 출전!`, '#ffe066');
}

export { showSelect, updSelect, choose };
