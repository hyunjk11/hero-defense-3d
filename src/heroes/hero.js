import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { $, rand } from '../core/util.js';
import { CORE, DIRS, GH, T, inGrid, tileX, tileZ, toTile } from '../core/grid.js';
import { CLASSES, heroLabel } from '../data/heroes.js';
import { applyAdv } from '../data/advance.js';
import { G, later, asSkill } from '../core/state.js';
import { newMeter, meterTaken } from '../combat/meter.js';
import { cam, scene } from '../render/scene.js';
import { P, emit, ringFx } from '../render/vfx.js';
import { hpBar } from '../render/hpbars.js';
import { flashMats, makeHeroModel, play } from '../render/characters.js';
import { tileAt } from '../world/terrain.js';
import { Heap } from '../world/pathfinding.js';
import { aoe, shoot } from '../combat/projectiles.js';
import { hurt } from '../monsters/enemy.js';
import { groundY } from '../monsters/ai.js';
import { banner } from '../ui/hud.js';
import { keys } from '../ui/input.js';
import { legendProc, updLeap, updLegendHero } from './legend.js';
import { gunAttack, updRose } from './gunner.js';
import { mechAbsorb, mechInit, mechRevert, mechSwing, updMech } from './mechanic.js';
import { fighterInit, fighterTick, ftStop, updFtLeap, ftGuard } from './fighter.js';
import { advFx, advInit, advUpd, advPick, advArrow, advOrb, advLeech, advAtkMul, advOnHurt } from './advfx.js';
import { uqInit, uqPreHit, uqPostHit, uqOnDeath, uqRate } from './unique.js';

