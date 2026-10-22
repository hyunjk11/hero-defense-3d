// 타워 성장 · 연구소 로직 테스트: node tests/growth.test.mjs
import * as P from '../src/account/progress.js';
import * as GR from '../src/data/growth.js';
import { TOWERS } from '../src/data/towers.js';
import assert from 'node:assert/strict';
// 성장/연구 없으면 기존 수치와 완전히 같음 (회귀 불변)
for (const t of GR.TTYPES) for (let l = 1; l <= 3; l++) { const s = GR.towerStats(t, l), D = TOWERS[t]; assert.equal(s.dmg, D.dmg[l - 1]); assert.equal(s.rate, D.rate[l - 1]); assert.equal(s.range, D.range[l - 1]);
  if (D.splash) assert.equal(s.splash, D.splash[l - 1]); if (D.chain) { assert.equal(s.chain, D.chain[l - 1]); assert.equal(s.slow, D.slow[l - 1]); assert.equal(s.falloff, .85); assert.equal(s.hop, 3.8); }
  assert.deepEqual(GR.towerStats(t, l, 1, null, GR.resMods(GR.emptyResearch(), t)), s); assert.deepEqual(GR.towerStats(t, l, 1, null, GR.resMods(undefined, t)), s); }
// 별: XP → 별
assert.equal(GR.starsFor(0), 1); assert.equal(GR.starsFor(599), 1); assert.equal(GR.starsFor(600), 2); assert.equal(GR.starsFor(2399), 2); assert.equal(GR.starsFor(2400), 3);
// 별이 오를수록 강해짐, 분기는 종류마다 정확히 2개이고 서로 다름
for (const t of GR.TTYPES) { const a = GR.towerStats(t, 1, 1), b = GR.towerStats(t, 1, 2), c = GR.towerStats(t, 1, 3); assert.ok(b.dmg > a.dmg && c.dmg > b.dmg && c.rate > a.rate && c.range > a.range);
  const ks = Object.keys(GR.BRANCH[t]); assert.equal(ks.length, 2); assert.notDeepEqual(GR.towerStats(t, 3, 3, ks[0]), GR.towerStats(t, 3, 3, ks[1])); }
assert.equal(GR.towerStats('magic', 3, 3, 'storm').chain, 10); assert.equal(GR.towerStats('magic', 3, 3, 'frost').chain, 2); assert.ok(GR.towerStats('cannon', 2, 3, 'blast').splash > GR.towerStats('cannon', 2, 3).splash);
assert.ok(Math.abs(GR.towerStats('arrow', 1, 3, 'snipe').range - 8 * 1.1 * 1.4) < 1e-9);
// 연구 비용 증가 · 구매 · 조건
let s = P.empty(); assert.deepEqual(s.research, GR.emptyResearch());
for (const k of GR.RKEYS) for (let l = 1; l < GR.RES[k].max; l++) { const a = GR.resCost(k, l - 1), b = GR.resCost(k, l); assert.ok(b.souls > a.souls); }
let ok; [s, ok] = P.buyResearch(s, 'arrow', 'atk'); assert.equal(ok, false, '돈 없음');
s.souls = 1e6; s.mat.steel = 1e4; s.mat.crystal = 0; [s, ok] = P.buyResearch(s, 'arrow', 'atk'); assert.ok(ok); assert.equal(s.research.arrow.atk, 1); assert.equal(s.souls, 1e6 - 40); assert.equal(s.mat.steel, 1e4 - 2);
[s, ok] = P.buyResearch(s, 'arrow', 'start'); assert.equal(ok, false, '후반 단계 잠김'); assert.match(GR.resBlock(s, 'arrow', 'start'), /기본 연구/);
for (let i = 0; i < 30; i++) for (const k of ['atk', 'rng', 'spd']) [s] = P.buyResearch(s, 'arrow', k);
assert.deepEqual([s.research.arrow.atk, s.research.arrow.rng, s.research.arrow.spd], [10, 5, 8]); assert.equal(GR.resBlock(s, 'arrow', 'atk'), '최대');
assert.match(GR.resBlock(s, 'arrow', 'start'), /마력석/); s.mat.crystal = 100; for (let i = 0; i < 6; i++) [s] = P.buyResearch(s, 'arrow', 'start'); assert.equal(s.research.arrow.start, 4);
assert.equal(s.research.cannon.atk, 0, '종류별 독립');
const m = GR.resMods(s.research, 'arrow'); assert.ok(Math.abs(m.dmg - 1.4) < 1e-9 && Math.abs(m.rng - 1.15) < 1e-9 && Math.abs(m.rate - 1.24) < 1e-9); assert.equal(GR.starsFor(m.xp0), 2); assert.equal(m.xp0, 600 + 1080);
assert.equal(GR.startXp({ magic: { start: 2 } }, 'magic'), 240); assert.equal(GR.starsFor(240), 1);
// 저장 왕복 · 구 세이브 · 잘못된 값 · 병합(최대)
const rt = P.clean(JSON.parse(JSON.stringify(s))); assert.deepEqual(rt.research, s.research);
assert.deepEqual(P.clean({ souls: 5 }).research, GR.emptyResearch());
assert.deepEqual(P.clean({ research: { arrow: { atk: 99, rng: -3, spd: 'x' }, bogus: { atk: 3 } } }).research.arrow, { atk: 10, rng: 0, spd: 0, start: 0 });
const mg = P.merge({ research: { arrow: { atk: 3, rng: 1 }, magic: { start: 2 } } }, { research: { arrow: { atk: 5 }, cannon: { spd: 4 } } });
assert.deepEqual(mg.research.arrow, { atk: 5, rng: 1, spd: 0, start: 0 }); assert.equal(mg.research.cannon.spd, 4); assert.equal(mg.research.magic.start, 2);
assert.deepEqual(P.merge({ souls: 1 }, null).research, GR.emptyResearch());
console.log('growth.test ok');
// 타워 공격속도 전체 ×0.8 (공격 간격 ×1.25) — 기본 수치에만, 연구는 그 위에 곱
{ const T = await import('../src/data/towers.js'); assert.equal(T.TOWER_RATE_K, .8); assert.deepEqual(T.TOWERS.arrow.rate, [1.6, 1.92, 2.32]); assert.deepEqual(T.TOWERS.cannon.rate, [.44, .496, .56]); assert.deepEqual(T.TOWERS.magic.rate, [.72, .8, .92]);
  const r = GR.emptyResearch(); r.arrow.spd = 8; assert.ok(Math.abs(GR.towerStats('arrow', 3, 1, null, GR.resMods(r, 'arrow')).rate - 2.9 * .8 * 1.24) < 1e-9); console.log('tower rate x0.8 ok'); }
