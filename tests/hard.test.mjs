// 하드 모드 로직 테스트: node tests/hard.test.mjs  (docs/HARD_2026-10-21.md)
import * as P from '../src/account/progress.js';
import * as ST from '../src/data/stages.js';
import * as R from '../src/core/roster.js';
import { ETYPES } from '../src/data/monsters.js';
import { UQ_DROP } from '../src/data/items.js';
import assert from 'node:assert/strict';
let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const H = ST.HARD, ids = ch => ST.CHAPTERS.find(c => c.id === ch).stages.map(s => s.id), boss = ch => ids(ch).at(-1);
// ---- 수치 (문서와 같음) ----
assert.equal(H.hp, 2.2); assert.equal(H.dmg, 1.5); assert.equal(H.spd, 1.1); assert.equal(H.souls, 2); assert.ok(H.bossHp > 1 && H.bossCd < 1); assert.ok(H.eliteHp > 1 && H.eliteGold > 1);
// ---- 해금 ----
let s = P.empty();
for (const C of ST.CHAPTERS) { assert.ok(!ST.hardChapterUnlocked(s, C.id)); for (const id of ids(C.id)) assert.ok(!ST.hardUnlocked(s, id)); }
for (const id of ids(1).slice(0, 5)) [s] = P.applyStage(s, id, 3, 'mage', r);
assert.ok(!ST.hardChapterUnlocked(s, 1), '보스 전에는 잠김'); assert.ok(!ST.hardUnlocked(s, '1-1'));
let info; [s, info] = P.applyStage(s, '1-6', 1, 'mage', r); assert.equal(info.hardOpen, 1);
assert.ok(ST.hardChapterUnlocked(s, 1)); assert.ok(ST.hardUnlocked(s, '1-1')); assert.ok(!ST.hardUnlocked(s, '1-2')); assert.ok(!ST.hardChapterUnlocked(s, 2), '2장 하드는 2장 노말 보스 필요');
assert.ok(ST.chapterUnlocked(s, 2) && !ST.hardUnlocked(s, '2-1'));
// 잠긴 하드 스테이지는 클리어 기록 불가
{ const [s2, i2] = P.applyStage(s, '1-3', 3, 'mage', r, true); assert.equal(i2, null); assert.deepEqual(s2.hst, {}); }
// 하드 순차 해금 + 보상
const normal = JSON.stringify(s.st), souls0 = s.souls, star0 = s.starRw;
[s, info] = P.applyStage(s, '1-1', 2, 'mage', r, true, 3);
assert.equal(s.hst['1-1'], 2); assert.ok(info.first && info.hard); assert.equal(info.eliteSouls, 3 * H.eliteSouls);
assert.equal(info.souls, ST.stageReward('1-1', true) * 2 + 3 * H.eliteSouls); assert.equal(s.souls, souls0 + info.souls);
assert.deepEqual(info.unlocked, ['1-2']); assert.ok(ST.hardUnlocked(s, '1-2')); assert.ok(!ST.hardUnlocked(s, '1-3'));
assert.equal(JSON.stringify(s.st), normal, '노말 별은 그대로'); assert.equal(s.starRw, star0, '별 보상 상자는 노말 별만');
assert.equal(info.loot.length, 1); assert.ok(info.loot[0].chest || info.loot[0].it);
// 재도전: 절반 × 2, 별은 최고값
[s, info] = P.applyStage(s, '1-1', 1, 'mage', r, true); assert.equal(s.hst['1-1'], 2); assert.ok(!info.first); assert.equal(info.souls, ST.stageReward('1-1', false) * 2);
assert.equal(ST.stageRewardH('1-6', true, true), ST.stageReward('1-6', true) * 2); assert.equal(ST.stageRewardH('1-6', true, false), ST.stageReward('1-6', true));
// 이미 깬 하드 스테이지는 항상 열림
{ const t = P.clean({ ...s, hst: { '1-4': 1 } }); assert.ok(ST.hardUnlocked(t, '1-4')); assert.ok(ST.hardUnlocked(t, '1-5')); assert.ok(!ST.hardUnlocked(t, '1-2')); }
// 전직 시련 카운터는 하드도 셈
{ const c0 = s.hq.mage.clr; const [t] = P.applyStage(s, '1-1', 3, 'mage', r, true); assert.equal(t.hq.mage.clr, c0 + 1); }
// 하드 별 / 배지
assert.equal(ST.hardChapterStars(s, 1), 2); assert.equal(ST.hardTotalStars(s), 2); assert.ok(!ST.hardChapterCleared(s, 1));
{ const t = P.clean({ ...s, hst: { ...s.hst, '1-6': 3 } }); assert.ok(ST.hardChapterCleared(t, 1)); }
// ---- 저장 호환 ----
{ const old = { v: 1, hero: 'mage', souls: 50, st: { '1-1': 3, '1-6': 2, '2-4': 1 }, starRw: 1 }; const c = P.clean(old); assert.deepEqual(c.hst, {}); assert.deepEqual(c.st, old.st); assert.equal(c.souls, 50);
  assert.ok(ST.hardChapterUnlocked(c, 1)); assert.ok(ST.hardChapterUnlocked(c, 2), '옛 저장의 2장 보스(2-4) 클리어 → 2장 하드 열림'); }
{ const c = P.clean({ hst: { '1-1': 9, 'x-9': 2, '1-2': 0, '1-3': '2', '1-4': -1 }, st: {} }); assert.deepEqual(c.hst, { '1-1': 3, '1-3': 2 }); }
{ const c = P.clean({ hst: 'junk' }); assert.deepEqual(c.hst, {}); const d = P.clean({ hst: [1, 2] }); assert.deepEqual(d.hst, {}); }
// 병합: 하드 별은 최댓값, 다른 쪽만 있어도 유지 (Supabase 동기화 = clean → merge)
{ const a = P.clean({ st: { '1-6': 1 }, hst: { '1-1': 1, '1-2': 3 } }), b = P.clean({ st: { '1-6': 1 }, hst: { '1-1': 3 } }); const m = P.merge(a, b); assert.deepEqual(m.hst, { '1-1': 3, '1-2': 3 });
  const m2 = P.merge(P.clean({ st: { '1-1': 1 } }), b); assert.deepEqual(m2.hst, { '1-1': 3 }); const m3 = P.merge(a, null); assert.deepEqual(m3.hst, a.hst);
  assert.deepEqual(JSON.parse(JSON.stringify(P.clean(JSON.parse(JSON.stringify(m))))).hst, m.hst, 'JSON 왕복'); }