// ================= 영웅 =================
let hero = null; // 현재 '문맥' 영웅 (stat·스킬·전직·전설 모듈이 이 값을 씀). 평소 = G.hero(조작 영웅), 파티 업데이트 중에만 잠깐 다른 영웅
G.heroes = []; G.curHero = null; // 파티 (src/core/party.js). 일반 스테이지·하드·도전 = [G.hero] 1명
// 영웅 h 문맥으로 fn 실행 (같은 영웅이면 그냥 호출 → 단일 영웅에서는 기존과 동일). later()/FX 콜백도 만든 영웅 문맥으로 실행됨 (core/state.js)
function withHero(h, fn) { if (!h || h === hero) return fn(); const prev = hero; hero = G.curHero = h; try { return fn(); } finally { hero = G.curHero = prev; } }
G.withHero = withHero;
// 조작 영웅 바꾸기 (던전 초상화 탭): G.hero = 조작/주 영웅
function setControlled(h) { if (!h) return; hero = G.hero = G.curHero = h; heroHud(); }
// 던전 축복(판 한정, data/dungeon.js blessMods): G.dgM 은 던전 원정 중에만 있음 → 일반 판은 NOM(전부 1/0) = 기존과 동일
const NOM = { rate: 1, dmg: 1, crit: 0, critD: 0, range: 1, cd: 1, taken: 1 }, dgm = (h = hero) => (G.dgM && h && G.dgM(h)) || NOM;
const stat = {
  dmg: () => { const M = dgm(), b = hero.C.dmg * (1 + .15 * G.ups.atk) * (hero.uqAtk || 1) * (hero.adv ? advAtkMul() : 1) * M.dmg, q = hero.eq, cc = ((q && q.crit) || 0) + ((hero.adv && hero.adv.atk.crit) || 0) + M.crit; stat.crit = cc > 0 && Math.random() * 100 < cc; return stat.crit ? b * (1.5 + (((q && q.critD) || 0) + M.critD) / 100) : b; }, // 치명타 = 장비 + 전직(장미 저격수 +15%). stat.crit = 마지막 계산이 치명타였는지
  rate: () => hero.C.rate * (1 + .1 * G.ups.spd) * uqRate() * dgm().rate, range: () => hero.C.range * (1 + .08 * G.ups.rng) * (hero.robo ? 1.45 : 1) * dgm().range, // 메카닉 로봇: 사거리 +45%
  skillMul: () => (1 + .25 * G.ups.skill) * (1 + ((hero.eq && hero.eq.skill) || 0) / 100), skillCd: () => hero.C.cd * Math.pow(.92, G.ups.skill) * (1 - Math.min(40, (hero.eq && hero.eq.cdr) || 0) / 100) * dgm().cd,
};
G.heroStat = stat; // 테스트용 (현재 문맥 영웅의 공격력·공속·사거리…)
// L = 영웅별 출정 정보 { perm, equip, legend, adv, uq } (던전 파티). 없으면 기존처럼 G.perm/G.equip/… (단일 영웅). party=true 면 G.heroes 에 추가, 아니면 [이 영웅] 으로 교체
function spawnHero(cls, L = null, party = false) {
  if (L) { const keep = { perm: G.perm, equip: G.equip, legend: G.legend, adv: G.adv, uq: G.uq }; Object.assign(G, L); try { return spawnHero(cls, null, party); } finally { Object.assign(G, keep); } }
  let C = CLASSES[cls]; if (G.perm) C = { ...C, hp: Math.round(C.hp * (1 + .06 * (G.perm.hp || 0))), dmg: C.dmg * (1 + .05 * (G.perm.atk || 0)) }; // 마을 영구 강화
  if (G.perm && G.adv && G.adv.h === cls) C = applyAdv(C, G.adv); // 전직 (마을 출정 때만): 기본 → 여신탑 → 전직 → 장비
  const q = G.perm && G.equip ? G.equip : null; if (q) C = { ...C, hp: Math.round(C.hp * (1 + (q.hp || 0) / 100)), dmg: C.dmg * (1 + (q.atk || 0) / 100), rate: C.rate * (1 + (q.spd || 0) / 100), range: C.range * (1 + (q.rng || 0) / 100) }; // 장비
  const ch = makeHeroModel(cls, null, C.adv && C.adv.model); ch.g.position.set(tileX(CORE[0] - 1), 0, tileZ(CORE[1])); ch.g.rotation.y = -Math.PI / 2; scene.add(ch.g);
  const prevCtl = G.hero; hero = G.hero = G.curHero = { adv: C.adv || null, advHits: 0, advStunCd: 0, warpT: 0, warpCd: 0, stuckT: 0, stuckD: 1e9, unstuckN: 0, cls, C, eq: q, ch, g: ch.g, hp: C.hp, max: C.hp, cd: 0, skillCd: 0, atkT: 0, path: [], dead: 0, spinT: 0, flash: 0, face: -Math.PI / 2 };
  if (G.perm && G.legend) Object.assign(hero, { lsk: G.legend, lcd: 0, licd: 0, leap: null }); // 전설 무기 고유 스킬 (마을 출정 때만)
  advInit(hero); // 전직: 오라 링 · 무기 스케일 (전직 없으면 카운터만 초기화)
  uqInit(hero); // 고유 방어구·장신구 자동 궁극기 + 고유 무기 각성 (마을 출정 때만, 없으면 hero.uqs 없음)
  hero.hb = hpBar(ch.g, 3.1, 1.6, 0x55ff77); play(ch, 'Idle'); if (cls === 'mechanic') mechInit(hero); if (cls === 'fighter') fighterInit(hero);
  heroHud();
  hero.dm = newMeter(G.t); if (!party || !G.dmOther) { G.dmOther = newMeter(G.t); G.dmTowers = []; G.waveLog = []; } // 피해 미터 (combat/meter.js · 능력치 창) · 공용 = 타워·합동 공격
  const h0 = hero; if (party) { G.heroes.push(h0); if (prevCtl && G.heroes.includes(prevCtl)) setControlled(prevCtl); } else G.heroes = [h0]; // 파티: 첫 영웅이 계속 조작 영웅
  return h0;
}
// 하단 영웅 이름·스킬 버튼 = 조작 영웅 (spawnHero · 던전 초상화 전환)
function heroHud() { if (!hero) return; $('heroName').textContent = hero.C.title ? `${CLASSES[hero.cls].nm} · ${hero.C.title} · 스킬 [Q] ${hero.C.skill}` : `${heroLabel(hero.cls)} · 스킬 [Q] ${hero.C.skill}`; $('heroName').classList.toggle('adv', !!hero.C.title); if (hero.C.adv) $('heroName').style.setProperty('--adv', hero.C.adv.c); else $('heroName').style.removeProperty('--adv'); $('skillName').textContent = hero.C.skill; $('skillName').classList.toggle('long', hero.C.skill.length > 5); }
function heroDamage(d, h = hero) { if (!h) return; if (h !== hero) return withHero(h, () => heroDamage(d, h)); // 피해는 맞은 영웅에게 (파티)
  if (hero.dead > 0) return; d *= 1 - hero.C.armor; if (hero.ft) d *= ftGuard(); /* 백호난무 시전 중 -30% */ if (G.dungeon && G.dgDmg) d *= G.dgDmg * dgm().taken; /* 던전 층 몬스터 공격력 배수 (data/dungeon.js dmgMul) · 축복 '수호자의 맹세' */ if (hero.mech) { d = mechAbsorb(d); if (d <= 0) return; } const hp0 = hero.hp; if (hero.uqs) { d = uqPreHit(d); if (d <= 0) return; } hero.hp -= d; if (hero.dm) meterTaken(hero.dm, Math.min(d, Math.max(0, hp0))); if (hero.uqs) asSkill(uqPostHit, hp0); if (hero.adv && hero.hp > 0) advOnHurt(); hero.flash = .1; Snd.play('heroHurt', { pos: hero.g.position, vol: .8 }); if (hero.ch.acts.Hit && hero.hp > 0 && hero.atkT <= 0 && hero.spinT <= 0 && !(hero.roseT > 0) && !(hero.gunT > 0) && hero.warpT <= 0 && !hero.robo && !(hero.ft && (hero.ft.jp || hero.ft.leap))) { play(hero.ch, 'Hit', { once: true, force: true, speed: 1.6 }); hero.atkT = .35; }
  if (hero.hp <= 0 && hero.uqs && asSkill(uqOnDeath)) return; // 불사조 부활
  if (hero.hp <= 0 && G.dungeon) { if (hero.mech) mechRevert(); if (hero.ft) ftStop(); hero.hp = 0; hero.dead = 1e9; hero.spinT = 0; hero.roseT = 0; hero.gunT = 0; hero.snipeT = 0; hero.warpT = 0; if (hero.swirl) hero.swirl.visible = false; hero.path = []; play(hero.ch, 'Death_A', { once: true }); hero.hb.show(false); emit(P, hero.g.position.x, 1.5, hero.g.position.z, 50, 0xff4a5a, 6, .9); banner(`${CLASSES[hero.cls].nm} 쓰러짐!`, '#ff8a9a', 1500); if (G.onHeroDown) G.onHeroDown(hero); return; } // 던전: 이 층에서는 부활 없음 → 다음 층 시작 때 체력 30% 로 복귀 (dungeon/run.js startFloor)
  if (hero.hp <= 0) { if (hero.mech) mechRevert(); if (hero.ft) ftStop(); hero.hp = 0; hero.dead = 5; hero.spinT = 0; hero.roseT = 0; hero.gunT = 0; hero.snipeT = 0; if (hero.swirl) hero.swirl.visible = false; hero.path = []; play(hero.ch, 'Death_A', { once: true }); hero.hb.show(false); emit(P, hero.g.position.x, 1.5, hero.g.position.z, 50, 0xff4a5a, 6, .9); banner('영웅 쓰러짐! 5초 후 부활', '#ff8a9a', 1500); }
}
const heroPass = (c, r) => { if (!inGrid(c, r)) return false; const t = tileAt(c, r); return (t.t === T.GRASS || t.t === T.CARVED || t.t === T.SPAWN || t.t === T.CORE) && !t.tower && !t.bar; };
function passAt(x, z) { for (const [ox, oz] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) { const [c, r] = toTile(x + ox, z + oz); if (!heroPass(c, r)) return false; } return true; }
const heroPassXZ = (x, z) => { const [c, r] = toTile(x, z); return heroPass(c, r); };
function overlap(x, z) { let n = 0; for (const [ox, oz] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) { const [c, r] = toTile(x + ox, z + oz); if (!heroPass(c, r)) n++; } return n; }
// BFS로 가장 가까운 '완전히 비어 있는' 칸(영웅 몸이 들어가고 적이 근처에 없음) 찾기
function freeTileNear(c0, r0, avoidEnemies = true) {
  const seen = new Set([c0 * GH + r0]), q = [[c0, r0]]; let fallback = null;
  while (q.length) { const [c, r] = q.shift(); if (heroPass(c, r) && passAt(tileX(c), tileZ(r))) { if (!fallback) fallback = [c, r];
      if (!avoidEnemies || !G.enemies.some(e => !e.dead && !e.E.fly && Math.hypot(e.g.position.x - tileX(c), e.g.position.z - tileZ(r)) < 1.6)) return [c, r]; }
    for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr, k = nc * GH + nr; if (inGrid(nc, nr) && !seen.has(k)) { seen.add(k); q.push([nc, nr]); } } }
  return fallback;
}
function unstuck() { const h = hero, p = h.g.position, goal = h.path.length ? h.path[h.path.length - 1].clone() : null; const [c, r] = toTile(p.x, p.z), f = freeTileNear(c, r, false); h.stuckT = 0; h.stuckD = 1e9; if (!f) return;
  p.set(tileX(f[0]), p.y, tileZ(f[1])); h.unstuckN++; G.unstuckN = (G.unstuckN || 0) + 1; emit(P, p.x, 1, p.z, 14, 0x9ae8ff, 3, .5); if (goal) heroGoTo(goal); else h.path = []; }
