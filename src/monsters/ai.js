import { Snd } from '../audio/audio.js';
import { STAGE, CORE, DIRS, GH, GW, T, inGrid, isBlock, tileX, tileZ, toTile } from '../core/grid.js';
const ICE = !!(STAGE && STAGE.ch === 2);
import { rand, rnd } from '../core/util.js';
import { BLK } from '../data/terrain.js';
import { G } from '../core/state.js';
import { P, PB, debris, emit, ringFx } from '../render/vfx.js';
import { flashMats, play } from '../render/characters.js';
import { core, damageTile, tileAt } from '../world/terrain.js';
import { enterCost, nextStep } from '../world/pathfinding.js';
import { reachCore, removeEnemy } from './enemy.js';
import { damageTower } from '../world/towers.js';
import { hero, heroDamage } from '../heroes/hero.js';

function groundY(x, z) { const [c, r] = toTile(x, z); return inGrid(c, r) && tileAt(c, r).t === T.CARVED ? -.46 : 0; }
function enemyWalk(x, z) { const [c, r] = toTile(x, z); if (!inGrid(c, r)) return false; const t = tileAt(c, r); return !isBlock(t.t) && t.t !== T.BEDROCK && !t.tower && !t.bar; }
// 겹침 밀어내기. 64마리 이하는 기존과 완전히 같은 O(n²) 순서, 그보다 많으면 공간 해시(셀 2.5 ≥ 최대 반경합 2.08)로 이웃만 검사 (같은 i<j 순서 유지)
function pushPair(A, B, dt) { const a = A.g.position, b = B.g.position, dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, m = (A.E.h + B.E.h) * .2;
  if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = Math.min(.5, (m - d) * .5) * Math.min(1, dt * 8), ux = dx / d * k, uz = dz / d * k;
    if (enemyWalk(a.x - ux, a.z - uz)) { a.x -= ux; a.z -= uz; } if (enemyWalk(b.x + ux, b.z + uz)) { b.x += ux; b.z += uz; } } }
