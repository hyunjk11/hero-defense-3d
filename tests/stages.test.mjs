// 챕터/스테이지 로직 테스트: node tests/stages.test.mjs
import * as P from '../src/account/progress.js';
import * as ST from '../src/data/stages.js';
import * as E from '../src/account/equip.js';
import { CHSET } from '../src/data/items.js';
import assert from 'node:assert/strict';
import { UQ } from '../src/data/items.js';
const UQS = ch => Object.keys(UQ).find(k => UQ[k].ch === ch && UQ[k].src.stars === ch);
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
assert.equal(s.st['1-1'], 2); assert.ok(info.first); assert.equal(info.souls, ST.stageReward('1-1', true)); assert.equal(info.loot.length, 1); assert.equal(info.loot[0].it.c, 1); { const it = info.loot[0].it, row = it.s === 'weapon' ? it.h : it.s; assert.equal(it.n, CHSET[1].names[row][it.g], '첫 클리어 = 숲 세트 이름'); }
assert.deepEqual(info.unlocked, ['1-2']); assert.ok(ST.stageUnlocked(s, '1-2'));
// 재도전: 별은 최고값, 영혼석 절반, 첫 클리어 장비 없음
const souls0 = s.souls; [s, info] = P.applyStage(s, '1-1', 1, 'mage', r); assert.equal(s.st['1-1'], 2); assert.equal(s.souls - souls0, Math.round(ST.stageReward('1-1', true) / 2)); assert.equal(info.loot.length, 0);
[s, info] = P.applyStage(s, '1-1', 3, 'mage', r); assert.equal(s.st['1-1'], 3);
// 챕터 1 전부 클리어 → 2장 해금, 별 보상 상자 (5개마다)
for (const st of ST.CHAPTERS[0].stages.slice(1)) [s, info] = P.applyStage(s, st.id, 3, 'mage', r);
assert.ok(ST.chapterUnlocked(s, 2)); assert.ok(ST.stageUnlocked(s, '2-1')); assert.equal(ST.totalStars(s), 18); assert.equal(s.starRw, 3);
assert.equal(s.inv.length, 0); assert.equal(s.chests.filter(c => c.it.c === 1 && c.src === 'stage').length, 6); // 미개봉 상자로 보관
assert.equal(s.chests.filter(c => c.src === 'star').length, 3); assert.ok(s.chests.filter(c => c.src === 'star').every(c => c.it.c === 1), '별 보상 상자 = 방금 클리어한 챕터 세트');
assert.deepEqual(s.chests.filter(c => c.it.uq).map(c => c.it.uq).sort(), ['f_acc', 'f_bow'], '1-6 첫 클리어 ① + 별 18 ② 고유');
const rc = P.clean(JSON.parse(JSON.stringify(s))); assert.equal(rc.chests.length, s.chests.length); s = P.clean(s); E.openChests(s); assert.equal(s.chests.length, 0);
assert.equal(s.inv.filter(x => x.c === 1).length, 9);
// 저장 왕복 / 구버전 / 잘못된 값 / 병합
const rt = P.clean(JSON.parse(JSON.stringify(s))); assert.deepEqual(rt.st, s.st); assert.equal(rt.starRw, 3); assert.equal(rt.inv.find(x => x.c === 1).c, 1);
assert.deepEqual(P.clean({ souls: 3 }).st, {}); assert.deepEqual(P.clean({ st: { '1-1': 9, 'x-9': 2, '1-2': -1 } }).st, { '1-1': 3 });
const m = P.merge({ st: { '1-1': 3, '1-2': 1 }, starRw: 0 }, { st: { '1-2': 2, '1-3': 1 }, starRw: 1 }); assert.deepEqual(m.st, { '1-1': 3, '1-2': 2, '1-3': 1 }); assert.equal(m.starRw, 1);
// 스테이지 판은 도전 모드 최고 웨이브에 반영되지 않음
{ const [a] = P.applyRun(P.empty(), { wave: 12, kills: 30, stage: true }, r); assert.equal(a.bestWave, 0); const [b] = P.applyRun(P.empty(), { wave: 12, kills: 30 }, r); assert.equal(b.bestWave, 12); }
// 3장 화산: 2장 보스 처치 후 해금, 6개 스테이지(id 3-4 = 보스, 맨 끝), 용암 강이 포털→코어 길을 완전히 막지 않음(용암 외 지형은 굴착 가능), 보상은 장마다 증가, 4장은 준비 중
{ const C3 = ST.CHAPTERS.find(c => c.id === 3); assert.equal(C3.stages.length, 6); assert.ok(!C3.soon && C3.stages[5].boss && C3.stages[5].id === '3-4');
  let v = P.empty(); for (const st of ST.CHAPTERS[0].stages) [v] = P.applyStage(v, st.id, 1, 'mage', r); assert.ok(!ST.chapterUnlocked(v, 3));
  for (const st of ST.CHAPTERS[1].stages.slice(0, 5)) [v] = P.applyStage(v, st.id, 1, 'mage', r); assert.ok(!ST.chapterUnlocked(v, 3));
  let inf; [v, inf] = P.applyStage(v, '2-4', 2, 'mage', r); assert.ok(ST.chapterUnlocked(v, 3) && ST.stageUnlocked(v, '3-1') && !ST.stageUnlocked(v, '3-2')); assert.deepEqual(inf.unlocked, ['3-1']); assert.ok(!ST.chapterUnlocked(v, 4));
  [v, inf] = P.applyStage(v, '3-1', 3, 'mage', r); assert.ok(inf.loot[0].it.n === CHSET[3].names[inf.loot[0].it.s === 'weapon' ? inf.loot[0].it.h : inf.loot[0].it.s][inf.loot[0].it.g] && inf.loot[0].it.c === 3 && inf.loot[0].it.g >= 1);
  for (const id of ['3-1', '3-2', '3-3', '3-5', '3-6', '3-4']) { const S = ST.STAGES[id], L = ST.lavaTiles(S); assert.ok(L.size >= 10, id + ' lava');
    for (const p of [S.core, ...S.spawns]) for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) assert.ok(!L.has((p[0] + dc) + ',' + (p[1] + dr)), id + ' lava near portal/core');
    const seen = new Set([S.core.join(',')]), q = [S.core]; while (q.length) { const [c, rr] = q.shift(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dc) + ',' + (rr + dr); if (c + dc < 0 || rr + dr < 0 || c + dc >= 24 || rr + dr >= 16 || seen.has(k) || L.has(k)) continue; seen.add(k); q.push([c + dc, rr + dr]); } }
    for (const sp of S.spawns) assert.ok(seen.has(sp.join(',')), id + ' spawn reachable');
    assert.ok(seen.size >= 24 * 16 - L.size - 6, id + ' no sealed pockets'); }
  assert.ok(ST.stageReward('3-4', true) > ST.stageReward('2-4', true) && ST.stageReward('3-1', true) > ST.stageReward('2-1', true));
  for (const ch of [1, 2]) { const a = ST.CHAPTERS.find(c => c.id === ch).stages, b = C3.stages; assert.ok(b[b.length - 1].hp > a[a.length - 1].hp); } }