// ================= 워프 (T): 1초 채널링 → 코어 앞 빈 칸으로 순간이동, 쿨다운 10초 =================
const WARP_CH = 1, WARP_CD = 10;
function warpTarget() { return freeTileNear(CORE[0] - 1, CORE[1]); }
function startWarp() { const h = hero; if (G.dungeon) return false; /* 던전: 코어 없음 → 워프 없음 */ if (!h || h.dead > 0 || G.phase === 'select' || G.phase === 'over' || (h.mech && h.mech.busy > 0) || (h.ft && h.ft.leap)) return false;
  if (h.warpT > 0) return false; if (h.warpCd > 0) { Snd.play('error'); banner(`워프 재사용 대기 ${Math.ceil(h.warpCd)}초`, '#9ae8ff', 800); return false; }
  h.path = []; h.spinT = 0; h.roseT = 0; h.gunT = 0; h.snipeT = 0; if (h.swirl) h.swirl.visible = false; if (h.ft) ftStop(); h.warpT = WARP_CH; play(h.ch, 'Cheer');
  if (!h.warpFx) { const m = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x7ad8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.position.y = 3; h.warpFx = m; h.g.add(m); }
  h.warpFx.visible = true; ringFx(h.g.position, 2.2, 0x7ad8ff, WARP_CH); Snd.play('magic', { pos: h.g.position, rate: .6, force: true }); Snd.whoosh(h.g.position, WARP_CH, 200, 2400, .4); return true; }
