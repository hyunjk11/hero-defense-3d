// 🗼 무한의 탑 순수 로직 (src/data/spire.js) — T-2
import assert from 'node:assert/strict';
import * as S from '../src/data/spire.js';
import { ETYPES } from '../src/data/monsters.js';
import { waveList } from '../src/data/dungeon.js';
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('OK', name); };
const W = '2026-10-19';
t('표시 · 시작 층 내림', () => { const F = S.spireFloor(13, W); assert.ok(S.floorLabel(F, 0).startsWith('🗼 13층 · 🔴 정예')); assert.ok(S.floorLabel(F, 1).endsWith('웨이브 2/2')); assert.equal(S.snapFrom(23), 21); assert.equal(S.snapFrom(1), 1); assert.equal(S.snapFrom(0), 1); assert.equal(S.snapFrom('x'), 1); assert.equal(S.snapFrom(26), 26); });
t('공개 스위치 꺼짐', () => { assert.equal(S.SP_LIVE, false); assert.equal(S.SP_OPEN, false); });
t('층 종류: 보스 주기', () => { assert.equal(S.floorType(10), 'boss'); assert.equal(S.floorType(5), 'mid'); assert.equal(S.floorType(15), 'mid'); assert.equal(S.floorType(3), 'elite'); assert.equal(S.floorType(8), 'elite'); assert.equal(S.floorType(1), 'normal'); assert.equal(S.floorType(13), 'elite'); });
t('배수 단조 증가 · 표 값', () => { for (let n = 2; n <= 120; n++) { assert.ok(S.hpMul(n) > S.hpMul(n - 1)); assert.ok(S.dmgMul(n) > S.dmgMul(n - 1)); assert.ok(S.countOf(n) >= S.countOf(n - 1)); assert.ok(S.everyOf(n) <= S.everyOf(n - 1)); }
  assert.equal(+S.hpMul(1).toFixed(2), 1.9); assert.equal(+S.hpMul(10).toFixed(2), 2.95); assert.equal(+S.hpMul(50).toFixed(2), 20.75); assert.equal(+S.dmgMul(1).toFixed(2), 1.15); assert.equal(+S.dmgMul(30).toFixed(2), 3.12); /* T-5 spbal 조정값 */ assert.equal(S.everyOf(100), .4); });
t('마리 수 상한 24 (대군 30)', () => { for (let n = 1; n <= 200; n++) { assert.ok(S.countOf(n) <= 24); const F = S.spireFloor(n, W); for (const w of F.waves) assert.ok(w.reduce((a, [, c]) => a + c, 0) <= 30, `${n}`); } assert.equal(S.countOf(1), 14); assert.equal(S.countOf(30), 24); });
t('같은 주 = 같은 탑 · 다른 주 = 다른 어픽스', () => { assert.deepEqual(S.spireFloor(23, W), S.spireFloor(23, W)); let diff = 0; for (let n = 6; n < 60; n++) if (S.affixesOf(n, W).join() !== S.affixesOf(n, '2026-10-26').join()) diff++; assert.ok(diff > 10); });
t('어픽스 개수 · 충돌 없음 · 구현된 것만', () => { for (let n = 1; n <= 120; n++) { const A = S.affixesOf(n, W); assert.equal(A.length, S.affixCount(n), `${n}`); assert.equal(new Set(A).size, A.length);
  for (const a of A) { assert.ok(S.SP_AFFIX_BY[a].on); for (const b of A) if (a !== b) assert.ok(!S.clash(a, b)); } }
  assert.equal(S.affixCount(5), 0); assert.equal(S.affixCount(6), 1); assert.equal(S.affixCount(10), 0); assert.equal(S.affixCount(21), 2); assert.equal(S.affixCount(25), 1); assert.equal(S.affixCount(41), 3); });
