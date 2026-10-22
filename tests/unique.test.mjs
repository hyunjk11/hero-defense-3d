// 고유 아이템 로직 (지급·중복 변환·정리·병합·소급·천장·각성·도감): node tests/unique.test.mjs
import assert from 'node:assert/strict';
import * as E from '../src/account/equip.js';
import * as P from '../src/account/progress.js';
import * as ST from '../src/data/stages.js';
import { UQ, UQ_KEYS, UQ_DUP, UQ_PITY, AWAKE_COST } from '../src/data/items.js';
const R = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const J = o => JSON.parse(JSON.stringify(o));
// ① 같은 키 2회 지급 → 아이템 1개 · 정수 +5 (마력석 +6 · 영혼석 +150)
{ const s = P.empty(); const a = E.grantUnique(s, 'f_bow'); assert.ok(!a.dup && a.chest); assert.equal(s.chests.length, 1); assert.equal(s.chests[0].src, 'unique'); assert.equal(s.uqLog.f_bow, 1);
  const b = E.grantUnique(s, 'f_bow'); assert.ok(b.dup); assert.equal(s.chests.length, 1); assert.equal(s.mat.essence, UQ_DUP.essence); assert.equal(s.mat.crystal, UQ_DUP.crystal); assert.equal(s.souls, UQ_DUP.souls);
  E.openChests(s); assert.equal(s.inv.length, 1); E.grantUnique(s, 'f_bow'); assert.equal(s.inv.length + s.chests.length, 1); assert.equal(s.mat.essence, 10, '가방에 있어도 중복 → 정수'); assert.equal(E.grantUnique(s, 'nope'), null); }
// ② 기기 A(가방)·B(상자) 병합 → 가방 1개 · 상자 0
{ const A = P.empty(), B = P.empty(); E.grantUnique(A, 'f_arm'); E.openChests(A); E.grantUnique(B, 'f_arm'); assert.equal(B.chests.length, 1);
  for (const m of [P.merge(A, B), P.merge(B, A)]) { assert.equal(m.inv.filter(x => x.uq === 'f_arm').length, 1); assert.equal(m.chests.length, 0); assert.equal(m.uqLog.f_arm, 1); } }
// ③ A e=7 · B e=3 (각성 a 도) → 큰 값
{ const A = P.empty(), B = P.empty(); A.inv.push({ ...E.makeUnique('s_acc'), e: 7, a: 1 }); B.inv.push({ ...E.makeUnique('s_acc'), e: 3, a: 4 });
  for (const m of [P.merge(A, B), P.merge(B, A)]) { const it = m.inv.find(x => x.uq === 's_acc'); assert.equal(it.e, 7); assert.equal(it.a, 4); assert.equal(m.inv.length, 1); } }
// ④ 변조 → 표 값으로 복구 · id 무시 · id 만 있으면 키 복구 · 모르는 키는 버림
{ const c = P.clean({ inv: [{ id: 'hack', uq: 'v_sword', s: 'acc', g: 0, n: 'x', m: ['atk', 99], sub: [['crit', 99]], e: 50, a: 9 }, { id: 'u_c_ring' }, { id: 'u_zzz', s: 'armor', g: 4, m: ['hp', 5] }] });
  assert.equal(c.inv.length, 2); const v = c.inv[0]; assert.deepEqual(v, { ...E.makeUnique('v_sword'), e: 10, a: 5 }); assert.equal(v.id, 'u_v_sword'); assert.deepEqual(v.m, UQ.v_sword.m); assert.equal(v.h, 'warrior');
  assert.equal(c.inv[1].uq, 'c_ring'); assert.deepEqual(c.uqLog, { v_sword: 1, c_ring: 1 }, 'uqLog 자가 치유'); assert.equal(E.legendKey(v), 'eruption'); }
// ⑤ 분해 시도 → 남아 있음 · 자동 분해 없음
{ const s = P.empty(); s.inv.push(E.makeUnique('r_arm')); const [, got, n] = E.dismantle(s, ['u_r_arm']); assert.equal(n, 0); assert.equal(got.steel, 0); assert.equal(s.inv.length, 1);
  const f = P.empty(); for (let i = 0; i < E.CAP; i++) f.inv.push(E.makeItem('armor', 'mage', 0, R(i + 1))); const ad = E.addItems(f, [E.makeUnique('r_acc')]); assert.ok(!ad[0].auto); assert.equal(f.inv.length, E.CAP + 1);
  const big = P.empty(); for (let i = 0; i < E.CHEST_CAP; i++) E.addChests(big, [{ it: E.makeItem('armor', 'mage', 0, R(i + 9)), src: 'chest' }]); const x = E.grantUnique(big, 'r_guns'); assert.ok(x.chest && !x.auto); assert.equal(big.chests.length, E.CHEST_CAP + 1, '보관함 상한 예외');
  const rt = P.clean(J(big)); assert.equal(rt.chests.length, E.CHEST_CAP + 1); }