// ---- applyRun 하드: 상자 등급↑ · 고유 확률↑ · 천장 2배 ----
{ let t = P.clean({ st: { '1-6': 1 } }); const k = Object.keys(t.uqPity); void k;
  const [n1] = P.applyRun(t, { wave: 3, kills: 10, stage: true, ch: 1, bossKills: [5, 10], hard: false }, () => .9); const [n2] = P.applyRun(t, { wave: 3, kills: 10, stage: true, ch: 1, bossKills: [5, 10], hard: true }, () => .9);
  const pk = Object.keys(n2.uqPity)[0]; assert.ok(pk); assert.equal(n1.uqPity[pk], 2); assert.equal(n2.uqPity[pk], 4);
  // 확률: r = UQ_DROP*2 → 노말 X, 하드 O
  const [, , l1] = P.applyRun(t, { wave: 3, kills: 0, stage: true, ch: 1, bossKills: [5], hard: false }, () => UQ_DROP * 2); const [, , l2] = P.applyRun(t, { wave: 3, kills: 0, stage: true, ch: 1, bossKills: [5], hard: true }, () => UQ_DROP * 2);
  assert.equal(l1.filter(x => x.it && x.it.uq).length + l1.filter(x => x.uq).length, 0); assert.ok(l2.length >= 1, '하드 고유 드롭');
  // 하드 상자 등급 확률표가 더 좋음 (전설 확률)
  const p0 = P.dropPreview('1-1', 'mage', t), p1 = P.dropPreview('1-1', 'mage', t, true); assert.ok(p1.odds[4] > p0.odds[4] && p1.odds[0] < p0.odds[0]); assert.ok(p1.hard && p1.uqDrop > p0.uqDrop);
  const [c5] = P.applyRun(t, { wave: 10, kills: 0, stage: true, ch: 1, hard: true }, r); assert.equal(c5.chests.length - t.chests.length, 2);
  // 도전 모드에는 하드 없음
  const [e1] = P.applyRun(t, { wave: 10, kills: 0, stage: false, ch: 'open', hard: true }, () => .5); const [e0] = P.applyRun(t, { wave: 10, kills: 0, stage: false, ch: 'open' }, () => .5); assert.equal(JSON.stringify(e1), JSON.stringify(e0)); }
// ---- 정예 ----
assert.equal(R.eliteCount(1), 0); assert.equal(R.eliteCount(2), 0); assert.equal(R.eliteCount(3), 1); assert.equal(R.eliteCount(7), 2); assert.equal(R.eliteCount(11), 3); assert.equal(R.eliteCount(15), 4); assert.equal(R.eliteCount(40), H.eliteMax);
for (const id of Object.keys(ST.STAGES)) { const S = ST.STAGES[id]; for (let n = 1; n <= S.waves; n++) {
  const q = R.stageWave(S, n, 8 + n * 3, r); if (n === S.waves && S.boss) q.push('boss_x'); const len = q.length, before = q.slice(), f = R.applyElites(S, n, q.map(t => t === 'boss_x' ? 'boss' : t));
  assert.equal(f.length, len); const t = R.eliteType(S, n), k = f.filter(Boolean).length; assert.equal(k, n >= 3 ? R.eliteCount(n) : 0, id + ':' + n);
  if (k) { const E = ETYPES[t]; assert.ok(E && !E.pack && !E.fly && !E.child && !E.boss, t); }
  const P2 = R.previewWave(S, n, false, true); if (k) { assert.equal(P2.elite.t, t); assert.equal(P2.elite.n, k); assert.ok(P2.list[0].elite === k, '미리보기 맨 위 = 정예'); } else assert.equal(P2.elite, null);
  const P0 = R.previewWave(S, n, false, false); assert.equal(P0.elite, null); assert.ok(!P0.list.some(x => x.elite)); void before; } }
// 정예는 결정적 (같은 입력 → 같은 자리)
{ const S = ST.STAGES['2-3'], q1 = R.stageWave(S, 9, 35, () => .3), q2 = q1.slice(); assert.deepEqual(R.applyElites(S, 9, q1), R.applyElites(S, 9, q2)); assert.deepEqual(q1, q2); }
// 무리 몬스터 사이는 정예로 바꾸지 않음 (무리 수 유지)
{ const S = ST.STAGES['2-4']; for (let n = 3; n <= 15; n++) { const q = R.stageWave(S, n, 8 + n * 3, r), w0 = q.filter(t => t === 'icewolf').length; R.applyElites(S, n, q); assert.equal(q.filter(t => t === 'icewolf').length, w0); } }
console.log('hard tests OK');
