// 타워 성장 (판 안): XP → ★★/★★★, 별 표시·성장 외형·레벨업 연출, ★★★ 분기 적용. 성장(G.grow)이 꺼져 있으면 아무것도 하지 않음
import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { G } from '../core/state.js';
import { TOWERS } from '../data/towers.js';
import { BRANCH, XP_NEED, starsFor, towerStats, branchFor, AWK, awakenStatus, awkBlock, awkBranch, awkCost, awkTowerDone, TTYPES } from '../data/growth.js';
import { Q } from '../render/quality.js';
import { camera, scene } from '../render/scene.js';
import { glow, mk, toon } from '../render/toon.js';
import { P, PB, emit, ringFx } from '../render/vfx.js';
import { banner, refreshHud } from '../ui/hud.js';

const starShape = (() => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? .1 : .24, a = Math.PI / 2 + i * Math.PI / 5; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return s; })();
const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: .06, bevelEnabled: true, bevelSize: .025, bevelThickness: .02, bevelSegments: 1 }).center();
const starOn = glow(0xffd23a, 2.2), starOff = new THREE.MeshBasicMaterial({ color: 0x4a4458, transparent: true, opacity: .75 });
const goldM = toon(0xffcc44, { emissive: 0x3a2200 });
const add = (geo, color, op = .8) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const fx = []; // 빛기둥 등 자체 이펙트

export const recalc = tw => { tw.S = towerStats(tw.type, tw.lvl, tw.stars, tw.branch, tw.mods, !!tw.awk); tw.B = branchFor(tw.type, tw.branch, tw.mods); if (tw.awk) tw.B = awkBranch(tw.type, tw.branch, tw.B); }; // tw.B = 분기 + 전직 보너스 (+ ✨초월 덧씌움)
// 모델 위 꾸밈: 별(빌보드) + XP 막대 + 별 단계별 외형 (모델을 다시 만들면 다시 호출)
export function decorate(tw) {
  if (!G.grow || !tw.m) return; const g = tw.m.g, box = new THREE.Box3().setFromObject(g), top = box.max.y + .55, D = { orb: [], top };
  const bill = new THREE.Group(); bill.position.y = top; g.add(bill); D.bill = bill; D.stars = [];
  for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(starGeo, k < tw.stars ? starOn : starOff); s.position.x = (k - 1) * .5; s.scale.setScalar(k < tw.stars ? 1 : .8); bill.add(s); D.stars.push(s); }
  const xb = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .07), new THREE.MeshBasicMaterial({ color: 0x1a1426, transparent: true, opacity: .7, depthWrite: false })); xb.position.y = -.28; bill.add(xb);
  D.xf = new THREE.Mesh(new THREE.PlaneGeometry(1, .07), new THREE.MeshBasicMaterial({ color: 0x9affd0, toneMapped: false, depthWrite: false, transparent: true })); D.xf.position.set(0, -.28, .001); bill.add(D.xf);
  const B = tw.branch && BRANCH[tw.type][tw.branch], bc = B ? new THREE.Color(B.c).getHex() : 0xffd23a;
  if (tw.stars >= 2) { // ★★: 금 테두리 + 궤도 룬
    mk(new THREE.TorusGeometry(.98, .06, 6, 28), goldM, 0, .47, 0, g, .015).rotation.x = Math.PI / 2;
    const n = tw.stars >= 3 ? 4 : 2; for (let k = 0; k < n; k++) { const o = mk(new THREE.OctahedronGeometry(.13), glow(k % 2 ? 0xffe06a : bc, 2.4), 0, 0, 0, g, .015); o.userData.a = k * Math.PI * 2 / n; D.orb.push(o); }
  }
  if (tw.stars >= 3) { // ★★★: 바닥 오라 + 분기 장식
    const aura = new THREE.Mesh(new THREE.RingGeometry(.9, 1.35, 40), add(0, bc, .55)); aura.rotation.x = -Math.PI / 2; aura.position.y = .5; g.add(aura); D.aura = aura;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.6, 24, 1, true), add(0, bc, .12)); col.position.y = 1.8; g.add(col); D.col = col;
    if (B) branchDeco(tw, g, B, bc, D);
  }
  if (tw.awk) awkDeco(tw, g, D);
  tw.deco = D; updXpBar(tw);
}
function branchDeco(tw, g, B, bc, D) { const h = tw.m.head;
  if (tw.branch === 'multi') for (const x of [-.32, .32]) { const b = mk(new THREE.TorusGeometry(.3, .035, 6, 12, Math.PI), glow(bc, 1.6), x, .12, .3, h, .015); b.rotation.x = Math.PI / 2; b.rotation.z = x > 0 ? -.4 : .4; }
  else if (tw.branch === 'snipe') { mk(new THREE.CylinderGeometry(.06, .06, 1.1, 8), toon(0x30333e), 0, .14, .5, h, .015).rotation.x = Math.PI / 2; mk(new THREE.SphereGeometry(.09, 8, 6), glow(bc, 3), 0, .2, 1.05, h, 0); }
  else if (tw.branch === 'blast') for (let k = 0; k < 6; k++) { const s = mk(new THREE.ConeGeometry(.1, .4, 6), glow(bc, 1.8), Math.cos(k * 1.05) * .6, 0, Math.sin(k * 1.05) * .6, h, .015); s.rotation.set(Math.sin(k * 1.05) * 1.2, 0, -Math.cos(k * 1.05) * 1.2); }
  else if (tw.branch === 'pierce') { const b = mk(new THREE.CylinderGeometry(.11, .14, 1.9, 10), toon(0x5a6a8a), 0, .15, .8, h, .015); b.rotation.x = Math.PI / 2 - .2; mk(new THREE.TorusGeometry(.15, .04, 6, 12), glow(bc, 2.5), 0, .33, 1.7, h, 0).rotation.x = -.2; }
  else if (tw.branch === 'storm') { D.spin = []; for (let k = 0; k < 3; k++) { const s = mk(new THREE.IcosahedronGeometry(.16, 0), glow(bc, 3), 0, 0, 0, h, .015); s.userData.a = k * 2.09; D.spin.push(s); } }
  else if (tw.branch === 'frost') for (let k = 0; k < 5; k++) { const s = mk(new THREE.OctahedronGeometry(.16, 0), glow(bc, 2), Math.cos(k * 1.26) * .95, .7 + (k % 2) * .3, Math.sin(k * 1.26) * .95, g, .015); s.scale.y = 2.4; }
}
function updXpBar(tw) { const D = tw.deco; if (!D) return; const s = tw.stars, k = s >= 3 ? 1 : (tw.xp - XP_NEED[s - 1]) / (XP_NEED[s] - XP_NEED[s - 1]); const w = Math.max(.001, Math.min(1, k)) * 1.3; D.xf.scale.x = w; D.xf.position.x = -.65 + w / 2;
  D.xf.material.color.setHex(s >= 3 ? (tw.branch ? 0xffd23a : 0xff9a3a) : 0x9affd0); }
