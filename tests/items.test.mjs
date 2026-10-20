// 챕터 장비 세트(CHSET) · 고유 아이템 표(UQ) · 챕터 드롭 · 드롭 미리보기: node tests/items.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as E from '../src/account/equip.js';
import * as P from '../src/account/progress.js';
import * as ST from '../src/data/stages.js';
import { HERO_KEYS, VISIBLE_HEROES } from '../src/data/heroes.js';
import { CHSET, CH_KEYS, UQ, UQ_KEYS, uqOfChapter, CHAL_UQ, chOdds } from '../src/data/items.js';
const R = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// ---------- I-1 데이터 ----------
assert.deepEqual(CH_KEYS, ST.CHAPTERS.map(c => c.id), '챕터마다 세트 1개');
const allNames = new Set();
for (const ch of CH_KEYS) { const C = CHSET[ch], SC = ST.CHAPTERS.find(c => c.id === ch); assert.equal(C.color, SC.color, `${ch} 색 = 챕터 색`); assert.ok(C.badge && C.n);
  for (const row of [...HERO_KEYS, 'armor', 'acc']) { const L = C.names[row]; assert.ok(Array.isArray(L) && L.length === 5, `${ch} ${row} 5등급`);
    for (const n of L) { assert.ok(typeof n === 'string' && n.length > 0 && n.length <= 20, `${ch} ${row} 이름 길이 ${n}`); assert.ok(!allNames.has(n), `이름 중복 ${n}`); allNames.add(n); } }
  for (const W of [C.subW, C.accW]) for (const k in W) assert.ok(k in E.STAT, `${ch} 가중치 키 ${k}`);
  for (const k in C.accW) assert.ok(['crit', 'spd', 'skill', 'cdr'].includes(k), `${ch} accW ${k}`); }
assert.equal(UQ_KEYS.length, 15, '고유 15개 (챕터 4×3 + 도전 3)');
for (const k of UQ_KEYS) { const U = UQ[k], it = E.makeUnique(k);
  assert.equal(it.id, 'u_' + k); assert.equal(it.g, 4); assert.equal(it.uq, k); assert.ok(U.n.length <= 20, k + ' name');
  assert.ok(U.m[0] in E.STAT && U.sub.every(([s]) => s in E.STAT), k + ' 스탯 키'); assert.ok(U.sub.length >= 2 && U.sub.length <= 3, k + ' 서브 2~3개');
  assert.equal(new Set([U.m[0], ...U.sub.map(x => x[0])]).size, 1 + U.sub.length, k + ' 스탯 중복 없음');
  if (U.s === 'weapon') { assert.equal(U.m[0], 'atk'); assert.ok(VISIBLE_HEROES.includes(U.h), k + ' 보이는 영웅 무기'); assert.ok(E.LSK[U.sk] && E.LSK[U.sk].h === U.h && E.LSK[U.sk].type === 'active' && E.LSK[U.sk].uq, k + ' [E] 스킬'); assert.ok(!E.LPOOL[U.h].includes(U.sk), '고유 스킬은 일반 전설 풀에 없음'); assert.equal(E.legendKey(it), U.sk); }
  else { assert.equal(it.h, undefined); assert.ok(U.ic && U.tr && U.p, k + ' 자동 발동'); assert.equal(E.legendKey(it), null); assert.equal(U.m[0], U.s === 'armor' ? 'hp' : U.m[0]); if (U.s === 'acc') assert.ok(['crit', 'spd', 'skill', 'cdr'].includes(U.m[0]), k + ' 장신구 주스탯'); }
  const pw = E.power(it); assert.ok(pw >= 340 && pw <= 700, `${k} power ${pw}`); // 예산: 설계 360~560 → 치명 피해(critD)는 단위가 커서 v_sword 670·r_guns 630, 최저 f_acc 350 (최고 굴림 전설 무기 ≈ 870)
  assert.ok(U.un && U.d && U.a3, k + ' 궁극기 설명'); }