const SEP_CELL = 2.5, SCX = 24, SCZ = 16, sepHead = new Int32Array(SCX * SCZ), sepNext = new Int32Array(1024), sepCell = new Int32Array(1024);
function separate(dt) {
  const L = G.enemies.filter(e => !e.dead && !e.E.fly && e.state !== 'spawn'), n = L.length;
  if (n <= 64 || n > 1024) { for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pushPair(L[i], L[j], dt); return; }
  sepHead.fill(-1); // 셀별 연결 리스트 (역순 삽입 → 각 리스트는 인덱스 내림차순)
  for (let i = n - 1; i >= 0; i--) { const p = L[i].g.position, cx = Math.min(SCX - 1, Math.max(0, Math.floor(p.x / SEP_CELL) + SCX / 2)), cz = Math.min(SCZ - 1, Math.max(0, Math.floor(p.z / SEP_CELL) + SCZ / 2)), c = cx * SCZ + cz;
    sepCell[i] = c; sepNext[i] = sepHead[c]; sepHead[c] = i; }
  for (let i = 0; i < n; i++) { const c = sepCell[i], cx = (c / SCZ) | 0, cz = c % SCZ;
    for (let ox = -1; ox <= 1; ox++) { const x = cx + ox; if (x < 0 || x >= SCX) continue; for (let oz = -1; oz <= 1; oz++) { const z = cz + oz; if (z < 0 || z >= SCZ) continue;
      for (let j = sepHead[x * SCZ + z]; j !== -1; j = sepNext[j]) if (j > i) pushPair(L[i], L[j], dt); } } }
}
function faceTo(g, x, z, dt, k = 10) { let d = Math.atan2(x - g.position.x, z - g.position.z) - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * k); }
function updEnemies(dt) {
  // 애니메이션 LOD: 100마리 초과 시 믹서를 격 프레임으로 (게임 로직에는 영향 없음)
  const lod = G.enemies.length > 100; G.frameN = (G.frameN || 0) + 1;
  // 그림자/외곽선 LOD: 140마리 초과 시 적 그림자·외곽선 끔, 100마리 미만이면 다시 켬 (드로우콜 절감)
  const nE = G.enemies.length; if (!G.lowQ && nE > 140) setEnemyShadows(false); else if (G.lowQ && nE < 100) setEnemyShadows(true);
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i], E = e.E, g = e.g;
    if (e.m.mixer) { if (lod) { e.mixAcc = (e.mixAcc || 0) + dt; if (((i + G.frameN) & 1) === 0) { e.m.mixer.update(e.mixAcc); e.mixAcc = 0; } } else e.m.mixer.update(dt); }
    if (e.dying !== undefined) { e.dying -= dt; if (E.fly) { e.m.inner.position.y = Math.max(.3, e.m.inner.position.y - dt * 7); e.m.inner.rotation.z += dt * 8; } else if (e.dying < .5) g.position.y -= dt * 2.5; if (e.dying <= 0) removeEnemy(e); continue; }
    if (e.flash > 0) { e.flash -= dt; flashMats(e.m.mats, true, e.blockT > 0 ? 0x5a8aff : 0xffffff); if (e.blockT > 0) e.blockT -= dt; } else if (e.slowT > 0) flashMats(e.m.mats, true, 0x2a3aaa); else flashMats(e.m.mats, false);
    e.hb.set(Math.max(0, e.hp / e.max)); if (e.state === 'spawn') { e.spawnT -= dt; if (e.spawnT <= 0) e.state = 'walk'; continue; }
    if (e.stunT > 0) { stunned(e, dt); continue; } // 전설 스킬: 빙결/띄우기 (설정될 때만)
    const slowK = e.slowT > 0 ? 1 - (e.slowAmt || .45) : 1, spd = (e.ai === 'charger' ? chargeSpeed(e, dt) : E.spd) * slowK * (ICE && G.tiles[e.tile[0]]?.[e.tile[1]]?.t === T.CARVED ? 1.3 : 1); e.slowT -= dt; // 설원: 얼음 길에서 미끄러지듯 빠름
    if (E.fly) {
      const tx = core.position.x, tz = core.position.z, dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
      if (d < 1) { reachCore(e); continue; } g.position.x += dx / d * spd * dt; g.position.z += dz / d * spd * dt; faceTo(g, tx, tz, dt);
      e.bob += dt; const f = Math.sin(G.t * 16 + e.bob); e.m.wings[0].rotation.y = f * .8; e.m.wings[1].rotation.y = -f * .8; e.m.inner.position.y = 3 + Math.sin(G.t * 3 + e.bob) * .35; e.m.inner.rotation.x = .15;
      const [tc, tr] = toTile(g.position.x, g.position.z); if (inGrid(tc, tr)) e.tile = [tc, tr]; continue;
    }
    // 영웅과 근접 전투
    const hd = hero && hero.dead <= 0 ? Math.hypot(hero.g.position.x - g.position.x, hero.g.position.z - g.position.z) : 99;
    if (hd < 1.25 + E.h * .2) { faceTo(g, hero.g.position.x, hero.g.position.z, dt, 14); play(e.m, E.dig, { speed: 1.2 }); e.atkCd -= dt; if (e.atkCd <= 0) { e.atkCd = .85; heroDamage(E.dps * .85); } continue; }
    if (e.ai !== 'basic') { const r = special(e, dt, slowK); if (r === true) continue; }
    if (e.next && enterCost(tileAt(e.next[0], e.next[1])) === Infinity) e.next = null;
    if (!e.next) e.next = e.profile === 'default' ? nextStep(e.tile[0], e.tile[1]) : nextStep(e.tile[0], e.tile[1], e.profile);
    if (!e.next) { reachCore(e); continue; }
    const nt = tileAt(e.next[0], e.next[1]), cx = tileX(e.tile[0]), cz = tileZ(e.tile[1]);
    if (isBlock(nt.t) || nt.bar) { // 지형/바리케이드 부수기
      const dx = e.next[0] - e.tile[0], dz = e.next[1] - e.tile[1], sx = -dz, sz = dx;
      const tx = cx + dx * .55 + sx * e.off[0] * 1.2, tz = cz + dz * .55 + sz * e.off[0] * 1.2;
      const ddx = tx - g.position.x, ddz = tz - g.position.z, d = Math.hypot(ddx, ddz);
      if (d > .75) { const mv = Math.min(d, spd * dt); g.position.x += ddx / d * mv; g.position.z += ddz / d * mv; faceTo(g, tx, tz, dt); play(e.m, E.walk, { speed: spd * E.ws }); }
      else { if (d > .05) { const mv = Math.min(d, spd * dt * .5); g.position.x += ddx / d * mv; g.position.z += ddz / d * mv; } faceTo(g, tileX(nt.c), tileZ(nt.r), dt, 12); play(e.m, E.dig, { speed: 1.15 * slowK + .1 }); e.digging = true;
        damageTile(nt, (E.digDps || E.dps) * dt); e.hitT -= dt;
        if (e.hitT <= 0) { e.hitT = E.digDps ? .3 : .55; const hx = (g.position.x + tileX(nt.c)) / 2, hz = (g.position.z + tileZ(nt.r)) / 2;
          if (nt.bar || isBlock(nt.t)) { const cols = nt.bar ? [0xa8703a, 0x6a4422] : BLK[nt.t].deb; debris(hx, .9, hz, E.boss ? 5 : 2, cols, 4); emit(P, hx, .9, hz, 6, nt.t === T.ROCK ? 0xffffff : 0xc8a070, 3, .4, -6, .6); Snd.play(nt.bar || nt.t === T.FOREST ? 'digWood' : nt.t === T.ROCK ? 'dig' : 'digSoft', { pos: g.position, rate: E.boss ? .7 : 1 }); }
          if (E.boss) G.shake = Math.max(G.shake, .15); } }
    } else {
      e.digging = false;
      const tx = tileX(e.next[0]) + e.off[0], tz = tileZ(e.next[1]) + e.off[1], dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
      if (d < spd * dt + .03) { g.position.x = tx; g.position.z = tz; e.tile = e.next; e.next = null; if (e.tile[0] === CORE[0] && e.tile[1] === CORE[1]) { reachCore(e); continue; } }
      else { g.position.x += dx / d * spd * dt; g.position.z += dz / d * spd * dt; faceTo(g, tx, tz, dt); }
      play(e.m, E.walk, { speed: spd * E.ws });
      if (E.boss && Math.sin(G.t * 4.5) * Math.sin((G.t - dt) * 4.5) < 0) { G.shake = Math.max(G.shake, .16); Snd.play('stomp', { pos: g.position, rate: .55, force: true }); emit(P, g.position.x, .2, g.position.z, 6, 0x8a7a6a, 3, .4); }
    }
    g.position.y += (groundY(g.position.x, g.position.z) - g.position.y) * Math.min(1, dt * 8);
    // 끼임 감지: 굴착 중이 아닌데 1.5초 동안 거의 못 움직였으면(밀림/칸 불일치) 현재 칸 중심으로 보정 후 경로 재선택
    if (e.digging) { e.ckT = 0; e.ckP = null; } else { if (!e.ckP) { e.ckP = [g.position.x, g.position.z]; e.ckT = 0; } e.ckT += dt;
      if (e.ckT > 1.5) { if (Math.hypot(g.position.x - e.ckP[0], g.position.z - e.ckP[1]) < .3 && spd > .2 && wedged(e)) nudge(e); e.ckP = [g.position.x, g.position.z]; e.ckT = 0; } }
  }
}
// 진짜 끼임만: 몸이 통과 불가 칸에 있거나, 현재 칸/다음 칸 어디에도 속하지 않음 (단순 정체 행렬은 제외)
function wedged(e) { const p = e.g.position, [c, r] = toTile(p.x, p.z); if (!enemyWalk(p.x, p.z)) return true; const on = (a) => a && a[0] === c && a[1] === r; return !on(e.tile) && !on(e.next); }
function nudge(e) { const g = e.g, [c, r] = toTile(g.position.x, g.position.z); G.nudgeN = (G.nudgeN || 0) + 1;
  if (inGrid(c, r) && enemyWalk(g.position.x, g.position.z)) e.tile = [c, r]; g.position.x = tileX(e.tile[0]); g.position.z = tileZ(e.tile[1]); e.next = null; }

