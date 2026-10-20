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
// 3장 화산: 2장 보스 처치 후 해금, 4개 스테이지(3-4 보스), 용암 강이 포털→코어 길을 완전히 막지 않음(용암 외 지형은 굴착 가능), 보상은 장마다 증가, 4장은 준비 중
{ const C3 = ST.CHAPTERS.find(c => c.id === 3); assert.equal(C3.stages.length, 4); assert.ok(!C3.soon && C3.stages[3].boss);
  let v = P.empty(); for (const st of ST.CHAPTERS[0].stages) [v] = P.applyStage(v, st.id, 1, 'mage', r); assert.ok(!ST.chapterUnlocked(v, 3));
  for (const st of ST.CHAPTERS[1].stages.slice(0, 3)) [v] = P.applyStage(v, st.id, 1, 'mage', r); assert.ok(!ST.chapterUnlocked(v, 3));
  let inf; [v, inf] = P.applyStage(v, '2-4', 2, 'mage', r); assert.ok(ST.chapterUnlocked(v, 3) && ST.stageUnlocked(v, '3-1') && !ST.stageUnlocked(v, '3-2')); assert.deepEqual(inf.unlocked, ['3-1']); assert.ok(!ST.chapterUnlocked(v, 4));
  [v, inf] = P.applyStage(v, '3-1', 3, 'mage', r); assert.ok(inf.loot[0].it.n.startsWith('화염 ') && inf.loot[0].it.c === 3);
  for (const id of ['3-1', '3-2', '3-3', '3-4']) { const S = ST.STAGES[id], L = ST.lavaTiles(S); assert.ok(L.size >= 10, id + ' lava');
    for (const p of [S.core, ...S.spawns]) for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) assert.ok(!L.has((p[0] + dc) + ',' + (p[1] + dr)), id + ' lava near portal/core');
    const seen = new Set([S.core.join(',')]), q = [S.core]; while (q.length) { const [c, rr] = q.shift(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dc) + ',' + (rr + dr); if (c + dc < 0 || rr + dr < 0 || c + dc >= 24 || rr + dr >= 16 || seen.has(k) || L.has(k)) continue; seen.add(k); q.push([c + dc, rr + dr]); } }
    for (const sp of S.spawns) assert.ok(seen.has(sp.join(',')), id + ' spawn reachable');
    assert.ok(seen.size >= 24 * 16 - L.size - 6, id + ' no sealed pockets'); }
  assert.ok(ST.stageReward('3-1', true) > ST.stageReward('2-4', true) - 60 && ST.stageReward('3-4', true) > ST.stageReward('2-4', true) && ST.stageReward('3-1', true) > ST.stageReward('2-1', true));
  for (const ch of [1, 2]) { const a = ST.CHAPTERS.find(c => c.id === ch).stages, b = C3.stages; assert.ok(b[b.length - 1].hp > a[a.length - 1].hp); } }
// 4장 폐허: 3장 보스(3-4) 처치 후 해금, 4개 스테이지(4-4 보스), 포털 수 증가(2→4), 고대 성벽이 길을 완전히 막지 않음(성벽은 무너뜨릴 수 있지만 틈이 있어야 함), 체력·보상은 3장보다 한 단계 위
{ const C4 = ST.CHAPTERS.find(c => c.id === 4); assert.equal(C4.stages.length, 4); assert.ok(!C4.soon && C4.stages[3].boss && C4.theme === 'ruins');
  assert.deepEqual(C4.stages.map(s => s.id), ['4-1', '4-2', '4-3', '4-4']); C4.stages.forEach(s => assert.ok(/[가-힣]/.test(s.n), s.id));
  for (let i = 1; i < 4; i++) assert.ok(C4.stages[i].spawns.length >= C4.stages[i - 1].spawns.length && C4.stages[i].hp > C4.stages[i - 1].hp);
  assert.ok(C4.stages[0].spawns.length >= 2 && C4.stages[3].spawns.length >= 4);
  const lay = new Set(C4.stages.map(s => s.core.join(',') + '|' + s.spawns.map(p => p.join(',')).join(';'))); assert.equal(lay.size, 4, 'distinct layouts');
  let v = P.empty(); for (const ch of [0, 1]) for (const st of ST.CHAPTERS[ch].stages) [v] = P.applyStage(v, st.id, 1, 'mage', r);
  for (const st of ST.CHAPTERS[2].stages.slice(0, 3)) [v] = P.applyStage(v, st.id, 1, 'mage', r); assert.ok(!ST.chapterUnlocked(v, 4) && !ST.stageUnlocked(v, '4-1'));
  let inf; [v, inf] = P.applyStage(v, '3-4', 2, 'mage', r); assert.ok(ST.chapterUnlocked(v, 4) && ST.stageUnlocked(v, '4-1') && !ST.stageUnlocked(v, '4-2')); assert.deepEqual(inf.unlocked, ['4-1']);
  [v, inf] = P.applyStage(v, '4-1', 3, 'mage', r); assert.ok(inf.loot[0].it.n.startsWith('폐허의 ') && inf.loot[0].it.c === 4); assert.ok(ST.stageUnlocked(v, '4-2'));
  for (const id of ['4-1', '4-2', '4-3', '4-4']) { const S = ST.STAGES[id], W = ST.wallTiles(S); assert.ok(W.size >= 12, id + ' walls'); assert.equal(ST.lavaTiles(S).size, 0);
    for (const p of [S.core, ...S.spawns]) for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) assert.ok(!W.has((p[0] + dc) + ',' + (p[1] + dr)), id + ' wall near portal/core');
    const seen = new Set([S.core.join(',')]), q = [S.core]; while (q.length) { const [c, rr] = q.shift(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dc) + ',' + (rr + dr); if (c + dc < 0 || rr + dr < 0 || c + dc >= 24 || rr + dr >= 16 || seen.has(k) || W.has(k)) continue; seen.add(k); q.push([c + dc, rr + dr]); } }
    for (const sp of S.spawns) assert.ok(seen.has(sp.join(',')), id + ' spawn reachable without breaking walls'); }
  const C3 = ST.CHAPTERS.find(c => c.id === 3).stages; C4.stages.forEach((s, i) => { assert.ok(s.hp > C3[C3.length - 1].hp, s.id + ' hp step'); assert.ok(ST.stageReward(s.id, true) > ST.stageReward(C3[i].id, true), s.id + ' reward'); }); }
console.log('stages tests OK');