for (const ch of CH_KEYS) for (const kind of ['boss', 'stars', 'drop']) assert.ok(uqOfChapter(ch, kind), `${ch} ${kind} 고유`);
for (const ch of CH_KEYS) { const b = ST.CHAPTERS.find(c => c.id === ch).stages.find(s => s.boss); assert.equal(UQ[uqOfChapter(ch, 'boss')].src.boss, b.id); }
assert.deepEqual(CHAL_UQ.map(k => UQ[k].src.wave), [25, 40, 60]);
// ---------- I-2 makeItem(ch) ----------
// 챕터 없음 → 예전 코드(origin/main e01de1a)와 같은 시드 결과 (스냅샷 해시)
{ const now = Date.now; Date.now = () => 0; let seed = 42; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647, out = [];
  for (let i = 0; i < 300; i++) out.push(E.randomItem(['archer', 'mage', 'warrior', 'gunner', 'mechanic'][i % 5], E.chestOdds(1 + i % 7), r));
  out.push(E.chestsFor(40, 'mage', r)); out.push(P.applyRun(P.empty(), { wave: 20, kills: 50, hero: 'archer', stage: true }, r)[0].chests);
  out.push(E.craft({ ...P.empty(), souls: 1e5, mat: { steel: 1e4, crystal: 1e3 } }, 'fine', 'acc', 'mage', r)[2]); Date.now = now;
  assert.equal(createHash('sha1').update(JSON.stringify(out)).digest('hex'), 'd8fe3c01bde04466a480126fce40e1033f1be655', '챕터 없는 경로 난수 결과 불변'); }
{ const r = R(7); for (const ch of CH_KEYS) for (let g = 0; g < 5; g++) for (const s of E.SLOT_KEYS) { const it = E.makeItem(s, 'warrior', g, r, ch); assert.equal(it.c, ch); assert.equal(it.n, CHSET[ch].names[s === 'weapon' ? 'warrior' : s][g]); assert.equal(it.sub.length, E.SUBN[g]); assert.equal(it.m[1], E.MAIN[it.m[0]][g], '수치표 그대로'); } }
{ const r = R(11); let cd = 0, n = 0, acc = {}; for (let i = 0; i < 1000; i++) { const it = E.makeItem('armor', 'mage', 3, r, 3); for (const [k] of it.sub) { n++; if (k === 'critD') cd++; } const a = E.makeItem('acc', 'mage', 2, r, 3); acc[a.m[0]] = (acc[a.m[0]] || 0) + 1; }
  assert.ok(cd / n > 1.5 / 7, `화산 critD 비율 ${cd / n} > 균등`); assert.ok(acc.crit > acc.spd && acc.crit > acc.cdr, '화산 장신구 주스탯 = 치명 위주'); }