function setEnemyShadows(on) { G.lowQ = !on; for (const e of G.enemies) shadowOf(e, on); }
function shadowOf(e, on) { e.g.traverse(o => { if (!o.isMesh) return; if (o.userData.ol) o.visible = on; else o.castShadow = on; }); } // 저품질: 그림자·외곽선 끔
// ================= 신규 몬스터 행동 (상태머신) =================
// basic: walk ↔ dig ↔ fight(hero)   digger: 같은 흐름 + 굴착 프로필/고속 굴착   charger: walk ↔ sprint(파인 길)
// shield: walk (방패 판정은 hurt)   bomber: walk → seek(타워/바리케이드) → fuse → explode   siege: walk → ram(타워 공격)
const walkable = t => !isBlock(t.t) && t.t !== T.BEDROCK && !t.tower && !t.bar;
function chargeSpeed(e, dt) { // 파인 길/포털/코어 위에서는 전력 질주, 그 외(흙 파기·풀밭)는 느림
  const E = e.E, t = tileAt(e.tile[0], e.tile[1]), n = e.next && tileAt(e.next[0], e.next[1]);
  const onPath = (t.t === T.CARVED || t.t === T.SPAWN || t.t === T.CORE) && (!n || (n.t === T.CARVED || n.t === T.CORE)) && !e.digging;
  const want = onPath ? E.sprint : E.spd; if (e.cs === undefined) e.cs = E.spd; e.cs += (want - e.cs) * Math.min(1, dt * (onPath ? 2.2 : 6));
  const sprinting = e.cs > E.spd * 1.6; if (sprinting && !e.sprinting) { Snd.whoosh(e.g.position, .4, 300, 1800, .3); G.stats.sprints = (G.stats.sprints || 0) + 1; } e.sprinting = sprinting;
  if (sprinting) { e.dustT = (e.dustT || 0) - dt; if (e.dustT <= 0) { e.dustT = .07; emit(P, e.g.position.x, .15 + e.g.position.y, e.g.position.z, 2, 0xc8b090, 1.2, .4, 1, .3); } }
  return e.cs;
}
function towerNear(e, rng) { // 인접 칸(상하좌우)의 타워 또는 반경 rng 안의 가장 가까운 타워
  let best = null, bd = rng * rng; for (const tw of G.towers) { if (tw.dead) continue; const dx = tileX(tw.c) - e.g.position.x, dz = tileZ(tw.r) - e.g.position.z, d = dx * dx + dz * dz;
    const adj = Math.abs(tw.c - e.tile[0]) + Math.abs(tw.r - e.tile[1]) === 1; if (adj && d < 2.7 * 2.7) return tw; if (d < bd) { bd = d; best = tw; } } return best;
}
function bfsStep(sc, sr, tc, tr, maxD = 8) { // 대상 칸에 인접한 걸을 수 있는 칸까지 짧은 BFS, 첫 걸음 반환
  const start = sc * GH + sr, par = new Map([[start, -1]]), dep = new Map([[start, 0]]), q = [start];
  for (let qi = 0; qi < q.length; qi++) { const k = q[qi], c = Math.floor(k / GH), r = k % GH;
    if (Math.abs(c - tc) + Math.abs(r - tr) === 1) { if (k === start) return null; let s = k; while (par.get(s) !== start) s = par.get(s); return [Math.floor(s / GH), s % GH]; }
    if (dep.get(k) >= maxD) continue;
    for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr, nk = nc * GH + nr; if (!inGrid(nc, nr) || par.has(nk) || !walkable(tileAt(nc, nr))) continue; par.set(nk, k); dep.set(nk, dep.get(k) + 1); q.push(nk); } }
  return null;
}
function bombTarget(e) { // 반경 seek 안의 가장 가까운 타워/바리케이드
  const B = e.E.bomb, x = e.g.position.x, z = e.g.position.z; let best = null, bd = B.seek * B.seek;
  for (const tw of G.towers) { if (tw.dead) continue; const dx = tileX(tw.c) - x, dz = tileZ(tw.r) - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = { c: tw.c, r: tw.r, tw }; } }
  const R = Math.ceil(B.seek / 2); for (let c = e.tile[0] - R; c <= e.tile[0] + R; c++) for (let r = e.tile[1] - R; r <= e.tile[1] + R; r++) { if (!inGrid(c, r)) continue; const t = tileAt(c, r); if (!t.bar) continue;
    const dx = tileX(c) - x, dz = tileZ(r) - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = { c, r, bar: t.bar }; } }
  return best;
}
function explode(e) {
  const B = e.E.bomb, p = e.g.position.clone(); e.dead = true; e.hb.show(false); G.stats.exploded = (G.stats.exploded || 0) + 1;
  Snd.play('boom', { pos: p, force: true }); Snd.play('breakRock', { pos: p, rate: 1.2 }); G.shake = Math.max(G.shake, .6);
  emit(PB, p.x, 1, p.z, 40, 0xff7a2a, 9, .7, -3, 2.5); emit(P, p.x, 1, p.z, 90, 0xffcc5a, 11, .8, -10, 2.5); emit(P, p.x, 1.4, p.z, 30, 0x3a3a3a, 3, 1.4, 2, 2); ringFx(p, B.r * 1.4, 0xffa040, .5); debris(p.x, 1, p.z, 14, [0x26262e, 0xd0ffb0, 0xf0ead8], 7);
  for (const tw of [...G.towers]) { const d = Math.hypot(tileX(tw.c) - p.x, tileZ(tw.r) - p.z); if (d <= B.r + 1) damageTower(tw, B.tower * (d <= B.r * .6 + 1 ? 1 : .6), { x: p.x, z: p.z, kind: 'bomb' }); }
  const R = Math.ceil(B.r / 2) + 1; for (let c = e.tile[0] - R; c <= e.tile[0] + R; c++) for (let r = e.tile[1] - R; r <= e.tile[1] + R; r++) { if (!inGrid(c, r)) continue; const t = tileAt(c, r), d = Math.hypot(tileX(c) - p.x, tileZ(r) - p.z);
    if (t.bar && d <= B.r + 1) damageTile(t, B.bar); else if (isBlock(t.t) && d <= B.r) damageTile(t, B.block); }
  if (hero && hero.dead <= 0 && Math.hypot(hero.g.position.x - p.x, hero.g.position.z - p.z) <= B.r) heroDamage(B.hero);
  removeEnemy(e);
}
const ramAnim = '2H_Melee_Attack_Chop';
function special(e, dt, slowK) {
  const E = e.E, g = e.g;
  if (e.ai === 'siege') { // 공성: 타워에 붙으면 망치로 공격
    if (e.state !== 'ram' && e.next) { e.siegeT = (e.siegeT || 0) - dt; if (e.siegeT > 0) return false; e.siegeT = .2; }
    const tw = towerNear(e, 0); if (!tw) { if (e.state === 'ram') e.state = 'walk'; return false; }
    if (e.state !== 'ram') { e.state = 'ram'; e.ramCd = .5; e.target = tw; }
    faceTo(g, tileX(tw.c), tileZ(tw.r), dt, 8); play(e.m, ramAnim, { speed: .85 * slowK + .15 }); e.ramCd -= dt * slowK;
    if (e.m.ram) e.m.ram.position.z = (e.m.ram.userData.z0 ??= e.m.ram.position.z) + Math.max(0, Math.sin(Math.min(1, 1 - e.ramCd) * Math.PI)) * .25;
    if (e.ramCd <= 0) { e.ramCd = 1.05; damageTower(tw, E.towerDps * 1.05, { x: g.position.x, z: g.position.z, kind: 'siege' }); Snd.play('ram', { pos: g.position }); G.shake = Math.max(G.shake, .12);
      const hx = (g.position.x + tileX(tw.c)) / 2, hz = (g.position.z + tileZ(tw.r)) / 2; emit(P, hx, 1, hz, 14, 0xd8c8a8, 4, .45, -6, .6); G.stats.siegeHits = (G.stats.siegeHits || 0) + 1; }
    g.position.y += (groundY(g.position.x, g.position.z) - g.position.y) * Math.min(1, dt * 8); return true;
  }
  if (e.ai === 'bomber') {
    if (e.m.sparks) { const f = e.state === 'fuse' ? (Math.sin(G.t * 40) > 0 ? 1.8 : .6) : .8 + Math.sin(G.t * 18 + e.bob) * .3; e.m.sparks.forEach(s => s.scale.setScalar(f)); }
    if (e.state === 'fuse') { e.fuseT -= dt; flashMats(e.m.mats, Math.sin(G.t * 30) > 0, 0xff3a1a); if (e.fuseT <= 0) explode(e); return true; }
    e.scanT = (e.scanT || 0) - dt; if (e.scanT <= 0) { e.scanT = .25; e.bt = bombTarget(e); }
    const bt = e.bt; if (!bt || (bt.tw && bt.tw.dead) || (bt.bar && !tileAt(bt.c, bt.r).bar)) { e.bt = null; return false; }
    const d = Math.hypot(tileX(bt.c) - g.position.x, tileZ(bt.r) - g.position.z), adj = Math.abs(bt.c - e.tile[0]) + Math.abs(bt.r - e.tile[1]) === 1;
    if ((adj && d < 2.6) || d < 1.9) { e.state = 'fuse'; e.fuseT = E.bomb.fuse; e.next = null; faceTo(g, tileX(bt.c), tileZ(bt.r), 1); play(e.m, 'Taunt', { speed: 1.6 }); Snd.fuse(g.position); return true; }
    if (!e.next) { const st = bfsStep(e.tile[0], e.tile[1], bt.c, bt.r); if (st) { e.next = st; e.state = 'seek'; } }
    return false;
  }
  return false;
}

// 기절(빙결/띄우기): 이동·공격 정지. 띄우기는 포물선으로 떴다 떨어짐, 빙결은 얼음빛
function stunned(e, dt) {
  e.stunT -= dt; const g = e.g;
  if (e.frozen) { if (!(e.flash > 0)) flashMats(e.m.mats, true, 0x8ae0ff); if (Math.random() < .15) emit(P, g.position.x, (e.E.fly ? 3 : e.E.h * .6), g.position.z, 1, 0xdaf6ff, .6, .5, 1, .6); }
  if (e.kup && !e.E.fly) { const k = e.kup; k.t += dt; const f = Math.min(1, k.t / k.dur); g.position.y = groundY(g.position.x, g.position.z) + Math.sin(f * Math.PI) * k.h; g.rotation.z = Math.sin(f * Math.PI) * .5; }
  if (e.stunT <= 0) { e.stunT = 0; if (e.kup) { g.rotation.z = 0; e.kup = null; } e.frozen = false; }
}
export { groundY, separate, updEnemies, shadowOf };
