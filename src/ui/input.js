import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { $ } from '../core/util.js';
import { GH, S, SPAWN, SPAWNS, T, inGrid, isBlock, tileX, tileZ, toTile } from '../core/grid.js';
import { BLK, TNAME } from '../data/terrain.js';
import { UPS } from '../data/heroes.js';
import { TOWERS } from '../data/towers.js';
import { G } from '../core/state.js';
import { cam, camera, renderer, scene } from '../render/scene.js';
import { SFX } from '../audio/sfx.js';
import { P, debris, emit, ringFx } from '../render/vfx.js';
import { refreshTile, tileAt } from '../world/terrain.js';
import { computeDist, dijkstra } from '../world/pathfinding.js';
import { addBarricade, barMaxHp, removeBarricade } from '../world/barricades.js';
import { placeTower, repairAll, repairTower, sellTower, upgradeTower } from '../world/towers.js';
import { groundY } from '../monsters/ai.js';
import { hero, heroGoTo, startWarp } from '../heroes/hero.js';
import { castSkill } from '../heroes/skills.js';
import { castLegend } from '../heroes/legend.js';
import { startWave } from '../core/waves.js';
import { banner, refreshHud } from './hud.js';
import { showPreview, hidePreview } from './preview.js';

// ================= 입력 / 건설 =================
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), mouseGround = new THREE.Vector3();
const rangeRing = new THREE.Mesh(new THREE.RingGeometry(.93, 1, 96), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); rangeRing.material.depthTest = false; rangeRing.renderOrder = 6; rangeRing.rotation.x = -Math.PI / 2; rangeRing.visible = false; scene.add(rangeRing);
const rangeFill = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: .14, depthWrite: false, depthTest: false, side: THREE.DoubleSide })); rangeRing.add(rangeFill);
const moveMark = new THREE.Mesh(new THREE.RingGeometry(.4, .55, 24), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, toneMapped: false })); moveMark.rotation.x = -Math.PI / 2; moveMark.visible = false; scene.add(moveMark);
let rdrag = null; const keys = {};
const cvs = renderer.domElement; cvs.addEventListener('contextmenu', e => e.preventDefault());
function showRange(x, z, r, color = 0x9ae8ff) { rangeRing.visible = true; rangeRing.position.set(x, .25, z); rangeRing.scale.setScalar(r); rangeRing.material.color.set(color); rangeFill.material.color.set(color); }
function tileInfo(t) {
  if (t.tower) return `<b>${TOWERS[t.tower.type].n} Lv.${t.tower.lvl}${G.grow ? ' ' + '★'.repeat(t.tower.stars) : ''}</b> · 클릭하여 강화/판매`;
  if (t.bar) return `<b>바리케이드</b> ${Math.ceil(t.bar.hp)}/${Math.ceil(t.bar.max)}`;
  if (isBlock(t.t)) return `<b>${BLK[t.t].n}</b> 내구도 ${Math.ceil(t.hp)}/${t.max} · 개간 ${BLK[t.t].clear}G`;
  return `<b>${TNAME[t.t]}</b>${t.t === T.GRASS ? ' · 타워 건설 가능' : t.t === T.CARVED ? ' · 바리케이드 설치 가능' : t.t === T.BEDROCK ? ' · 파괴 불가' : ''}`;
}
function onMove(cx, cy) {
  mouse.set(cx / innerWidth * 2 - 1, -cy / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera); ray.ray.intersectPlane(groundPlane, mouseGround);
  const [c, r] = toTile(mouseGround.x, mouseGround.z), ok = inGrid(c, r) && G.phase !== 'select' && G.phase !== 'loading', tip = $('tip');
  const bmode = ok && G.tool !== 'move'; rangeRing.visible = false; if (!bmode) hidePreview();
  if (ok) { const t = tileAt(c, r); tip.classList.remove('hidden'); tip.style.left = cx + 'px'; tip.style.top = cy + 'px'; tip.innerHTML = tileInfo(t);
    if (bmode) { const why = buildReason(c, r), valid = !why; showPreview(c, r, valid, G.tool); tip.innerHTML = previewTip(t, why);
      if (TOWERS[G.tool] && t.t === T.GRASS) showRange(tileX(c), tileZ(r), TOWERS[G.tool].range[0], valid ? 0x7affa0 : 0xff6a6a); }
    else if (t.tower) showRange(tileX(c), tileZ(r), t.tower.S.range); }
  else tip.classList.add('hidden');
  if (G.sel && G.sel.kind === 'tower' && !rangeRing.visible) showRange(tileX(G.sel.c), tileZ(G.sel.r), G.sel.S.range, 0xffe066);
}
cvs.addEventListener('pointermove', e => {
  if (rdrag) { cam.theta -= (e.clientX - rdrag.x) * .008; cam.phi = Math.min(1.25, Math.max(.45, cam.phi - (e.clientY - rdrag.y) * .005)); rdrag = { ...rdrag, x: e.clientX, y: e.clientY }; }
  onMove(e.clientX, e.clientY);
});
// 터치는 손을 떼면 pointerleave가 바로 오므로 툴팁(건설 불가 사유 등)을 잠시 보여 준 뒤 닫는다
let tipHideT = 0; cvs.addEventListener('pointerleave', e => { clearTimeout(tipHideT); if (e.pointerType === 'mouse') $('tip').classList.add('hidden'); else tipHideT = setTimeout(() => $('tip').classList.add('hidden'), 1800); });
cvs.addEventListener('pointerdown', e => {
  SFX.init(); if (e.button === 2) { rdrag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; return; } if (e.button !== 0 || !hero || G.phase === 'select' || G.phase === 'over') return;
  onMove(e.clientX, e.clientY); const [c, r] = toTile(mouseGround.x, mouseGround.z);
  if (G.tool === 'move' || !inGrid(c, r)) {
    if (inGrid(c, r)) { const t = tileAt(c, r); if (t.tower) return select(t.tower); if (t.bar) return select(t.bar); } select(null);
    if (hero.dead > 0) return; heroGoTo(mouseGround); moveMark.position.set(mouseGround.x, groundY(mouseGround.x, mouseGround.z) + .1, mouseGround.z); moveMark.visible = true; moveMark.scale.setScalar(1.5); return;
  }
  build(c, r);
});
addEventListener('pointerup', e => { if (rdrag && e.button === 2 && Math.hypot(e.clientX - rdrag.x0, e.clientY - rdrag.y0) < 6 && G.tool !== 'move') setTool('move'); rdrag = null; });
cvs.addEventListener('wheel', e => { cam.r = Math.min(90, Math.max(14, cam.r + e.deltaY * .03)); }, { passive: true });
addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys[k] = true; if (k === 'q') castSkill(); if (k === 't' && !e.repeat) startWarp(); if (k === 'e' && !e.repeat) castLegend(); if (k === 'r' && !e.repeat) { if (G.sel && G.sel.kind === 'tower') repairTower(G.sel); else repairAll(); refreshHud(); } const tools = ['arrow', 'cannon', 'magic', 'barricade', 'clear']; if (e.key >= '1' && e.key <= '5') setTool(tools[+e.key - 1]); if (e.key === 'Escape') { setTool('move'); select(null); } if (e.key === ' ' && G.phase === 'build') { e.preventDefault(); startWave(); } });
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
$('rotL').onclick = () => { cam.theta += Math.PI / 4; Snd.play('ui'); }; $('rotR').onclick = () => { cam.theta -= Math.PI / 4; Snd.play('ui'); };
function occupied(c, r) {
  if (G.enemies.some(e => !e.dead && !e.E.fly && ((e.tile[0] === c && e.tile[1] === r) || (e.next && e.next[0] === c && e.next[1] === r)))) return true;
  if (hero && hero.dead <= 0) { const [hc, hr] = toTile(hero.g.position.x, hero.g.position.z); if (hc === c && hr === r) return true; } return false;
}
function toolCost(t) { const tool = G.tool; return TOWERS[tool] ? TOWERS[tool].cost : tool === 'barricade' ? 30 : tool === 'clear' && isBlock(t.t) ? BLK[t.t].clear : 0; }
const TOOLN = { barricade: '바리케이드', clear: '개간' };
// 불가 사유 (가능하면 null)
function buildReason(c, r) {
  if (!inGrid(c, r)) return '맵 밖'; const t = tileAt(c, r), tool = G.tool, cost = toolCost(t);
  if (TOWERS[tool] || tool === 'barricade') {
    if (t.tower) return '이미 타워가 있음'; if (t.bar) return '이미 바리케이드가 있음';
    if (TOWERS[tool] && t.t !== T.GRASS) return isBlock(t.t) ? '지형 블록 (먼저 개간)' : t.t === T.CARVED ? '파인 길 (바리케이드만 가능)' : '건설 불가 지형';
    if (tool === 'barricade' && t.t !== T.CARVED && t.t !== T.GRASS) return isBlock(t.t) ? '지형 블록' : '설치 불가 지형';
    if (occupied(c, r)) return '유닛이 서 있음'; if (G.gold < cost) return `골드 부족 (${cost - G.gold}G 더 필요)`;
    if (TOWERS[tool] && !canBuild(c, r)) return '경로 차단'; return null; }
  if (tool === 'clear') { if (!isBlock(t.t)) return t.t === T.BEDROCK ? '파괴 불가 암반' : '개간할 블록 없음'; if (G.gold < cost) return `골드 부족 (${cost - G.gold}G 더 필요)`; return null; }
  return '도구 없음';
}
function previewTip(t, why) { const tool = G.tool, cost = toolCost(t), name = TOWERS[tool] ? TOWERS[tool].n : TOOLN[tool];
  let s = `<b>${name}</b> <span class="cost">${cost ? cost + 'G' : ''}</span>`;
  if (tool === 'clear' && isBlock(t.t)) s += `<br>${BLK[t.t].n} · 내구도 ${Math.ceil(t.hp)}/${t.max}`;
  if (TOWERS[tool]) s += `<br>사거리 ${TOWERS[tool].range[0]} · 피해 ${TOWERS[tool].dmg[0]}`;
  return s + `<br>${why ? `<span class="bad">✖ ${why}</span>` : `<span class="good">✔ 클릭하여 ${tool === 'clear' ? '개간' : '건설'}</span>`}`; }