t('몬스터: 전부 존재 · 제외 종류 없음 · waveList 호환', () => { for (let n = 1; n <= 120; n++) { const F = S.spireFloor(n, W); assert.equal(F.elite.length, F.waves.length);
  F.waves.forEach((w, i) => { for (const [k] of w) assert.ok(ETYPES[k], k); for (const [k] of w) assert.ok(!S.SP_EXCLUDE.includes(k)); assert.ok(waveList(F, i).length > 0); }); } });
t('보스 로테이션 · 각성 · 중간 보스 교대', () => { assert.equal(S.bossOf(10).id, 'sp_forest'); assert.equal(S.bossOf(50).id, 'dg_lich'); assert.equal(S.bossOf(60).id, 'sp_forest'); assert.ok(S.bossOf(60).awaken); assert.ok(!S.bossOf(50).awaken);
  assert.equal(S.bossOf(5).id, 'boss'); assert.equal(S.bossOf(15).id, 'knights'); assert.equal(S.bossOf(7), null); assert.equal(S.spireFloor(50, W).waves.at(-1)[0][0], 'dg_lich'); });
t('주차 키 = KST 월요일', () => { assert.equal(S.weekKey(Date.parse('2026-10-25T14:59:59Z')), '2026-10-19'); assert.equal(S.weekKey(Date.parse('2026-10-25T15:00:00Z')), '2026-10-26'); assert.equal(S.weekKey(Date.parse('2026-10-18T15:00:00Z')), '2026-10-19'); assert.equal(S.prevWeek('2026-10-26'), '2026-10-19'); });
t('체크포인트 · 따라잡기 축복', () => { assert.deepEqual(S.checkpoints(0), [1]); assert.deepEqual(S.checkpoints(23), [1, 6, 11, 16, 21]); assert.deepEqual(S.checkpoints(25), [1, 6, 11, 16, 21, 26]);
  assert.ok(S.validFrom(21, 23)); assert.ok(!S.validFrom(26, 23)); assert.ok(!S.validFrom(2, 99)); assert.equal(S.catchupBless(1), 0); assert.equal(S.catchupBless(21), 2); assert.equal(S.catchupBless(91), 3);
  assert.equal(S.spireFloor(5, W).bless >= 1, true); assert.equal(S.spireFloor(4, W).bless, S.affixesOf(4, W).includes('blessed') ? 1 : 0); });
t('첫 돌파 보상 표', () => { assert.deepEqual(S.firstClear(5), { floor: 5, souls: 400, medals: 0, title: null }); assert.deepEqual(S.firstClear(10), { floor: 10, souls: 500, medals: 6, title: null }); assert.equal(S.firstClear(30).title, 'spire_30'); assert.equal(S.firstClear(100).souls, 2300); assert.equal(S.firstClear(100).medals, 15);
  assert.equal(S.firstClear(105), null); assert.deepEqual(S.firstClear(110), { floor: 110, souls: 0, medals: 10, title: null }); assert.equal(S.firstClear(7), null);
  const tot = n => S.sumRewards(S.firstClears(0, n)); assert.deepEqual(tot(10), { souls: 900, medals: 6 }); assert.deepEqual(tot(20), { souls: 2200, medals: 13 }); assert.deepEqual(tot(30), { souls: 3900, medals: 21 }); assert.deepEqual(tot(50), { souls: 8500, medals: 40 }); assert.deepEqual(tot(100), { souls: 27000, medals: 105 });
  assert.deepEqual(S.firstClears(23, 31).map(r => r.floor), [25, 30]); assert.deepEqual(S.firstClears(25, 29), []); });