function warpChannelFx(dt) { const h = hero, k = 1 - h.warpT / WARP_CH; h.warpFx.material.opacity = .15 + k * .5; h.warpFx.scale.set(1 - k * .5, 1, 1 - k * .5); h.warpFx.rotation.y += dt * 6;
  if (Math.random() < .6) { const a = Math.random() * 6.28; emit(P, h.g.position.x + Math.cos(a) * 1.1, .2, h.g.position.z + Math.sin(a) * 1.1, 2, 0x9ae8ff, 1, .6, 6, .3); } }
function cancelWarp() { const h = hero; h.warpT = 0; if (h.warpFx) h.warpFx.visible = false; Snd.play('error'); banner('워프 취소', '#9ae8ff', 700); play(h.ch, 'Idle'); }
function doWarp() { const h = hero, p = h.g.position, f = warpTarget(); h.warpFx.visible = false; h.warpCd = WARP_CD; h.stuckT = 0; if (!f) return;
  emit(P, p.x, 1.2, p.z, 50, 0x7ad8ff, 7, .7, 0, 3); ringFx(p, 3, 0x7ad8ff, .5); vanishPillar(p.x, p.z);
  p.set(tileX(f[0]), 0, tileZ(f[1])); h.path = []; h.face = -Math.PI / 2; G.warpN = (G.warpN || 0) + 1;
  emit(P, p.x, 1.2, p.z, 60, 0xbaf0ff, 6, .8, -4, 2); ringFx(p, 3.5, 0xbaf0ff, .6); vanishPillar(p.x, p.z); G.shake = Math.max(G.shake || 0, .2); play(h.ch, 'Cheer', { once: true }); h.atkT = .8;
  Snd.play('magic', { pos: p, rate: 1.4, force: true }); Snd.play('levelUp', { vol: .5, force: true }); banner('워프!', '#9ae8ff', 700); }