// 4장 폐허: 3장 보스(id 3-4) 처치 후 해금, 6개 스테이지(id 4-4 = 보스, 맨 끝), 포털 수 증가(2→4), 고대 성벽이 길을 완전히 막지 않음(성벽은 무너뜨릴 수 있지만 틈이 있어야 함), 체력·보상은 3장보다 한 단계 위
{ const C4 = ST.CHAPTERS.find(c => c.id === 4); assert.equal(C4.stages.length, 6); assert.ok(!C4.soon && C4.stages[5].boss && C4.theme === 'ruins');
  assert.deepEqual(C4.stages.map(s => s.id), ['4-1', '4-2', '4-3', '4-5', '4-6', '4-4']); assert.deepEqual(C4.stages.map(s => s.no), ['4-1', '4-2', '4-3', '4-4', '4-5', '4-6']); C4.stages.forEach(s => assert.ok(/[가-힣]/.test(s.n), s.id));
  for (let i = 1; i < 6; i++) assert.ok(C4.stages[i].spawns.length >= C4.stages[i - 1].spawns.length && C4.stages[i].hp > C4.stages[i - 1].hp);
  assert.ok(C4.stages[0].spawns.length >= 2 && C4.stages[5].spawns.length >= 4);
  const lay = new Set(C4.stages.map(s => s.core.join(',') + '|' + s.spawns.map(p => p.join(',')).join(';'))); assert.equal(lay.size, 6, 'distinct layouts');
  let v = P.empty(); for (const ch of [0, 1]) for (const st of ST.CHAPTERS[ch].stages) [v] = P.applyStage(v, st.id, 1, 'mage', r);
  for (const st of ST.CHAPTERS[2].stages.slice(0, 5)) [v] = P.applyStage(v, st.id, 1, 'mage', r); assert.ok(!ST.chapterUnlocked(v, 4) && !ST.stageUnlocked(v, '4-1'));
  let inf; [v, inf] = P.applyStage(v, '3-4', 2, 'mage', r); assert.ok(ST.chapterUnlocked(v, 4) && ST.stageUnlocked(v, '4-1') && !ST.stageUnlocked(v, '4-2')); assert.deepEqual(inf.unlocked, ['4-1']);
  [v, inf] = P.applyStage(v, '4-1', 3, 'mage', r); assert.ok(inf.loot[0].it.n === CHSET[4].names[inf.loot[0].it.s === 'weapon' ? inf.loot[0].it.h : inf.loot[0].it.s][inf.loot[0].it.g] && inf.loot[0].it.c === 4 && inf.loot[0].it.g >= 1); assert.ok(ST.stageUnlocked(v, '4-2'));
  for (const id of ['4-1', '4-2', '4-3', '4-5', '4-6', '4-4']) { const S = ST.STAGES[id], W = ST.wallTiles(S); assert.ok(W.size >= 12, id + ' walls'); assert.equal(ST.lavaTiles(S).size, 0);
    for (const p of [S.core, ...S.spawns]) for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) assert.ok(!W.has((p[0] + dc) + ',' + (p[1] + dr)), id + ' wall near portal/core');
    const seen = new Set([S.core.join(',')]), q = [S.core]; while (q.length) { const [c, rr] = q.shift(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dc) + ',' + (rr + dr); if (c + dc < 0 || rr + dr < 0 || c + dc >= 24 || rr + dr >= 16 || seen.has(k) || W.has(k)) continue; seen.add(k); q.push([c + dc, rr + dr]); } }
    for (const sp of S.spawns) assert.ok(seen.has(sp.join(',')), id + ' spawn reachable without breaking walls'); }
  const C3 = ST.CHAPTERS.find(c => c.id === 3).stages; C4.stages.forEach((s, i) => { assert.ok(s.hp > C3[C3.length - 1].hp, s.id + ' hp step'); assert.ok(ST.stageReward(s.id, true) > ST.stageReward(C3[i].id, true), s.id + ' reward'); }); }
