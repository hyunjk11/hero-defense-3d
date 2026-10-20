// 전설 무기 고유 스킬 로직 테스트: node tests/legend.test.mjs
import * as P from '../src/account/progress.js';
import * as E from '../src/account/equip.js';
import assert from 'node:assert/strict';
let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// 풀 구성: 영웅마다 proc 1개 이상 + active 1개 이상, 스킬의 영웅 일치
for (const [h, pool] of Object.entries(E.LPOOL)) { assert.ok(pool.length >= 2); assert.ok(pool.some(k => E.LSK[k].type === 'proc')); assert.ok(pool.some(k => E.LSK[k].type === 'active')); for (const k of pool) assert.equal(E.LSK[k].h, h); }
// 전설 무기만 스킬 보유, 영웅 풀에서
const seen = {};
for (const h of Object.keys(E.LPOOL)) for (let i = 0; i < 60; i++) { const w = E.makeItem('weapon', h, 4, r); assert.ok(E.LPOOL[h].includes(w.u), 'legend has skill'); seen[w.u] = 1; }
assert.equal(Object.keys(seen).length, Object.keys(E.LSK).filter(k => !E.LSK[k].uq).length, '모든 (일반 전설) 스킬이 나옴'); assert.ok(!Object.keys(seen).some(k => E.LSK[k].uq), '고유 전용 스킬은 일반 전설에 안 나옴');
// 고유 무기 → 고정 [E] 스킬 (data/items.js UQ.sk), 장착하면 legendOf 가 그 키
{ const map = { f_bow: 'rootshot', s_staff: 'zeroabs', v_sword: 'eruption', r_guns: 'execution' }; for (const [k, sk] of Object.entries(map)) { const it = E.makeUnique(k); assert.equal(E.legendKey(it), sk); assert.equal(E.legendKey({ ...it, u: 'pierce' }), sk); let t = P.empty(); t.inv.push(it); [t] = E.equip(t, it.h, it.id); assert.equal(E.legendOf(t, it.h), sk); assert.deepEqual(E.uniquesOf(t, it.h), { weapon: { k, a: 0 } }); } }
for (let g = 0; g < 4; g++) { const w = E.makeItem('weapon', 'mage', g, r); assert.equal(w.u, undefined); assert.equal(E.legendKey(w), null); }
assert.equal(E.makeItem('armor', 'mage', 4, r).u, undefined);
// 난수 소비가 바뀌지 않음 (기존 시드 결과 동일): 서브스탯 수가 같은 영웅(g3) 무기와 호출 횟수 동일
{ let n = 0; const rc = () => (n++, r()); E.makeItem('weapon', 'archer', 4, rc); const n4 = n; n = 0; E.makeItem('weapon', 'archer', 3, rc); assert.equal(n4, n); }
// 구 세이브: u 없는 전설 무기 → id에서 결정적 배정, 같은 id면 항상 같은 스킬
const old = { id: 'legacy01', s: 'weapon', h: 'warrior', g: 4, n: '성검 엑스칼리온', m: ['atk', 25], sub: [['crit', 10]], e: 3 };
const c1 = E.cleanItem(old, ['archer', 'mage', 'warrior']), c2 = E.cleanItem({ ...old }, ['archer', 'mage', 'warrior']);
assert.ok(E.LPOOL.warrior.includes(c1.u)); assert.equal(c1.u, c2.u);
// 잘못된/다른 영웅 스킬은 교정, 비전설의 u는 제거
assert.ok(E.LPOOL.warrior.includes(E.cleanItem({ ...old, u: 'pierce' }, ['warrior']).u));
assert.equal(E.cleanItem({ ...old, u: 'quake' }, ['warrior']).u, 'quake'); assert.equal(E.cleanItem({ ...old, u: 'boomerang' }, ['warrior']).u, 'boomerang');
assert.equal(E.cleanItem({ ...old, g: 3, u: 'quake' }, ['warrior']).u, undefined);
// 강화해도 유지
let s = P.empty(); const w = E.makeItem('weapon', 'mage', 4, r); const u0 = w.u; s.inv.push(w); s.souls = 1e6; s.mat.steel = 1e4; s.mat.crystal = 1e3;
for (let i = 0; i < 40 && w.e < 10; i++) [s] = E.enhance(s, w.id, r); assert.equal(w.e, 10); assert.equal(w.u, u0);
// 장착 → legendOf, 저장 왕복 (직렬화 → clean)
assert.equal(E.legendOf(s, 'mage'), null); [s] = E.equip(s, 'mage', w.id); assert.equal(E.legendOf(s, 'mage'), u0); assert.equal(E.legendOf(s, 'archer'), null);
const back = P.clean ? P.clean(JSON.parse(JSON.stringify(s))) : null; if (back) { assert.equal(back.inv.find(x => x.id === w.id).u, u0); assert.equal(E.legendOf(back, 'mage'), u0); }
const e2 = E.cleanEquip(JSON.parse(JSON.stringify(s)), {}, ['archer', 'mage', 'warrior']); assert.equal(E.legendOf(e2, 'mage'), u0);
console.log('legend tests OK');