function vanishPillar(x, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(.6, 1.2, 9, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xbaf0ff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.position.set(x, 4.5, z); scene.add(m); G.fxs.push({ m, t: 0, dur: .45, kind: 'fade' }); }
function astar(s, g) {
  const key = (c, r) => c * GH + r, gs = new Map([[key(s[0], s[1]), 0]]), from = new Map(), h = new Heap(), H = (c, r) => Math.abs(c - g[0]) + Math.abs(r - g[1]);
  h.push([H(s[0], s[1]), s[0], s[1]]);
  while (h.size) { const [, c, r] = h.pop(); if (c === g[0] && r === g[1]) { const path = []; let k = key(c, r); while (from.has(k)) { path.unshift([k / GH | 0, k % GH]); k = from.get(k); } return path; }
    const gc = gs.get(key(c, r)); for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (!heroPass(nc, nr)) continue; const nk = key(nc, nr), ng = gc + 1; if (ng < (gs.get(nk) ?? Infinity)) { gs.set(nk, ng); from.set(nk, key(c, r)); h.push([ng + H(nc, nr), nc, nr]); } } }
  return null;
}
function heroGoTo(p) {
  const s = toTile(hero.g.position.x, hero.g.position.z); const [gc, gr] = toTile(p.x, p.z); let exact = heroPass(gc, gr);
  let path = exact ? astar(s, [gc, gr]) : null;
  if (!path) { // 도달 불가 → 도달 가능한 가장 가까운 칸
    const seen = new Set([s[0] * GH + s[1]]), q = [s]; let best = s, bd = Infinity;
    while (q.length) { const [c, r] = q.shift(); const d = Math.hypot(tileX(c) - p.x, tileZ(r) - p.z); if (d < bd) { bd = d; best = [c, r]; }
      for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr, k = nc * GH + nr; if (heroPass(nc, nr) && !seen.has(k)) { seen.add(k); q.push([nc, nr]); } } }
    path = astar(s, best) || []; exact = false;
  }
  hero.path = path.map(([c, r]) => new THREE.Vector3(tileX(c), 0, tileZ(r))); if (exact && passAt(p.x, p.z)) { hero.path.pop(); hero.path.push(new THREE.Vector3(p.x, 0, p.z)); } // 벽에 붙은 클릭 지점은 몸이 못 들어가 제자리걸음하던 원인 → 칸 중심 사용
}