// 매 프레임 (updTowers에서)
export function updDeco(tw, dt) { const D = tw.deco; if (!D) return; D.bill.quaternion.copy(camera.quaternion); const t = G.t;
  D.bill.position.y = D.top + Math.sin(t * 2.2 + tw.c) * .06;
  if (tw.branchPending) D.stars.forEach((s, k) => s.scale.setScalar(1 + Math.sin(t * 6 + k) * .18));
  D.orb.forEach(o => { const a = o.userData.a + t * 1.6; o.position.set(Math.cos(a) * 1.15, 1.3 + Math.sin(t * 2 + o.userData.a) * .25, Math.sin(a) * 1.15); o.rotation.y += dt * 3; });
  if (D.aura) { const k = .5 + .5 * Math.sin(t * 3 + tw.c); D.aura.material.opacity = .35 + k * .35; D.aura.scale.setScalar(1 + k * .12); D.col.material.opacity = .06 + k * .08; D.col.rotation.y += dt; }
  if (D.spin) D.spin.forEach(s => { const a = s.userData.a + t * 4; s.position.set(Math.cos(a) * .9, Math.sin(t * 5 + s.userData.a) * .2, Math.sin(a) * .9); });
  if (D.awk) { const A = D.awk; A.crown.rotation.y += dt * .8; A.runes.forEach(r => { const a = r.userData.a + t * 1.1; r.position.set(Math.cos(a) * 1.55, 2.1 + Math.sin(t * 1.7 + r.userData.a) * .3, Math.sin(a) * 1.55); r.rotation.y += dt * 2.5; });
    if (A.aura) { const k = .5 + .5 * Math.sin(t * 2.4 + tw.c); A.aura.scale.setScalar(1 + k * .1); A.aura.rotation.z += dt * .6; } } }