// 전직 타워 보너스: 없으면 resMods 결과 동일, 있으면 연구에 곱 (+ 분기 보너스)
{ const A = await import('../src/data/advance.js'); const r = GR.emptyResearch(); r.arrow.spd = 5; r.cannon.atk = 3;
  for (const t of GR.TTYPES) assert.deepEqual(GR.resMods(r, t, undefined), GR.resMods(r, t)); for (const t of GR.TTYPES) assert.deepEqual(GR.resMods(r, t, A.advTowerMods(null, t)), GR.resMods(r, t));
  const w = GR.resMods(r, 'arrow', A.advTowerMods(A.ADV.archer.wind, 'arrow')); assert.ok(Math.abs(w.rate - 1.15 * 1.06) < 1e-9); assert.ok(Math.abs(GR.towerStats('arrow', 3, 3, 'multi', w).rate - GR.towerStats('arrow', 3, 3, 'multi', GR.resMods(r, 'arrow')).rate * 1.06) < 1e-9);
  assert.equal(GR.branchFor('arrow', 'multi', w).targets, 4); assert.equal(GR.branchFor('arrow', 'multi', GR.resMods(r, 'arrow')), GR.BRANCH.arrow.multi);
  const k = GR.resMods(r, 'arrow', A.advTowerMods(A.ADV.archer.hawk, 'arrow')); assert.ok(Math.abs(GR.towerStats('arrow', 3, 3, 'snipe', k).dmg - GR.towerStats('arrow', 3, 3, 'snipe', GR.resMods(r, 'arrow')).dmg * 1.1) < 1e-9);
  const fl = GR.resMods(r, 'cannon', A.advTowerMods(A.ADV.mage.flame, 'cannon')); assert.ok(Math.abs(GR.towerStats('cannon', 2, 1, null, fl).splash - 2.5 * 1.08) < 1e-9);
  const fr = GR.resMods(r, 'magic', A.advTowerMods(A.ADV.mage.frost, 'magic')); assert.ok(Math.abs(GR.towerStats('magic', 1, 1, null, fr).slow - .45) < 1e-9); assert.equal(GR.branchFor('magic', 'frost', fr).freezeEvery, 3);
  assert.equal(GR.branchFor('cannon', 'blast', GR.resMods(r, 'cannon', A.advTowerMods(A.ADV.gunner.thorn, 'cannon'))).cluster, 3); // 장미 저격수(2026-10-22): 대포 집속탄 보너스 없음
  assert.ok(Math.abs(GR.towerStats('arrow', 3, 3, null, GR.resMods(r, 'arrow', A.advTowerMods(A.ADV.gunner.thorn, 'arrow'))).range - GR.towerStats('arrow', 3, 3, null, GR.resMods(r, 'arrow')).range * 1.08) < 1e-9); // 화살 타워 사거리 +8%
  assert.ok(Math.abs(GR.resMods(r, 'cannon', A.advTowerMods(A.ADV.warrior.berserk, 'cannon')).dmg - 1.12 * 1.05) < 1e-9); console.log('adv tower mods ok'); }