// 비행 적을 근접 공격하지 못하는 영웅 (세라 · 서윤 — 서윤은 비행 적에게 장풍)
const MELEE_ONLY = { warrior: 1, fighter: 1 };
// ================= 영웅 업데이트 =================
function updHero(dt) {
  const h = hero; h.ch.mixer.update(dt); if (h.adv) advUpd(dt); // 전직: 오라·무기 스케일·불꽃 바닥·성역
  if (h.dead > 0) { h.dead -= dt; if (h.dead <= 0) { h.hp = h.max; h.hb.show(true); h.g.position.set(tileX(CORE[0] - 1), 0, tileZ(CORE[1])); play(h.ch, 'Cheer', { once: true }); h.atkT = 1.2; emit(P, h.g.position.x, 1, h.g.position.z, 40, 0x8aff9a, 5, .8); ringFx(h.g.position, 2.5, 0x8aff9a, .6); } return; }
  const fwd = new THREE.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta)), right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  let fromPath = false; if (h === G.hero) { if (keys.w) mv.add(fwd); if (keys.s) mv.sub(fwd); if (keys.d) mv.add(right); if (keys.a) mv.sub(right); } // 키보드 = 조작 영웅만 (파티)
  if (h.warpCd > 0) h.warpCd -= dt;
  if (h.leap) { updLeap(dt); h.hb.set(h.hp / h.max); return; } // 천지파열무 도약 중
  if (h.ft && h.ft.leap) { asSkill(updFtLeap, dt); h.hb.set(h.hp / h.max); return; } // 격투가: 냥냥 진각 도약 · 맹호 돌진 중
  if (h.mech && updMech(dt)) { h.g.rotation.y += Math.atan2(Math.sin(h.face - h.g.rotation.y), Math.cos(h.face - h.g.rotation.y)) * Math.min(1, dt * 10); h.hb.set(h.hp / h.max); return; } // 메카닉 변신/피니시 연출 중
  if (h.warpT > 0) { // 워프 채널링: 이동 입력 시 취소
    if (mv.lengthSq() > 0 || h.path.length) cancelWarp(); else { h.warpT -= dt; warpChannelFx(dt); if (h.warpT <= 0) doWarp(); h.hb.set(h.hp / h.max); return; } }
  if (mv.lengthSq() > 0) h.path = [];
  else if (h.path.length) { fromPath = true; mv.subVectors(h.path[0], h.g.position).setY(0); if (mv.length() < .15) { h.path.shift(); if (!h.path.length) mv.set(0, 0, 0); } }
  let moving = false;
  if (mv.lengthSq() > 0) { const want = mv.length(), stp = h.C.speed * dt * (h.spinT > 0 ? h.spinSpd || .7 : h.roseT > 0 ? .7 : 1) * (h.robo ? .9 : 1); mv.normalize().multiplyScalar(fromPath ? Math.min(stp, want) : stp); const p = h.g.position; // 경로 지점을 지나치며 왕복하던 떨림 방지 const p = h.g.position;
    // 근본 원인 수정: 현재 위치가 이미 막힌 칸과 겹쳐 있으면(타워/바리케이드가 옆에 생기거나 밀려서) 4모서리 검사가 모든 이동을 거부해 영구히 갇혔음.
    // 겹친 상태에서는 '덜 겹치는' 방향(중심 칸이 통과 가능)으로의 이동을 허용해 빠져나오게 함
    const ok = (x, z) => passAt(x, z) || (!passAt(p.x, p.z) && heroPassXZ(x, z) && overlap(x, z) <= overlap(p.x, p.z));
    const x0 = p.x, z0 = p.z; if (ok(p.x + mv.x, p.z)) p.x += mv.x; if (ok(p.x, p.z + mv.z)) p.z += mv.z; h.face = Math.atan2(mv.x, mv.z); moving = true;
    // 자동 탈출: 2초 동안 목표 쪽으로 진척이 없으면 가장 가까운 빈 칸으로 이동 후 경로 재계산
    const tgt0 = h.path.length ? h.path[0] : null, dNow = tgt0 ? Math.hypot(tgt0.x - p.x, tgt0.z - p.z) : (Math.hypot(p.x - x0, p.z - z0) < 1e-4 && !passAt(p.x, p.z) ? 1 : -1);
    if (dNow >= 0 && dNow > h.stuckD - .05) { h.stuckT += dt; if (h.stuckT > 2) unstuck(); } else { h.stuckT = 0; h.stuckD = dNow >= 0 ? dNow : 1e9; } }
  else { h.stuckT = 0; h.stuckD = 1e9; }
  if (!moving && !passAt(h.g.position.x, h.g.position.z)) { h.stuckT += dt; if (h.stuckT > 2) unstuck(); }
  h.g.position.y += (groundY(h.g.position.x, h.g.position.z) - h.g.position.y) * Math.min(1, dt * 10);
  const rng = stat.range(); let tgt = null, bd = rng * rng;
  for (const e of G.enemies) { if (e.dead || e.immT > G.t) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = dx * dx + dz * dz; if (d < bd && (!MELEE_ONLY[h.cls] || !e.E.fly)) { bd = d; tgt = e; } }
  if (tgt && h.adv && h.adv.atk.prio === 'hp') tgt = advPick(rng) || tgt;
  if (h.aiTgt) { const a = h.aiTgt; if (!a.dead && !(a.immT > G.t) && (a.g.position.x - h.g.position.x) ** 2 + (a.g.position.z - h.g.position.z) ** 2 < rng * rng && (!MELEE_ONLY[h.cls] || !a.E.fly)) tgt = a; } // 던전 AI 집중 대상 (마법사: 밀집 지점) — 일반 판에는 없음 // 전직 저격수: 체력 높은 적(보스) 우선
  h.cd -= dt; h.atkT -= dt; if (h.gunT > 0) h.gunT -= dt;
  if (h.roseT > 0) asSkill(updRose, dt); // 로즈 피니시 중: 일반 사격 대신 난사
  else if (h.snipeT > 0) { h.snipeT -= dt; h.face = h.snipeA; } // 장미 저격수 관통 저격 조준 중: 일반 사격 없음, 방향 고정
  else if (h.cls === 'gunner' && tgt) { h.face = Math.atan2(tgt.g.position.x - h.g.position.x, tgt.g.position.z - h.g.position.z); // 총사: 이동 중에도 목표를 겨누며 연사
    if (h.cd <= 0) { h.cd = 1 / stat.rate(); h.gunT = Math.max(.45, h.cd + .15); /* 소총(느린 연사): 다음 발까지 조준 유지 */ const t0 = tgt; later(.02, () => { if (!t0.dead && hero.dead <= 0) { gunAttack(t0); if (hero.lsk) legendProc(t0); } }); } }
  else if (h.cls === 'mechanic' && tgt) { const want = Math.atan2(tgt.g.position.x - h.g.position.x, tgt.g.position.z - h.g.position.z); if (!moving || h.robo) h.face = want; // 메카닉: 드릴/해머 교대 (로봇: 펀치·드릴 돌진·해머)
    if (h.cd <= 0) { h.cd = 1 / stat.rate() * (h.robo ? 1.1 : 1); mechSwing(tgt, moving, hero.lsk ? legendProc : null); } }
  else if (h.cls === 'fighter') fighterTick(dt, tgt, moving); // 격투가: 3연타 / 사거리 밖 원거리·비행 적에게 장풍 충전 (fighter.js)
  else if (tgt && h.spinT <= 0) { const want = Math.atan2(tgt.g.position.x - h.g.position.x, tgt.g.position.z - h.g.position.z); if (!moving) h.face = want;
    if (h.cd <= 0) { h.cd = 1 / stat.rate();
      let hitD = h.cls === 'warrior' ? .12 : .08;
      if (!moving) { const nm = h.cls === 'warrior' && rand() < .5 ? '1H_Melee_Attack_Slice_Horizontal' : h.C.atk, spd = h.C.atkSpd * Math.max(1, stat.rate() / h.C.rate); play(h.ch, nm, { once: true, force: true, speed: spd }); h.atkT = Math.min(.55, 1 / stat.rate());
        if (h.ch.hitAt) hitD = h.ch.hitAt / spd; } // Meshy 전사: 칼 휘두름 정점에 타격
      const t0 = tgt; later(hitD, () => { if (!t0.dead && hero.dead <= 0) { attack(t0); if (hero.lsk) legendProc(t0); } }); } }
  if (h.spinT > 0) { h.spinT -= dt; h.spinTick -= dt; h.g.rotation.y += dt * 9;
    if (h.spinTick <= 0) { h.spinTick = .25; G.mK = 1; aoe(h.g.position, h.spinR || 3.6, stat.dmg() * 1.3 * stat.skillMul(), h.spinCol ? h.spinCol[0] : '#ffb07a', { groundOnly: true }); G.mK = 0; emit(P, h.g.position.x, 1.2, h.g.position.z, 20, h.spinCol ? h.spinCol[1] : 0xffa04a, 7, .4, 0, 4); }
    h.swirl.rotation.z += dt * 15; if (h.spinT <= 0) { h.swirl.visible = false; play(h.ch, 'Idle'); } }
  else { let d = h.face - h.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); h.g.rotation.y += d * Math.min(1, dt * 14); }
  if (h.roseT > 0) { /* ShootCharged 재생 중 */ } else if (h.gunT > 0) play(h.ch, moving ? 'ShootWalk' : 'ShootStand', { speed: moving ? 1.3 : 1, fade: .12 });
  else if (h.spinT <= 0) { if (moving) play(h.ch, 'Running_A', { speed: h.ch.runSpd || 1.1 }); else if (h.atkT <= 0) play(h.ch, 'Idle', { fade: .25 }); }
  h.ch.ring.material.opacity = .5 + Math.sin(G.t * 4) * .2;
  if (h.flash > 0) { h.flash -= dt; flashMats(h.ch.mats, true, 0xff3030); } else flashMats(h.ch.mats, false);
  if (!G.enemies.some(e => !e.dead && e.g.position.distanceTo(h.g.position) < 4)) h.hp = Math.min(h.max, h.hp + h.max * .03 * dt);
  h.hb.set(h.hp / h.max);
}
// 파티 업데이트 (G.heroes 2명 이상일 때만 main.js 에서 호출): 영웅마다 그 영웅 문맥으로 AI(G.partyAI, 조작 영웅 제외) → updHero
function updParty(dt) {
  for (const h of G.heroes) withHero(h, () => { if (h !== G.hero && G.partyAI && h.dead <= 0) G.partyAI(h, dt); updHero(dt); if (h !== G.hero && h.skillCd > 0) h.skillCd -= dt; });
  advFx(dt); for (const h of G.heroes) if (h !== G.hero) withHero(h, () => updLegendHero(dt));
}
function heroTip() { if (hero.ch.tip) { hero.g.updateMatrixWorld(true); const v = hero.ch.tip.getWorldPosition(new THREE.Vector3()); if (v.y > .8) return v; } const p = hero.g.position, f = hero.g.rotation.y; return new THREE.Vector3(p.x + Math.sin(f) * .6, p.y + (hero.cls === 'mage' ? 2.2 : 1.5), p.z + Math.cos(f) * .6); }
function attack(t) {
  const h = hero, from = heroTip(); if (h.cls === 'archer') Snd.play('bolt', { pos: from }); else if (h.cls === 'mage') Snd.play('magic', { pos: from, rate: .8 }); else { Snd.play('sword', { pos: from }); Snd.whoosh(from, .22, 700, 2200, .25); }
  if (h.cls === 'archer') { if (h.adv) advArrow(t, from, stat.dmg()); else shoot('arrow', from, t, stat.dmg(), { color: 0xb0ffb8 }); }
  else if (h.cls === 'mage') { if (h.adv) advOrb(t, from, stat.dmg()); else { shoot('orb', from, t, stat.dmg(), { aoe: h.C.aoe }); emit(P, from.x, from.y, from.z, 10, 0xc07aff, 3, .3); } }
  else { const fx2 = Math.sin(h.face), fz2 = Math.cos(h.face); let dealt = 0;
    for (const e of [...G.enemies]) { if (e.dead || e.E.fly) continue; const dx = e.g.position.x - h.g.position.x, dz = e.g.position.z - h.g.position.z, d = Math.hypot(dx, dz); if (d < stat.range() + .4 && (dx * fx2 + dz * fz2) / (d || 1) > .45) { const v = stat.dmg(); dealt += v; hurt(e, v, '#ffcf9a', false, { x: h.g.position.x, z: h.g.position.z, kind: 'melee' }); } }
    if (h.adv) advLeech(dealt); // 전직 광전사 흡혈
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.8, 24, 1, -Math.PI / 3, Math.PI * 2 / 3), new THREE.MeshBasicMaterial({ color: h.adv ? h.adv.col : 0xffd0a0, transparent: true, opacity: .8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    arc.rotation.x = -Math.PI / 2; arc.rotation.z = h.face - Math.PI / 2; arc.position.set(h.g.position.x, 1, h.g.position.z); scene.add(arc); G.fxs.push({ m: arc, t: 0, dur: .2, kind: 'fade' }); }
}

export { heroHud, updParty, withHero, setControlled, startWarp, WARP_CD, hero, stat, heroTip, passAt, spawnHero, heroDamage, heroGoTo, updHero };