t('주간 보상 · 칭호', () => { assert.deepEqual(S.weekReward(20), { souls: 600, medals: 8 }); assert.deepEqual(S.weekReward(80), { souls: 1500, medals: 25 }); assert.deepEqual(S.weekReward(-3), { souls: 0, medals: 0 }); assert.equal(S.weekTitle(1), 'spire_w1'); assert.equal(S.weekTitle(10), 'spire_w10'); assert.equal(S.weekTitle(11), null); });
t('서버 시간 하한 · 한 도전 +30', () => { assert.equal(S.minSecBetween(1, 5), 4 * 25 + 40); assert.equal(S.capTop(1, 5, 140), 5); assert.equal(S.capTop(1, 5, 139), 4); assert.equal(S.capTop(6, 99, 1e9), 35); assert.equal(S.capTop(1, 3, 10), 0); });
// ---- T-5 ----
const HERO_OK = new Set(['heal', 'summon', 'crack', 'meteor', 'enrage', 'dread', 'shield']), TOWER_ONLY = ['root', 'snowball', 'chill', 'curse', 'lavapool'];
t('T-5 탑 보스 sp_*: 존재 · 영웅에게 통하는 능력만 · 원본 보스 그대로', () => { for (const B of S.SP_BOSSES) { const E = ETYPES[B.base]; assert.ok(E && E.boss, B.id); if (B.id.startsWith('sp_')) { assert.equal(B.base, B.id); assert.ok(E.spire);
    for (const k of Object.keys(E.ab)) assert.ok(HERO_OK.has(k), `${B.id}.${k}`); for (const k of TOWER_ONLY) assert.ok(!E.ab[k], `${B.id}.${k}`); } }
  assert.ok(ETYPES.boss_forest.ab.root && ETYPES.boss_snow.ab.snowball && ETYPES.boss_fire.ab.lavapool && ETYPES.boss_ruins.ab.curse); assert.equal(ETYPES.boss_fire.ab.meteor.heroes, undefined); assert.equal(ETYPES.boss_ruins.ab.dread.tower, 90);
  assert.equal(ETYPES.sp_fire.ab.meteor.heroes, 2); assert.equal(ETYPES.sp_forest.ab.summon.type, 'goblin'); assert.ok(ETYPES[ETYPES.sp_ruins.ab.summon.type]);
  for (const n of [10, 20, 30, 40]) assert.ok(S.spireFloor(n, W).waves.at(-1)[0][0].startsWith('sp_')); assert.equal(S.spireFloor(20, W).waves.at(-1)[1][0], 'icewolf'); });
t('T-5 보스 보정 bossTune: 근접 ×0.75 · 각성 능력 대기 ×0.85 · 원본 불변', () => { const E0 = ETYPES.sp_forest, E = S.bossTune(E0, false), A = S.bossTune(E0, true);
  assert.equal(E.dps, E0.dps * S.SP.bossDmgK); assert.equal(E.ab, E0.ab); assert.equal(A.ab.summon.every, +(14 * .85).toFixed(2)); assert.equal(E0.ab.summon.every, 14); assert.equal(S.bossTune(ETYPES.grunt, true), ETYPES.grunt); assert.equal(S.bossTune(ETYPES.boss, false).dps, 170 * S.SP.bossDmgK); assert.equal(ETYPES.boss.dps, 170); });
t('T-5 보통 어픽스: 뽑힘 · 광폭 · 저주 · 역할 저항', () => { const seen = new Set(); for (let n = 6; n <= 120; n++) for (const a of S.affixesOf(n, W)) seen.add(a); for (const id of ['frenzy', 'curse', 'resM', 'resR']) assert.ok(seen.has(id), id);
  const F = { affixes: ['frenzy', 'curse', 'resM'] }; assert.equal(S.frenzyK(F, 29, 100), 1.3); assert.equal(S.frenzyK(F, 31, 100), 1); assert.equal(S.frenzyK(F, 0, 100), 1); assert.equal(S.frenzyK({ affixes: [] }, 10, 100), 1);
  assert.equal(S.healK(F), .5); assert.equal(S.healK({ affixes: ['haste'] }), 1); assert.equal(S.healK(null), 1);
  assert.equal(S.resK(F, 'caster'), .65); assert.equal(S.resK(F, 'ranged'), 1); assert.equal(S.resK({ affixes: ['resR'] }, 'ranged'), .65); assert.equal(S.resK(F, 'tank'), 1); });
console.log(`spire.test: ${ok} OK`);