// ---------- I-3 챕터 하한 · 드롭 경로 ----------
assert.deepEqual(chOdds([5, 4, 3, 2, 1], 3), [0, 4, 3, 2, 1]); assert.deepEqual(chOdds([5, 4, 3, 2, 1], 2), [5, 4, 3, 2, 1]);
{ let s = P.empty(); for (const id of Object.keys(ST.STAGES)) s.st[id] = 1; s.uqLog = Object.fromEntries(UQ_KEYS.map(k => [k, 1]));
  const [a, , res] = P.applyRun(s, { wave: 13, kills: 40, hero: 'mage', stage: true, ch: 3, bossKills: [5, 10] }, R(3)); assert.equal(res.filter(x => x.src === 'chest').length, 2);
  for (let i = 0; i < 40; i++) { const [b] = P.applyRun(s, { wave: 13, kills: 40, hero: 'mage', stage: true, ch: 3 }, R(100 + i)); assert.ok(b.chests.every(c => c.it.c === 3 && c.it.g >= 1), '3장 상자 = 화산 세트, 고급 이상'); }
  void a; }
{ const s = P.empty(); const [a] = P.applyRun(s, { wave: 20, kills: 10, hero: 'archer', ch: 'open' }, R(5)); assert.ok(a.chests.filter(c => c.src === 'chest').every(c => c.it.c === 1), '도전 모드: 1장만 열림 → 숲'); }
{ const s = P.empty(); for (const id of ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '2-1', '2-2', '2-3', '2-4']) s.st[id] = 1; const seen = new Set();
  for (let i = 0; i < 20; i++) { const [a] = P.applyRun(s, { wave: 20, kills: 10, hero: 'archer', ch: 'open' }, R(50 + i)); a.chests.filter(c => c.src === 'chest').forEach(c => seen.add(c.it.c)); } assert.deepEqual([...seen].sort(), [1, 2, 3], '도전 모드: 열린 챕터 중 무작위'); }
{ const s = P.empty(), [a, inf] = P.applyStage(s, '1-1', 1, 'gunner', R(9)); void a; assert.equal(inf.loot[0].it.c, 1); }
// 대장간 세트 제작: 비용 +20%, 이름 = 세트
{ const s = { ...P.empty(), souls: 1000, mat: { steel: 500, crystal: 50 } }; const [, res, it] = E.craft(s, 'basic', 'armor', 'mage', R(4), 2); assert.equal(res, 'ok'); assert.equal(it.c, 2); assert.equal(s.souls, 1000 - 36); assert.equal(s.mat.steel, 500 - 18); }
// ---------- I-5 드롭 미리보기 ----------
{ const s = P.empty(); const p1 = P.dropPreview('1-1', 'mage', s), p6 = P.dropPreview('1-6', 'mage', s), p3 = P.dropPreview('3-2', 'mage', s);
  assert.equal(p1.grades[4], false, '1-1 전설 점 없음'); assert.equal(p6.grades[4], true, '1-6 전설 있음'); assert.equal(p3.grades[0], false, '3장 일반 없음'); assert.ok(p1.grades[0]);
  assert.deepEqual(p6.uq.map(u => u.k), ['f_bow', 'f_acc', 'f_arm']); assert.ok(p6.uq[0].here && !p1.uq[0].here); assert.ok(p6.uq.every(u => !u.have)); assert.equal(p1.starsMax, 18); assert.equal(P.dropPreview('2-1', 'x', s).starsMax, 12);
  assert.equal(P.dropPreview('1-1', 'mechanic', s).hero, 'archer', '숨긴 영웅 → 기본 영웅 무기');
  s.uqPity = { f_arm: 23 }; assert.equal(P.dropPreview('1-2', 'mage', P.clean(s)).uq[2].pity, 23); assert.equal(P.dropPreview('9-9', 'mage', s), null); }
// ---------- 숨긴 영웅(버들 등 CLASSES.*.hidden): 고유·챕터 장비·도감에 보이지 않아야 함 ----------
{ const { isHidden } = await import('../src/data/heroes.js');
  for (const k of UQ_KEYS) assert.ok(!(UQ[k].h && isHidden(UQ[k].h)), `고유 ${k} 가 숨긴 영웅 전용`);
  assert.ok(P.codexRows().every(r => !isHidden(r)), '도감 행에 숨긴 영웅 없음'); assert.equal(P.codexRows().length * 5, 30, '도감 챕터당 30칸');
  for (const h of HERO_KEYS.filter(isHidden)) { const r = R(7); for (let i = 0; i < 300; i++) { const it = E.randomItem(h, [20, 20, 20, 20, 20], r, 'weapon', 1 + (i % 4)); assert.ok(!isHidden(it.h), '숨긴 영웅 챕터 무기 생성 금지'); } }
  const s = P.empty(); s.bestWave = 99; for (const C of ST.CHAPTERS) for (const x of C.stages) s.st[x.id] = 3; const s2 = P.clean(s);
  assert.ok(P.backfillList(s2).every(k => !(UQ[k].h && isHidden(UQ[k].h))), 'backfill 숨긴 영웅 고유 없음'); }
console.log('items tests OK');
