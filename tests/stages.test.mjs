// 챕터/스테이지 로직 테스트: node tests/stages.test.mjs
import * as P from '../src/account/progress.js';
import * as ST from '../src/data/stages.js';
import assert from 'node:assert/strict';
let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// 데이터 무결성: 코어/포털이 격자 안, 서로 겹치지 않음, 10~15 웨이브, 챕터 마지막 = 보스
for (const ch of ST.CHAPTERS) ch.stages.forEach((s, i) => { assert.ok(s.waves >= 10 && s.waves <= 15, s.id); for (const p of [s.core, ...s.spawns]) assert.ok(p[0] >= 0 && p[0] < 24 && p[1] >= 0 && p[1] < 16, s.id);
  for (const sp of s.spawns) assert.ok(Math.abs(sp[0] - s.core[0]) + Math.abs(sp[1] - s.core[1]) > 8, s.id); assert.equal(!!s.boss, i === ch.stages.length - 1, s.id); });
assert.ok(ST.CHAPTERS[0].stages.length >= 5 && ST.CHAPTERS[0].stages.length <= 8);
// 별
assert.equal(ST.starsFor(30, 30), 3); assert.equal(ST.starsFor(21, 30), 2); assert.equal(ST.starsFor(20, 30), 1); assert.equal(ST.starsFor(1, 30), 1);
// 해금
let s = P.empty(); assert.ok(ST.stageUnlocked(s, '1-1')); assert.ok(!ST.stageUnlocked(s, '1-2')); assert.ok(!ST.chapterUnlocked(s, 2)); assert.ok(!ST.chapterUnlocked(s, 3));
let info; [s, info] = P.applyStage(s, '1-1', 2, 'mage', r);
assert.equal(s.st['1-1'], 2); assert.ok(info.first); assert.equal(info.souls, ST.stageReward('1-1', true)); assert.equal(info.loot.length, 1); assert.equal(info.loot[0].it.c, 1); assert.ok(info.loot[0].it.n.startsWith('숲의 '));
assert.deepEqual(info.unlocked, ['1-2']); assert.ok(ST.stageUnlocked(s, '1-2'));
// 재도전: 별은 최고값, 영혼석 절반, 첫 클리어 장비 없음
const souls0 = s.souls; [s, info] = P.applyStage(s, '1-1', 1, 'mage', r); assert.equal(s.st['1-1'], 2); assert.equal(s.souls - souls0, Math.round(ST.stageReward('1-1', true) / 2)); assert.equal(info.loot.length, 0);
[s, info] = P.applyStage(s, '1-1', 3, 'mage', r); assert.equal(s.st['1-1'], 3);
// 챕터 1 전부 클리어 → 2장 해금, 별 보상 상자 (5개마다)
for (const st of ST.CHAPTERS[0].stages.slice(1)) [s, info] = P.applyStage(s, st.id, 3, 'mage', r);
assert.ok(ST.chapterUnlocked(s, 2)); assert.ok(ST.stageUnlocked(s, '2-1')); assert.equal(ST.totalStars(s), 18); assert.equal(s.starRw, 3);
assert.equal(s.inv.filter(x => x.c === 1).length, 6);
// 저장 왕복 / 구버전 / 잘못된 값 / 병합
const rt = P.clean(JSON.parse(JSON.stringify(s))); assert.deepEqual(rt.st, s.st); assert.equal(rt.starRw, 3); assert.equal(rt.inv.find(x => x.c === 1).c, 1);
assert.deepEqual(P.clean({ souls: 3 }).st, {}); assert.deepEqual(P.clean({ st: { '1-1': 9, 'x-9': 2, '1-2': -1 } }).st, { '1-1': 3 });
const m = P.merge({ st: { '1-1': 3, '1-2': 1 }, starRw: 0 }, { st: { '1-2': 2, '1-3': 1 }, starRw: 1 }); assert.deepEqual(m.st, { '1-1': 3, '1-2': 2, '1-3': 1 }); assert.equal(m.starRw, 1);
// 스테이지 판은 도전 모드 최고 웨이브에 반영되지 않음
{ const [a] = P.applyRun(P.empty(), { wave: 12, kills: 30, stage: true }, r); assert.equal(a.bestWave, 0); const [b] = P.applyRun(P.empty(), { wave: 12, kills: 30 }, r); assert.equal(b.bestWave, 12); }
console.log('stages tests OK');