// ---------- 2026-10-21 새 스테이지 (2~4장 x-5·x-6, 보스 앞) ----------
{ const NEW = ['2-5', '2-6', '3-5', '3-6', '4-5', '4-6'];
  for (const ch of [2, 3, 4]) { const C = ST.CHAPTERS.find(c => c.id === ch), L = C.stages;
    assert.equal(L.length, 6, ch + '장 6스테이지'); assert.deepEqual(L.map(s => s.id), [1, 2, 3, 5, 6, 4].map(i => `${ch}-${i}`), ch + '장 순서 (보스 id x-4 맨 끝)');
    L.forEach((s, i) => { assert.equal(s.no, `${ch}-${i + 1}`); assert.equal(ST.stageNo(s.id), s.no); assert.equal(ST.STAGES[s.id].idx, i); });
    assert.ok(L[5].boss && L.filter(s => s.boss).length === 1); assert.equal(ST.stageNo(`${ch}-4`), `${ch}-6`, '보스 표시 번호');
    for (let i = 1; i < 6; i++) { assert.ok(L[i].hp > L[i - 1].hp, L[i].id + ' hp 증가'); assert.ok(L[i].hp - L[i - 1].hp <= .1 + 1e-9, L[i].id + ' hp 완만'); assert.ok(L[i].waves >= L[i - 1].waves, L[i].id + ' 웨이브'); assert.ok(ST.stageReward(L[i].id, true) > ST.stageReward(L[i - 1].id, true), L[i].id + ' 보상'); }
    assert.equal(Math.max(...L.map(s => s.hp)), L[5].hp, '보스 hp 최고');
    assert.equal(new Set(L.map(s => s.core.join(',') + '|' + s.spawns.map(p => p.join(',')).join(';'))).size, 6, ch + '장 배치 모두 다름');
    assert.equal(new Set(L.map(s => s.seed)).size, 6); assert.equal(new Set(L.map(s => s.n)).size, 6); }
  assert.equal(Object.keys(ST.STAGES).length, 24); assert.equal(new Set(ST.CHAPTERS.flatMap(c => c.stages.map(s => s.no))).size, 24);
  // 모든 스테이지: 포털 → 코어 길이 지형(용암/성벽)만으로 막히지 않음
  for (const id in ST.STAGES) { const S = ST.STAGES[id], B = new Set([...ST.lavaTiles(S), ...ST.wallTiles(S)]);
    const seen = new Set([S.core.join(',')]), q = [S.core]; while (q.length) { const [c, rr] = q.shift(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dc) + ',' + (rr + dr); if (c + dc < 0 || rr + dr < 0 || c + dc >= 24 || rr + dr >= 16 || seen.has(k) || B.has(k)) continue; seen.add(k); q.push([c + dc, rr + dr]); } }
    for (const sp of S.spawns) assert.ok(seen.has(sp.join(',')), id + ' 포털 도달'); assert.ok(seen.size + B.size === 24 * 16, id + ' 막힌 칸 없음'); }
  for (const id of NEW) { const S = ST.STAGES[id]; assert.ok(/^[가-힣 ]+$/.test(S.n), id); assert.ok(!S.boss);
    if (S.ch === 3) assert.ok(ST.lavaTiles(S).size >= 10 && !S.walls, id); if (S.ch === 4) assert.ok(ST.wallTiles(S).size >= 12 && !S.lava, id); if (S.ch === 2) assert.ok(!S.lava && !S.walls, id);
    const d = P.dropPreview(id, 'mage', P.empty()); assert.ok(d && d.ch === S.ch && d.starsMax === 18 && !d.uq[0].here, id + ' 드롭 미리보기'); }
  // 정상 진행: 2-3 → 2-5 → 2-6 → 2-4(보스) → 3장
  { let v = P.empty(), inf; for (const st of ST.CHAPTERS[0].stages) [v] = P.applyStage(v, st.id, 3, 'mage', r);
    for (const id of ['2-1', '2-2', '2-3']) [v] = P.applyStage(v, id, 3, 'mage', r);
    assert.ok(ST.stageUnlocked(v, '2-5') && !ST.stageUnlocked(v, '2-6') && !ST.stageUnlocked(v, '2-4'));
    [v, inf] = P.applyStage(v, '2-5', 3, 'mage', r); assert.deepEqual(inf.unlocked, ['2-6']); assert.ok(inf.first && inf.loot.some(x => x.src === 'stage' && x.it.c === 2));
    [v, inf] = P.applyStage(v, '2-6', 3, 'mage', r); assert.deepEqual(inf.unlocked, ['2-4']); assert.ok(!ST.chapterUnlocked(v, 3), '새 스테이지는 다음 장을 열지 않음');
    [v, inf] = P.applyStage(v, '2-4', 3, 'mage', r); assert.ok(ST.chapterUnlocked(v, 3)); assert.deepEqual(inf.unlocked, ['3-1']); assert.ok(inf.loot.some(x => x.it && x.it.uq === 's_staff'), '보스 고유');
    assert.ok(inf.loot.some(x => x.it && x.it.uq === UQS(2)), '18/18 별 만점 고유'); }
  // 저장 호환: 예전(4스테이지 시절) 2·3·4장 보스까지 깬 저장 → 별·해금·고유·전직 조건 유지, 새 스테이지는 열려 있고 플레이 가능
  { const old = { st: { '1-1': 3, '1-2': 3, '1-3': 3, '1-4': 3, '1-5': 3, '1-6': 3, '2-1': 3, '2-2': 3, '2-3': 3, '2-4': 3, '3-1': 2, '3-2': 1, '3-3': 1, '3-4': 1, '4-1': 1, '4-2': 1, '4-3': 1, '4-4': 1 }, starRw: 7 };
    let v = P.clean(JSON.parse(JSON.stringify(old))); assert.deepEqual(v.st, old.st, '별 그대로'); assert.equal(ST.totalStars(v), 18 + 12 + 5 + 4);
    for (const ch of [2, 3, 4]) { assert.ok(ST.chapterUnlocked(v, ch), ch + '장 열림 유지'); assert.ok(ST.stageUnlocked(v, `${ch}-4`), ch + '장 보스 열림 유지');
      assert.ok(ST.stageUnlocked(v, `${ch}-5`), ch + '-5 열림'); assert.ok(!ST.stageUnlocked(v, `${ch}-6`), ch + '-6 은 x-5 클리어 후'); }
    const { chapterUnlocked: cu } = ST; assert.ok(cu(v, 3) && cu(v, 4));
    // 고유: 보스 고유는 소급 지급 대상, 별 만점(예전 12/12)은 이제 18 이 필요하지만 이미 받은 고유는 그대로
    const bf = P.backfillList(v); for (const k of ['f_bow', 'f_acc', 's_staff', 'v_sword', 'r_guns']) assert.ok(bf.includes(k), k + ' 소급'); assert.ok(!bf.includes(UQS(2)), '2장 별 12/18 → 아직 아님');
    // 새 스테이지 첫 클리어: 별 기록·첫 클리어 보상, 해금 목록에 이미 열린 보스는 안 나옴, 보스 별 그대로
    let inf; [v, inf] = P.applyStage(v, '2-5', 3, 'mage', r); assert.ok(inf.first); assert.deepEqual(inf.unlocked, ['2-6']); assert.equal(v.st['2-4'], 3);
    [v, inf] = P.applyStage(v, '2-6', 3, 'mage', r); assert.deepEqual(inf.unlocked, [], '보스는 원래 열려 있음'); assert.ok(inf.loot.some(x => x.it && x.it.uq === UQS(2)), '18/18 → 별 만점 고유');
    assert.ok(ST.chapterUnlocked(v, 3) && ST.chapterUnlocked(v, 4));
    // 병합: 옛 기기(새 id 없음) + 새 기기 → 최댓값, 새 id 유지
    const m = P.merge(old, v); assert.equal(m.st['2-5'], 3); assert.equal(m.st['2-4'], 3); assert.equal(m.st['4-4'], 1);
    // 전직 조건 '2장 보스 클리어' = chapterUnlocked(3) — 옛 저장에서도 참
    const AD = await import('../src/data/advance.js'); assert.ok(AD.ADV_CH === 3 && ST.chapterUnlocked(P.clean(old), AD.ADV_CH)); }
}
console.log('stages tests OK');
