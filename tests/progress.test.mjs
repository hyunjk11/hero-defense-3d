import * as P from '../src/account/progress.js';
import assert from 'node:assert/strict';
const e = P.empty(); assert.equal(e.hero, 'mage'); assert.deepEqual(P.clean({ souls: -5, heroLv: { mage: { hp: 99 } }, hero: 'x' }).heroLv.mage.hp, 10);
const [s1, got] = P.applyRun(e, { wave: 5, kills: 30 }); assert.equal(got, 50); assert.equal(s1.souls, 50); assert.equal(s1.bestWave, 5); assert.equal(s1.stats.runs, 1);
const [s2, ok] = P.buyPerm(s1, 'mage', 'hp'); assert.ok(ok); assert.equal(s2.souls, 20); assert.equal(s2.heroLv.mage.hp, 1);
const [, no] = P.buyPerm(s2, 'mage', 'atk'); assert.equal(no, false);
const m = P.merge({ souls: 100, bestWave: 3, hero: 'archer', stats: { runs: 4 } }, { souls: 40, bestWave: 9, nick: '클라우드', stats: { runs: 2 }, heroLv: { warrior: { atk: 3 } } });
assert.equal(m.souls, 100); assert.equal(m.bestWave, 9); assert.equal(m.hero, 'archer'); assert.equal(m.nick, '클라우드'); assert.equal(m.heroLv.warrior.atk, 3);
assert.equal(P.merge({ hero: 'warrior' }, null).hero, 'warrior');
console.log('progress tests OK');
// ---- 전직 저장 (J-2) ----
{ const A = await import('../src/data/advance.js');
  const old = P.clean({ souls: 10, heroLv: { archer: { hp: 12, atk: 15 } } }); assert.deepEqual(old.adv, {}); assert.deepEqual(old.hq, {}); assert.equal(old.heroLv.archer.hp, 10, '옛 세이브(전직 없음) → 상한 10');
  assert.deepEqual(P.clean({ adv: { archer: { b: 'zzz' }, mage: { b: 'frost', n: -3 }, nope: { b: 'wind' } } }).adv, { mage: { b: 'frost', n: 1 } });
  // 시련: 그 영웅으로 보스 스테이지 클리어할 때만 boss 증가
  let s = P.clean({ st: { '1-1': 3, '1-2': 3, '1-3': 3, '1-4': 3, '1-5': 3 } }); [s] = P.applyStage(s, '1-1', 3, 'archer'); assert.deepEqual(s.hq.archer, { boss: 0, clr: 1 });
  [s] = P.applyStage(s, '1-6', 3, 'archer'); assert.deepEqual(s.hq.archer, { boss: 1, clr: 2 }); assert.equal(s.hq.mage, undefined);
  // 조건 충족 전 실패 → 충족 후 성공 (재료 차감), 상한 15
  s.heroLv.archer = { hp: 10, atk: 0 }; s.souls = 5000; s.mat.crystal = 30; s.mat.essence = 3; let ok;
  [s, ok] = P.buyAdv(s, 'archer', 'wind'); assert.equal(ok, false, '2장 보스 미클리어');
  for (const id of ['2-1', '2-2', '2-3', '2-4']) s.st[id] = 1; [s, ok] = P.buyAdv(s, 'archer', 'wind', false); assert.equal(ok, false, '소유권 없음');
  [s, ok] = P.buyAdv(s, 'archer', 'wind'); assert.ok(ok); assert.deepEqual(s.adv.archer, { b: 'wind', n: 1 }); assert.equal(s.souls, 3500); assert.equal(s.mat.crystal, 10); assert.equal(s.mat.essence || 0, 0);
  [s, ok] = P.buyAdv(s, 'archer', 'wind'); assert.equal(ok, false, '같은 분기');
  [s, ok] = P.buyAdv(s, 'archer', 'hawk'); assert.ok(ok); assert.deepEqual(s.adv.archer, { b: 'hawk', n: 2 }); assert.equal(s.souls, 3000); assert.equal(s.mat.crystal, 10, '재전직은 영혼석만');
  assert.equal(P.permMax(s, 'archer'), 15); assert.equal(P.permMax(s, 'mage'), 10); s.souls = 1e7;
  for (let i = 0; i < 6; i++) [s, ok] = P.buyPerm(s, 'archer', 'hp'); assert.equal(s.heroLv.archer.hp, 15); assert.equal(ok, false, '15에서 멈춤');
  assert.equal(P.clean(s).heroLv.archer.hp, 15); assert.equal(P.permCost('hp', 14), Math.round(30 * Math.pow(1.5, 14)));
  // 병합: n 큰 쪽, 시련 최댓값, 상한은 병합 결과의 전직 기준
  const m2 = P.merge({ adv: { archer: { b: 'wind', n: 3 } }, hq: { archer: { boss: 2, clr: 1 } }, heroLv: { archer: { hp: 14 } } }, { adv: { archer: { b: 'hawk', n: 2 }, mage: { b: 'flame', n: 1 } }, hq: { archer: { boss: 1, clr: 9 } } });
  assert.deepEqual(m2.adv, { archer: { b: 'wind', n: 3 }, mage: { b: 'flame', n: 1 } }); assert.deepEqual(m2.hq.archer, { boss: 2, clr: 9 }); assert.equal(m2.heroLv.archer.hp, 14);
  assert.equal(P.merge({ heroLv: { archer: { hp: 14 } } }, {}).heroLv.archer.hp, 10, '전직 기록 없이 상한 초과 → 10');
  assert.ok(A.advBlock(m2, 'archer', 'hawk') !== '현재 분기'); console.log('progress adv tests OK'); }