// ⑥ 가방 40/40 에서 고유 상자 개봉 가능 (일반 상자는 그대로 보관)
{ const s = P.empty(); for (let i = 0; i < E.CAP; i++) s.inv.push(E.makeItem('acc', 'mage', 1, R(i + 3))); E.addChests(s, [{ it: E.makeItem('armor', 'mage', 2, R(77)), src: 'chest' }]); E.grantUnique(s, 'c_acc');
  const [, res] = E.openChests(s); assert.equal(res.opened.length, 1); assert.equal(res.opened[0].it.uq, 'c_acc'); assert.ok(res.full); assert.equal(s.chests.length, 1); assert.equal(s.inv.length, E.CAP + 1);
  const rt = P.clean(J(s)); assert.ok(rt.inv.some(x => x.uq === 'c_acc'));
  const many = { inv: [...Array.from({ length: E.CAP + 30 }, (_, i) => E.makeItem('armor', 'mage', 0, R(i + 500))), E.makeUnique('f_bow')] }; const cm = P.clean(many); assert.equal(cm.inv.length, E.CAP + 21, 'CAP+20 자르기는 일반만'); assert.ok(cm.inv.some(x => x.uq)); }
// ⑦ 옛 세이브: 새 필드 없음 → 기본값, 모양 그대로
{ const old = P.clean({ souls: 5, inv: [{ id: 'abc1234', s: 'armor', g: 1, n: '사슬 갑옷', m: ['hp', 12], sub: [['spd', 5]], e: 2 }], mat: { steel: 3, crystal: 1 } });
  assert.deepEqual(old.mat, { steel: 3, crystal: 1 }); assert.deepEqual(old.uqLog, {}); assert.deepEqual(old.uqPity, {}); assert.deepEqual(old.codex, {}); assert.deepEqual(old.codexRw, []); assert.equal(old.inv[0].uq, undefined); }
// ---------- I-7 획득 연결 ----------
{ let s = P.empty(), inf; const r = R(21); for (const id of ['1-1', '1-2', '1-3', '1-4', '1-5']) [s] = P.applyStage(s, id, 1, 'mage', r);
  [s, inf] = P.applyStage(s, '1-6', 1, 'mage', r); assert.ok(inf.loot.some(x => x.it && x.it.uq === 'f_bow' && !x.dup), '1-6 첫 클리어 → 실바누스'); assert.ok(s.chests.some(c => c.id === 'cu_f_bow'));
  [s, inf] = P.applyStage(s, '1-6', 1, 'mage', r); assert.ok(!inf.loot.some(x => x.it && x.it.uq), '재클리어 → 없음');
  for (const id of ['1-1', '1-2', '1-3', '1-4', '1-5']) [s, inf] = P.applyStage(s, id, 3, 'mage', r); assert.ok(!s.uqLog.f_acc); [s, inf] = P.applyStage(s, '1-6', 3, 'mage', r);
  assert.equal(ST.chapterStars(s, 1), 18); assert.ok(inf.loot.some(x => x.it && x.it.uq === 'f_acc'), '별 18 → 이슬방울'); [s, inf] = P.applyStage(s, '1-6', 3, 'mage', r); assert.ok(!inf.loot.some(x => x.it && x.it.uq)); }
// ③ 천장: 보스 처치마다 1.5%, 60회째 확정 (난수 항상 실패여도)
{ let s = P.empty(); s.st['1-1'] = 1; const miss = () => .99; let res;
  for (let i = 0; i < 29; i++) [s, , res] = P.applyRun(s, { wave: 10, kills: 10, hero: 'mage', stage: true, ch: 1, bossKills: [5, 10] }, miss);
  assert.equal(s.uqPity.f_arm, 58); assert.ok(!s.uqLog.f_arm); [s, , res] = P.applyRun(s, { wave: 10, kills: 10, hero: 'mage', stage: true, ch: 1, bossKills: [5, 10] }, miss);
  assert.ok(res.some(x => x.it && x.it.uq === 'f_arm')); assert.equal(s.uqPity.f_arm, undefined); assert.equal(s.uqLog.f_arm, 1); assert.equal(UQ_PITY, 60);
  const hit = () => .001; [s, , res] = P.applyRun(s, { wave: 5, kills: 3, hero: 'mage', stage: true, ch: 1, bossKills: [5] }, hit); assert.ok(res.some(x => x.dup && x.it.uq === 'f_arm'), '보유 후에도 드롭 → 정수'); assert.equal(s.mat.essence, 5);
  const [t] = P.applyRun(P.empty(), { wave: 5, kills: 3, hero: 'mage', stage: true, ch: 2, bossKills: [5] }, miss); assert.equal(t.uqPity.s_acc, 1, '챕터별 키'); }