function canBuild(c, r) {
  if (!inGrid(c, r)) return false; const t = tileAt(c, r), tool = G.tool;
  if (TOWERS[tool]) { if (t.t !== T.GRASS || t.tower || t.bar || G.gold < TOWERS[tool].cost || occupied(c, r)) return false; const D = dijkstra(t); return SPAWNS.every(s => isFinite(D[s[0] * GH + s[1]])); }
  if (tool === 'barricade') return (t.t === T.CARVED || t.t === T.GRASS) && !t.tower && !t.bar && G.gold >= 30 && !occupied(c, r);
  if (tool === 'clear') return isBlock(t.t) && G.gold >= BLK[t.t].clear;
  return false;
}
function build(c, r) {
  if (!canBuild(c, r)) { Snd.play('error'); const why = buildReason(c, r); if (why) banner(why === '경로 차단' ? '경로 차단: 길을 완전히 막을 수 없습니다' : why, '#ff8a9a', 900); return false; }
  const t = tileAt(c, r), p = new THREE.Vector3(tileX(c), .5, tileZ(r));
  if (TOWERS[G.tool]) { G.gold -= TOWERS[G.tool].cost; placeTower(t, G.tool); emit(P, p.x, .5, p.z, 30, 0xffe066, 5, .6, -6, 2); debris(p.x, .3, p.z, 8, [0xe0dacb, 0x9e98ae], 4); ringFx(p, 2, 0xffe066, .4); }
  else if (G.tool === 'barricade') { G.gold -= 30; addBarricade(t); emit(P, p.x, .6, p.z, 16, 0xffb03a, 4, .5); }
  else if (G.tool === 'clear') { const B = BLK[t.t]; G.gold -= B.clear; debris(p.x, .8, p.z, 16, B.deb, 6); emit(P, p.x, .8, p.z, 24, 0x8ad05a, 4, .7); t.t = T.GRASS; t.hp = t.max = 0; refreshTile(t); }
  if (!TOWERS[G.tool]) Snd.play(G.tool === 'barricade' ? 'build' : 'breakDirt', { pos: { x: tileX(c), z: tileZ(r) }, force: true }); computeDist(); refreshHud(); return true;
}
function setTool(t) { if (G.tool !== t) Snd.play('ui'); G.tool = t; const mi = $('modeInd');
  if (mi) { mi.classList.toggle('hidden', t === 'move'); mi.classList.toggle('clear', t === 'clear'); if (t !== 'move') mi.innerHTML = `${t === 'clear' ? '⛏ 개간 모드' : t === 'barricade' ? '🧱 바리케이드 설치' : '🏰 건설 모드: ' + TOWERS[t].n} <small>Esc / 우클릭: 취소</small>`; }
  if (t === 'move') { hidePreview(); rangeRing.visible = false; } document.querySelectorAll('.tool').forEach(b => b.classList.toggle('sel', b.dataset.tool === t)); if (t !== 'move') select(null); }
