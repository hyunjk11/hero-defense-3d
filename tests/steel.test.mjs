// 강철 사용처 (2026-10-24): 교환(비율·하루 상한·KST 0시)·옵션 재설정·바리케이드 보강 · 세이브 정리/병합. node tests/steel.test.mjs
import assert from 'node:assert/strict';
import * as P from '../src/account/progress.js';
import * as SX from '../src/account/steel.js';
import * as E from '../src/account/equip.js';
import { barHpAt } from '../src/data/towers.js';
const T0 = Date.UTC(2026, 9, 24, 3, 0); // KST 12:00
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// KST 날짜: UTC 14:59 = KST 23:59 (같은 날), UTC 15:00 = 다음 날 0시
assert.equal(SX.kstDay(Date.UTC(2026, 9, 24, 14, 59)), '2026-10-24'); assert.equal(SX.kstDay(Date.UTC(2026, 9, 24, 15, 0)), '2026-10-25'); assert.equal(SX.kstDay(Date.UTC(2026, 9, 23, 15, 0)), '2026-10-24');
// 비율: 손해 (던전 상점 강철 1 ≈ 영혼석 8.3 보다 낮게), 하루 상한 영혼석이 하드 4-6 재도전 1판(356) 근처 — 대신하지 않음
assert.ok(SX.XCH.souls / SX.XCH.steel < 400 / 6 / (40 / 5)); assert.ok(SX.XCH.souls * SX.XCH.daily <= 500);
// 교환
let s = P.clean({ souls: 5, mat: { steel: 1000, crystal: 0 } }); assert.equal(s.xch, undefined); assert.equal(SX.xchLeft(s, T0), 15); assert.equal(SX.xchMax(s, T0), 15);
let r; [s, r] = P.exchangeSteel(s, 1, T0); assert.equal(r, 'ok'); assert.equal(s.mat.steel, 990); assert.equal(s.souls, 35); assert.deepEqual(s.xch, { d: '2026-10-24', n: 1 });
[s, r] = P.exchangeSteel(s, 15, T0); assert.equal(r, 'cap'); assert.equal(s.mat.steel, 990); // 남은 14회보다 많이 → 거절, 변화 없음
[s, r] = P.exchangeSteel(s, 14, T0); assert.equal(r, 'ok'); assert.equal(s.mat.steel, 850); assert.equal(s.souls, 455); assert.equal(SX.xchLeft(s, T0), 0);
[s, r] = P.exchangeSteel(s, 1, T0); assert.equal(r, 'cap'); assert.equal(s.souls, 455);
[s, r] = P.exchangeSteel(s, 0, T0); assert.equal(r, 'none'); [s, r] = P.exchangeSteel(s, 'x', T0); assert.equal(r, 'none'); [s, r] = P.exchangeSteel(s, -3, T0); assert.equal(r, 'none');
const T1 = Date.UTC(2026, 9, 24, 15, 0); assert.equal(SX.xchLeft(s, T1), 15); // KST 0시 초기화
[s, r] = P.exchangeSteel(s, 2, T1); assert.equal(r, 'ok'); assert.deepEqual(s.xch, { d: '2026-10-25', n: 2 });
let p = P.clean({ souls: 0, mat: { steel: 25, crystal: 0 } }); assert.equal(SX.xchMax(p, T0), 2); [p, r] = P.exchangeSteel(p, 3, T0); assert.equal(r, 'poor'); assert.equal(p.mat.steel, 25);
// 정리: 잘못된 값 / 상한 넘는 n / 0 → 키 없음
assert.equal(P.clean({ xch: { d: 'abc', n: 3 } }).xch, undefined); assert.equal(P.clean({ xch: { d: '2026-10-24', n: 0 } }).xch, undefined); assert.deepEqual(P.clean({ xch: { d: '2026-10-24', n: 99 } }).xch, { d: '2026-10-24', n: 15 });
assert.equal('xch' in P.clean({}), false); assert.equal('barLv' in P.clean({}), false); // 옛 세이브 모양 그대로
// 병합: 같은 날 큰 값 · 다른 날 늦은 날 (두 기기로 상한 두 배 불가)
assert.deepEqual(P.merge({ xch: { d: '2026-10-24', n: 4 } }, { xch: { d: '2026-10-24', n: 9 } }).xch, { d: '2026-10-24', n: 9 });
assert.deepEqual(P.merge({ xch: { d: '2026-10-25', n: 1 } }, { xch: { d: '2026-10-24', n: 9 } }).xch, { d: '2026-10-25', n: 1 });
assert.deepEqual(P.merge({}, { xch: { d: '2026-10-24', n: 3 } }).xch, { d: '2026-10-24', n: 3 }); assert.equal(P.merge({}, {}).xch, undefined);
// 바리케이드 보강
let b = P.clean({ mat: { steel: 39, crystal: 0 } }); assert.equal(SX.barBlock(b), '강철 부족'); [b, r] = P.buyBar(b); assert.equal(r, false);
b = P.clean({ souls: 0, mat: { steel: 5000, crystal: 0 } }); let spent = 0; for (let i = 0; i < 10; i++) { spent += SX.barCost(i); [b, r] = P.buyBar(b); assert.equal(r, true); }
assert.equal(b.barLv, 10); assert.equal(spent, 1300); assert.equal(b.mat.steel, 3700); assert.equal(b.souls, 0); [b, r] = P.buyBar(b); assert.equal(r, false); assert.equal(SX.barBlock(b), '최대');
assert.equal(SX.barMul(0), 1); assert.ok(Math.abs(SX.barMul(10) - 1.5) < 1e-9); assert.equal(P.clean({ barLv: 99 }).barLv, 10); assert.equal(P.merge({ barLv: 3 }, { barLv: 7 }).barLv, 7);
assert.ok(Math.abs(barHpAt(0, 1 * SX.barMul(4)) - 320 * 1.2) < 1e-9);
// 옵션 재설정
const it = E.makeItem('armor', undefined, 3, rng(7)); let g = P.clean({ souls: 0, mat: { steel: 100, crystal: 0 }, inv: [it] }); const old = JSON.stringify(g.inv[0].sub);
let sub; [g, r, sub] = E.reroll(g, it.id, rng(99)); assert.equal(r, 'ok'); assert.equal(g.mat.steel, 40); assert.equal(JSON.stringify(g.inv[0].sub), old); // 굴리기만으로는 적용 안 됨
assert.equal(sub.length, E.SUBN[3]); assert.ok(E.validSubs(g.inv[0], sub)); let ok; [g, ok] = E.applySubs(g, it.id, sub); assert.equal(ok, true); assert.deepEqual(g.inv[0].sub, sub);
[g, r] = E.reroll(g, it.id, rng(5)); assert.equal(r, 'poor'); assert.equal(g.mat.steel, 40);
assert.equal(E.applySubs(g, it.id, [['atk', 999], ['crit', 1]])[1], false); assert.equal(E.applySubs(g, it.id, [['hp', 10], ['atk', 10]])[1], false); // 범위 밖 · 주스탯과 같은 종류
const cm = E.makeItem('acc', undefined, 0, rng(3)); assert.equal(E.canReroll(cm), false); assert.equal(E.canReroll(E.makeUnique(Object.keys(E.UQ)[0])), false);
for (let gr = 1; gr <= 4; gr++) { const x = E.makeItem('weapon', 'archer', gr, rng(gr * 11), 2); for (let i = 0; i < 50; i++) { const sb = E.rollSubs(x, rng(i + 1)); assert.ok(E.validSubs(x, sb), JSON.stringify(sb)); } assert.equal(E.rerollCost(x).steel, E.REROLL_COST[gr]); }
console.log('steel tests ok');