// 도전 모드 25/40/60 · 20웨이브 이후 보스 정수
{ let s = P.empty(), res; [s, , res] = P.applyRun(s, { wave: 41, kills: 10, hero: 'mage', ch: 'open' }, R(4)); assert.deepEqual(res.filter(x => x.it && x.it.uq).map(x => x.it.uq), ['c_acc', 'c_arm']);
  [s, , res] = P.applyRun(s, { wave: 45, kills: 10, hero: 'mage', ch: 'open', bossKills: [15, 20, 25, 30] }, () => .01); assert.ok(!res.some(x => x.it && x.it.uq)); assert.equal(s.mat.essence, 3, '20웨이브 이후 보스 3회 × 15%'); }
// 소급 지급 (기존 유저): 2회 호출·병합 후에도 1개
{ const s0 = P.empty(); for (const C of ST.CHAPTERS.slice(0, 2)) for (const st of C.stages) s0.st[st.id] = 3; s0.bestWave = 30;
  assert.deepEqual(P.backfillList(s0).sort(), ['c_acc', 'f_acc', 'f_bow', 's_arm', 's_staff']); let [a, g] = P.backfill(s0); assert.equal(g.length, 5); assert.equal(a.chests.length, 5);
  let [b, g2] = P.backfill(a); assert.equal(g2.length, 0); assert.equal(b.chests.length, 5); const [o] = P.backfill(s0); E.openChests(o); const m = P.merge(o, b); assert.equal(m.inv.length + m.chests.length, 5); assert.equal(new Set([...m.inv, ...m.chests.map(c => c.it)].map(x => x.id)).size, 5); }
// 각성: 정수 3/5/8/12/20 + 영혼석, 최대 ★5
{ let s = P.empty(); s.inv.push(E.makeUnique('f_bow')); s.souls = 1e5; s.mat.essence = 50; let r;
  for (let i = 0; i < 5; i++) { [s, r] = P.awaken(s, 'u_f_bow'); assert.equal(r, 'ok'); } assert.equal(s.inv[0].a, 5); assert.equal(s.mat.essence, 50 - AWAKE_COST.reduce((a, b) => a + b, 0)); [s, r] = P.awaken(s, 'u_f_bow'); assert.equal(r, 'max');
  const t = P.empty(); t.inv.push(E.makeUnique('f_arm')); assert.equal(P.awaken(t, 'u_f_arm')[1], 'poor'); assert.equal(P.awaken(t, 'nope')[1], 'none'); }
// 숨긴 영웅: 고유 무기·챕터 무기 없음 (보이는 영웅 무기만 고유)
{ for (const k of UQ_KEYS) if (UQ[k].h) assert.notEqual(UQ[k].h, 'mechanic'); const [a] = P.applyStage(P.empty(), '1-1', 1, 'mechanic', R(8)); const it = a.chests[0].it; if (it.s === 'weapon') assert.notEqual(it.h, 'mechanic'); }
// ---------- I-11 도감 ----------
{ let s = P.empty(); const r = R(31); for (let g = 0; g < 5; g++) s.inv.push(E.makeItem('armor', 'mage', g, r, 1)); s = P.clean(s); assert.equal(s.codex[1].armor, 31, '가방의 챕터 장비 → 도감');
  let rw; [s, rw] = P.claimCodex(s, '1:armor'); assert.deepEqual(rw, { crystal: 5 }); assert.equal(s.mat.crystal, 5); [s, rw] = P.claimCodex(s, '1:armor'); assert.equal(rw, null, '한 번만');
  const other = P.clean({ ...J(s), codexRw: [] }); const m = P.merge(other, s); assert.deepEqual(m.codexRw, ['1:armor']); assert.equal(P.claimCodex(m, '1:armor')[1], null, '병합 후에도 한 번');
  assert.equal(P.claimCodex(s, '1:acc')[1], null, '미완성'); assert.equal(P.claimCodex(s, '1:all')[1], null);
  const full = P.empty(); for (const row of P.codexRows()) for (let g = 0; g < 5; g++) full.inv.push(E.makeItem(row === 'armor' || row === 'acc' ? row : 'weapon', row, g, r, 2)); const f = P.clean(full);
  const cs = P.codexState(f, 2), NC = P.codexRows().length * 5; assert.equal(cs.seen, NC); assert.equal(cs.total, NC); assert.ok(cs.all.done); const [f2, rwa] = P.claimCodex(f, '2:all'); assert.deepEqual(rwa, { essence: 10, souls: 500 }); assert.equal(f2.mat.essence, 10);
  const op = P.empty(); E.addChests(op, [{ it: E.makeItem('acc', 'mage', 3, r, 4), src: 'chest' }]); assert.equal(P.codexBits(op, 4, 'acc'), 0, '미개봉 상자는 아직 도감에 없음'); E.openChests(op); assert.equal(P.codexBits(op, 4, 'acc'), 8);
  const cl = P.clean({ codex: { 1: { archer: 99, evil: 3, mechanic: 1 }, 7: { armor: 1 } }, codexRw: ['1:armor', '1:armor', 'x', '9:all'] }); assert.deepEqual(cl.codex, { 1: { archer: 31, mechanic: 1 } }); assert.deepEqual(cl.codexRw, ['1:armor']); }
console.log('unique tests OK');