export function updGrowFx(dt) { for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const k = f.t / f.dur; f.m.scale.set(1 + k * .6, 1 + k * 1.5, 1 + k * .6); f.m.material.opacity = (1 - k) * .85; if (k >= 1) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); fx.splice(i, 1); } } }
// XP 획득 (성장 켜짐 + 살아 있는 타워만). 반환: 오른 별 수
export function towerXp(tw, amt) {
  if (!G.grow || !tw || tw.dead || !(amt > 0) || tw.stars >= 3) return 0; tw.xp += amt; const ns = starsFor(tw.xp); if (ns <= tw.stars) { if (tw.deco && (G.t - (tw._xpT || 0) > .1)) { tw._xpT = G.t; updXpBar(tw); } return 0; }
  const up = ns - tw.stars; tw.stars = ns; recalc(tw); starUpFx(tw); if (ns >= 3) { tw.branchPending = true; if (G.onBranchReady) G.onBranchReady(tw); } return up;
}
export function redecorate(tw) { if (!tw.m) return; const ry = tw.m.head.rotation.y; scene.remove(tw.m.g); tw.m = tw.rebuild(); tw.m.head.rotation.y = ry; scene.add(tw.m.g); decorate(tw); }
function starUpFx(tw) {
  redecorate(tw); tw.pop = 0; const p = tw.m.g.position, s = tw.stars, c = s >= 3 ? 0xffb03a : 0xffe066;
  const pil = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.2, 9, 24, 1, true), add(0, c, .85)); pil.position.set(p.x, 4.5, p.z); scene.add(pil); fx.push({ m: pil, t: 0, dur: .9 });
  emit(PB, p.x, 2.5, p.z, 16 + s * 6, c, 4, 1, 1, 1); emit(P, p.x, 1, p.z, 60 + s * 30, 0xfff0a0, 7, 1.1, -3, 2); emit(P, p.x, 4, p.z, 30, 0xffffff, 3, 1.4, 2, .6);
  ringFx(p, 3 + s, c, .7); setTimeout(() => ringFx(p, 2 + s, 0xffffff, .5), 120); G.shake = Math.max(G.shake, .12 * s);
  Snd.play('levelUp', { pos: p, vol: .8 }); Snd.play('upgrade', { pos: p, delay: .1 }); if (s >= 3) Snd.play('meteorCast', { pos: p, vol: .6 });
  banner(`${TOWERS[tw.type].n} ${'★'.repeat(s)}${s >= 3 ? ' · 진화를 선택하세요!' : '!'}`, s >= 3 ? '#ffb03a' : '#ffe066', 1400); refreshHud();
}
// ★★★ 분기 선택
export function chooseBranch(tw, key) {
  if (!tw || tw.dead || tw.stars < 3 || tw.branch || !BRANCH[tw.type][key]) return false; tw.branch = key; tw.branchPending = false; tw.shots = 0; recalc(tw); redecorate(tw); tw.pop = 0;
  const B = BRANCH[tw.type][key], p = tw.m.g.position, c = new THREE.Color(B.c).getHex();
  const pil = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 12, 24, 1, true), add(0, c, .9)); pil.position.set(p.x, 6, p.z); scene.add(pil); fx.push({ m: pil, t: 0, dur: 1.1 });
  emit(PB, p.x, 2.5, p.z, 30, c, 6, 1.1, 0, 1.5); emit(P, p.x, 1.2, p.z, 120, c, 9, 1.2, -4, 2); ringFx(p, 5, c, .8); setTimeout(() => ringFx(p, 3.5, 0xffffff, .5), 150);
  G.shake = Math.max(G.shake, .4); Snd.play('meteorCast', { pos: p, force: true }); Snd.play('levelUp', { pos: p, force: true, delay: .15 });
  banner(`${B.icon} ${TOWERS[tw.type].n} → ${B.n}!`, B.c, 1600); refreshHud(); checkAwaken(); return true;
}

// ================= ✨ 초월 (하드 스테이지 전용, docs/TOWER_AWAKEN_2026-10-24.md) =================
// 상태: tw.awk (판 안) · G.awkOpen (이번 판 해금 — 한 번 열리면 유지) · G.awkN (계측). 저장 변경 없음
const crownGeo = new THREE.TorusGeometry(.62, .08, 8, 32), spikeGeo = new THREE.ConeGeometry(.09, .34, 6), runeGeo = new THREE.OctahedronGeometry(.16, 0), awAuraGeo = new THREE.RingGeometry(1.35, 1.85, 48);
const crownM = glow(0xffd23a, 2.8), awkMats = {}, awkMat = type => awkMats[type] || (awkMats[type] = { rune: glow(new THREE.Color(AWK[type].c).getHex(), 3), aura: add(0, new THREE.Color(AWK[type].c).getHex(), .5) });
export const awkCnt = k => { const N = (G.awkN ||= {}); N[k] = (N[k] || 0) + 1; };
// 금빛 왕관 링(+뾰족 5개) · 궤도 룬 3개 · 색 오라. 성능 모드: 정적 왕관 링 1개만 (룬·오라 없음)
function awkDeco(tw, g, D) { const M = awkMat(tw.type), crown = new THREE.Group(); crown.position.y = D.top - .25; g.add(crown);
  const ring = new THREE.Mesh(crownGeo, crownM); ring.rotation.x = Math.PI / 2; crown.add(ring); const A = { crown, runes: [], aura: null }; D.awk = A;
  if (Q.perf) return;
  for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5, sp = new THREE.Mesh(spikeGeo, crownM); sp.position.set(Math.cos(a) * .62, .2, Math.sin(a) * .62); crown.add(sp); }
  for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(runeGeo, M.rune); r.userData.a = k * Math.PI * 2 / 3; r.scale.y = 1.8; g.add(r); A.runes.push(r); }
  const aura = new THREE.Mesh(awAuraGeo, M.aura); aura.rotation.x = -Math.PI / 2; aura.position.y = .55; g.add(aura); A.aura = aura; }