document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
(function sndUI() { const C = Snd.cfg; $('bgmOn').checked = C.bgmOn; $('sfxOn').checked = C.sfxOn; $('bgmVol').value = Math.round(C.bgm * 100); $('sfxVol').value = Math.round(C.sfx * 100);
  const upd = () => { C.bgmOn = $('bgmOn').checked; C.sfxOn = $('sfxOn').checked; C.bgm = $('bgmVol').value / 100; C.sfx = $('sfxVol').value / 100; Snd.apply(); Snd.save(); $('sndBtn').classList.toggle('muted', !C.bgmOn && !C.sfxOn); };
  ['bgmOn', 'sfxOn', 'bgmVol', 'sfxVol'].forEach(id => $(id).addEventListener('input', upd)); $('sfxVol').addEventListener('change', () => Snd.play('coin', { force: true }));
  $('sndBtn').onclick = () => { Snd.unlock(); $('sndPanel').classList.toggle('hidden'); Snd.play('ui'); }; upd();
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'm' && !e.repeat) { const on = !(C.bgmOn || C.sfxOn); $('bgmOn').checked = $('sfxOn').checked = on; upd(); } });
})();
$('startWave').onclick = startWave; $('skillBtn').onclick = castSkill; $('warpBtn').onclick = () => startWarp(); $('legBtn').onclick = () => castLegend();
const upCost = k => Math.round(UPS[k].base * Math.pow(1.45, G.ups[k]));
document.querySelectorAll('.up').forEach(b => b.onclick = () => { const k = b.dataset.up, c = upCost(k); if (G.gold < c) return Snd.play('error'); G.gold -= c; G.ups[k]++;
  if (k === 'bar') for (const col of G.tiles) for (const t of col) if (t.bar) { const r = t.bar.hp / t.bar.max; t.bar.max = barMaxHp(); t.bar.hp = t.bar.max * r; }
  Snd.play('upgrade'); Snd.play('levelUp', { vol: .6 }); if (hero) emit(P, hero.g.position.x, 1.5, hero.g.position.z, 24, 0xffe066, 4, .7); refreshHud(); });
function select(o) { G.sel = o; $('tinfo').classList.toggle('hidden', !o); if (o && o.kind === 'tower') showRange(tileX(o.c), tileZ(o.r), o.S.range, 0xffe066); else rangeRing.visible = false; refreshHud(); }
$('tUp').onclick = () => { if (G.sel && G.sel.kind === 'tower') { upgradeTower(G.sel); select(G.sel); } };
$('tRep').onclick = () => { if (G.sel && G.sel.kind === 'tower') { repairTower(G.sel); select(G.sel); } };
$('tSell').onclick = () => { const s = G.sel; if (!s) return; if (s.kind === 'tower') sellTower(s); else { G.gold += 15; removeBarricade(s.t, false); refreshHud(); } };

export { onMove, buildReason, mouseGround, moveMark, keys, build, setTool, upCost, select };
