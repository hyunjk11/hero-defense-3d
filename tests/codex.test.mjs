// 도감: 챕터에서 정상 경로로 나오는 등급만 완성 조건 — node tests/codex.test.mjs
import assert from 'node:assert/strict';
import * as P from '../src/account/progress.js';
import * as E from '../src/account/equip.js';
import * as ST from '../src/data/stages.js';
import { CH_KEYS, CODEX_RW } from '../src/data/items.js';
let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const J = o => JSON.parse(JSON.stringify(o));
const slotOf = row => (row === 'armor' || row === 'acc' ? row : 'weapon');

// ---- 1) 모든 정상 경로를 실제로 굴려서 나오는 등급 = obtainableGrades(ch) ----
const seen = Object.fromEntries(CH_KEYS.map(c => [c, new Set()])); const add = it => { if (it && !it.uq && it.c) seen[it.c].add(it.g); };
for (const ch of CH_KEYS) {
  for (let i = 0; i < 400; i++) { for (const it of E.chestsFor(60, 'mage', r, ch)) add(it); for (const it of P.hardChests(60, 'mage', r, ch)) add(it); }      // 상자 · 하드 상자(+tierUp)
  for (let w = 0; w <= 60; w += 5) for (let i = 0; i < 200; i++) { add(E.randomItem('mage', E.bossOdds(w), r, undefined, ch)); add(E.randomItem('mage', E.bossOdds(w + 5 * ST.HARD.tierUp), r, undefined, ch)); } // 보스 드롭 (하드 포함)
  for (const S of Object.values(ST.STAGES).filter(S => S.ch === ch)) for (let i = 0; i < 300; i++) add(P.chapterItem(ch, 'mage', P.stageTier(S), r)); // 스테이지 첫 클리어
  for (let k = 1; k < 40; k++) for (let i = 0; i < 30; i++) add(E.randomItem('mage', E.chestOdds(2 + k), r, undefined, ch)); // 별 보상 상자
  for (const R of E.RECIPES) for (let i = 0; i < 600; i++) { const s = P.empty(); s.souls = 1e6; s.mat = { steel: 1e6, crystal: 1e6, essence: 0 }; const [, res, it] = E.craft(s, R.k, undefined, 'mage', r, ch); assert.equal(res, 'ok'); add(it); } // 대장간 세트 제작
}
for (let i = 0; i < 4000; i++) for (const it of E.chestsFor(60, 'mage', r, CH_KEYS)) add(it); // 도전 모드 (열린 챕터 무작위)
for (const ch of CH_KEYS) assert.deepEqual([...seen[ch]].sort(), E.obtainableGrades(ch), `챕터 ${ch}: 실제 나오는 등급 = obtainableGrades`);
assert.deepEqual(E.obtainableGrades(1), [0, 1, 2, 3, 4]); assert.deepEqual(E.obtainableGrades(2), [0, 1, 2, 3, 4]);
assert.deepEqual(E.obtainableGrades(3), [1, 2, 3, 4], '3장 일반 없음'); assert.deepEqual(E.obtainableGrades(4), [1, 2, 3, 4], '4장 일반 없음');
assert.equal(E.gradeMask(3), 30); assert.equal(E.gradeMask(1), 31);

// ---- 2) 정상 경로로 얻을 수 있는 칸을 전부 채우면 완성 (예전: 3·4장은 24/30 에서 멈춤) ----
const fill = (ch, grades) => { const s = P.empty(); for (const row of P.codexRows()) for (const g of grades) s.inv.push(E.makeItem(slotOf(row), row, g, r, ch)); return P.clean(s); };
for (const ch of CH_KEYS) {
  const G = E.obtainableGrades(ch), s = fill(ch, G), C = P.codexState(s, ch), rows = P.codexRows().length;
  assert.equal(C.total, rows * G.length, `챕터 ${ch} 칸 수`); assert.equal(C.seen, C.total, `챕터 ${ch} 다 봄`); assert.ok(C.rows.every(x => x.done && x.max === G.length && x.n === G.length), `챕터 ${ch} 행 완성`); assert.ok(C.all.done, `챕터 ${ch} 전부 완성`);
  let t = s, got = 0; for (const x of C.rows) { const o = P.claimCodex(t, x.key); t = o[0]; if (o[1]) got++; } assert.equal(got, rows, '행 보상 전부');
  const [t2, rwa] = P.claimCodex(t, ch + ':all'); assert.deepEqual(rwa, CODEX_RW.all); assert.equal(P.claimCodex(t2, ch + ':all')[1], null, '전부 완성 보상 한 번만');
  assert.equal(t2.mat.crystal, rows * CODEX_RW.row.crystal); assert.equal(t2.mat.essence, CODEX_RW.all.essence);
}
assert.equal(P.codexState(P.empty(), 3).total, 24); assert.equal(P.codexState(P.empty(), 1).total, 30);
// 하나 빠지면 미완성
{ const s = fill(3, [1, 2, 3]); const C = P.codexState(s, 3); assert.ok(C.rows.every(x => !x.done && x.n === 3)); assert.ok(!C.all.done); assert.equal(P.claimCodex(s, '3:armor')[1], null); }

// ---- 3) 기존 저장: 불가능 등급(관리자 우편 등)으로 등록된 칸은 지워지지 않고, 진행도는 넘치지 않음 ----
{ const s = fill(4, [0, 1, 2, 3, 4]); const C = P.codexState(s, 4); assert.equal(s.codex[4].armor, 31, '등록 비트 유지'); assert.equal(C.seen, 24); assert.equal(C.total, 24); assert.ok(C.all.done);
  assert.ok(C.rows.every(x => x.extra === 1), '불가능 등급 등록은 extra 로 표시'); const m = P.merge(P.clean(J(s)), s); assert.equal(m.codex[4].armor, 31, '병합 후 유지'); }
{ const s = P.clean({ codex: { 3: { armor: 1 } } }); const C = P.codexState(s, 3); const a = C.rows.find(x => x.row === 'armor'); assert.equal(a.n, 0); assert.equal(a.extra, 1); assert.ok(!a.done); assert.equal(C.seen, 0); }
// 옛 저장(예전 규칙으로 1~4 등급만 등록해 막혀 있던 3장) → 이제 보상 받기 가능, 이미 받은 키는 다시 못 받음
{ const s = fill(3, [1, 2, 3, 4]); s.codexRw = ['3:armor']; const t = P.clean(J(s)); const C = P.codexState(t, 3);
  assert.equal(C.rows.find(x => x.row === 'armor').got, true); assert.equal(P.claimCodex(t, '3:armor')[1], null, '이미 받은 행'); assert.deepEqual(P.claimCodex(t, '3:acc')[1], CODEX_RW.row, '새로 완성된 행'); }
console.log('codex tests OK');