function awkPillar(p, c, h = 12, dur = 1.2) { if (Q.perf) return; const pil = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, h, 24, 1, true), add(0, c, .9)); pil.position.set(p.x, h / 2, p.z); scene.add(pil); fx.push({ m: pil, t: 0, dur }); }
const pk = n => Q.perf ? Math.ceil(n / 3) : n; // 성능 모드 파티클 1/3
// 해금 확인 — chooseBranch · upgradeTower 끝에서만 (매 프레임 아님). 하드 스테이지(G.hard) 판에서만: 던전·무한의 탑·노말 제외
export function checkAwaken() {
  if (G.awkOpen || !G.hard || !G.grow || G.dungeon || G.phase === 'over') return false; const st = awakenStatus(G.towers, true, G.research); if (!st.ok) return false;
  G.awkOpen = true; G.awkOpenT = G.t; awkCnt('open');
  for (const t of TTYPES) { const tw = G.towers.find(w => w.type === t && awkTowerDone(w)); if (!tw || !tw.m) continue; const p = tw.m.g.position, c = new THREE.Color(AWK[t].c).getHex();
    awkPillar(p, c); ringFx(p, 5, 0xffd23a, .8); setTimeout(() => ringFx(p, 3.5, 0xffffff, .5), 150); emit(PB, p.x, 2.5, p.z, pk(24), c, 6, 1.1, 0, 1.5); emit(P, p.x, 1.2, p.z, pk(90), 0xfff0a0, 8, 1.2, -4, 2); }
  G.shake = Math.max(G.shake, .35); Snd.play('meteorCast', { force: true }); Snd.play('levelUp', { force: true, delay: .2 });
  setTimeout(() => banner('✨ 초월 해금! 세 타워가 정점에 올랐어요', '#ffd23a', 2600), 700); /* 진화 배너 다음에 */ refreshHud(); return true;
}
// 초월 구매 (판 안 골드). 성공 true
export function awakenTower(tw) {
  const why = awkBlock(tw, G.towers, G.gold, !!G.awkOpen && !!G.hard); if (why) { Snd.play('error'); if (why !== '초월 완료') banner(why === '골드 부족' ? '골드가 부족합니다' : `초월 불가: ${why}`, '#ff8a8a', 900); return false; }
  const c = awkCost(tw.type); G.gold -= c; tw.invest += c; tw.awk = true; tw.awkShots = 0; { const nm = Math.round(tw.max * AWK.hp); tw.hp += nm - tw.max; tw.max = nm; if (tw.hb) tw.hb.set(tw.hp / tw.max); }
  recalc(tw); redecorate(tw); tw.pop = 0; G.stats.awk = (G.stats.awk || 0) + 1; awkCnt('buy');
  const A = AWK[tw.type], p = tw.m.g.position, col = new THREE.Color(A.c).getHex(); awkPillar(p, col, 14, 1.3);
  emit(PB, p.x, 2.5, p.z, pk(30), col, 6, 1.1, 0, 1.5); emit(P, p.x, 1.2, p.z, pk(120), 0xffe9a0, 9, 1.2, -4, 2); ringFx(p, 5.5, 0xffd23a, .8); setTimeout(() => ringFx(p, 3.5, col, .5), 150);
  G.shake = Math.max(G.shake, .4); Snd.play('meteorCast', { pos: p, force: true }); Snd.play('upgrade', { pos: p, delay: .1 }); Snd.play('levelUp', { pos: p, force: true, delay: .2 });
  banner(`✨ ${TOWERS[tw.type].n} → ${A.icon} ${A.n}!`, A.c, 1800); refreshHud(); return true;
}
G.awakenTower = awakenTower; G.checkAwaken = checkAwaken;
