// 장비 로직 테스트: node tests/equip.test.mjs
import * as P from '../src/account/progress.js';
import * as E from '../src/account/equip.js';
import assert from 'node:assert/strict';
let seed = 1; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// 생성
for (let g = 0; g < 5; g++) for (const s of E.SLOT_KEYS) { const it = E.makeItem(s, 'archer', g, r); assert.equal(it.g, g); assert.equal(it.sub.length, E.SUBN[g]); assert.ok(it.n.length > 0); if (s === 'weapon') { assert.equal(it.h, 'archer'); assert.equal(it.m[0], 'atk'); } }
// 보상 상자: 웨이브 4 → 0개, 12 → 2개
assert.equal(E.chestsFor(4, 'mage', r).length, 0); assert.equal(E.chestsFor(12, 'mage', r).length, 2);
let [s, got, loot] = P.applyRun(P.empty(), { wave: 10, kills: 30, drops: [E.makeItem('weapon', 'mage', 3, r)], hero: 'mage' }, r);
assert.equal(got, 90); assert.equal(loot.length, 3); assert.equal(s.inv.length, 3); assert.equal(loot.filter(x => x.src === 'boss').length, 1);
// 등급 확률: 오래 버틸수록 좋은 등급
const avg = t => { let a = 0; for (let i = 0; i < 4000; i++) a += E.rollGrade(E.chestOdds(t), r); return a / 4000; }; assert.ok(avg(6) > avg(1) + .8, 'odds scale');
assert.ok(E.bossOdds(5)[0] === 0);
// 장착 → 보너스
const w = E.makeItem('weapon', 'mage', 4, r); s.inv.push(w); let ok; [s, ok] = E.equip(s, 'mage', w.id); assert.ok(ok); assert.ok(E.bonus(s, 'mage').atk >= 25);
[s, ok] = E.equip(s, 'archer', w.id); assert.equal(ok, false, '다른 영웅 무기 장착 불가');
// 강화
s.souls = 100000; s.mat.steel = 1000; s.mat.crystal = 100; let res; const before = E.mainVal(w);
let tries = 0; while (w.e < 10 && tries++ < 300) [s, res] = E.enhance(s, w.id, r); assert.equal(w.e, 10); assert.ok(E.mainVal(w) > before * 1.9);
[s, res] = E.enhance(s, w.id, r); assert.equal(res, 'max');
s.souls = 0; const a2 = E.makeItem('armor', 'mage', 0, r); s.inv.push(a2); [s, res] = E.enhance(s, a2.id, r); assert.equal(res, 'poor'); assert.equal(a2.e, 0);
// 실패해도 파괴 없음
seed = 5; s.souls = 1e6; const a3 = E.makeItem('acc', 'mage', 1, r); a3.e = 9; s.inv.push(a3); const n0 = s.inv.length; for (let i = 0; i < 20 && a3.e < 10; i++) [s, res] = E.enhance(s, a3.id, () => .99); assert.equal(a3.e, 9); assert.equal(s.inv.length, n0);
// 분해 (장착품 제외)
const st0 = s.mat.steel; let gy, n; [s, gy, n] = E.dismantle(s, [a2.id, w.id]); assert.equal(n, 1); assert.equal(gy.steel, 2); assert.equal(s.mat.steel, st0 + 2); assert.ok(s.inv.some(x => x.id === w.id));
// 제작
s.souls = 1000; s.mat.steel = 200; s.mat.crystal = 20; let it; [s, res, it] = E.craft(s, 'master', 'weapon', 'mage', r); assert.equal(res, 'ok'); assert.ok(it.g >= 2); assert.equal(it.h, 'mage');
// 가방 가득 → 자동 분해
const full = P.empty(); for (let i = 0; i < E.CAP; i++) full.inv.push(E.makeItem('armor', 'mage', 0, r)); const ad = E.addItems(full, [E.makeItem('armor', 'mage', 2, r)]); assert.ok(ad[0].auto); assert.equal(full.inv.length, E.CAP); assert.equal(full.mat.steel, 8);
[, res] = E.craft(full, 'basic', 'armor', 'mage', r); assert.equal(res, 'full');
// 저장 왕복 + 구버전 호환 + 병합
const rt = P.clean(JSON.parse(JSON.stringify(s))); assert.deepEqual(rt.inv, s.inv); assert.equal(rt.eq.mage.weapon, w.id); assert.deepEqual(rt.mat, s.mat);
const old = P.clean({ souls: 5, heroLv: { mage: { hp: 2 } } }); assert.deepEqual(old.inv, []); assert.deepEqual(old.mat, { steel: 0, crystal: 0 }); assert.equal(old.heroLv.mage.hp, 2);
const bad = P.clean({ inv: [{ id: 'x', s: 'weapon', g: 9, m: ['atk', 5] }, { id: 'y', s: 'armor', g: 1, m: ['evil', 5] }, null, { id: 'z', s: 'acc', g: 2, m: ['crit', 6], sub: [['spd', 3]] }], eq: { mage: { acc: 'z', weapon: 'nope' } } });
assert.equal(bad.inv.length, 1); assert.equal(bad.eq.mage.acc, 'z'); assert.equal(bad.eq.mage.weapon, undefined);
const shared = E.makeItem('armor', 'mage', 1, r), la = E.makeItem('acc', 'mage', 2, r), cb = E.makeItem('armor', 'mage', 3, r);
const mg = P.merge({ inv: [shared, la], eq: { mage: { acc: la.id } }, mat: { steel: 5, crystal: 1 } }, { inv: [shared, cb], eq: { mage: { armor: cb.id } }, mat: { steel: 3, crystal: 4 } });
assert.equal(mg.inv.length, 3); assert.equal(mg.eq.mage.acc, la.id); assert.equal(mg.eq.mage.armor, cb.id); assert.deepEqual(mg.mat, { steel: 5, crystal: 4 });
assert.ok(JSON.stringify(rt).length < 12000, 'save size');
// 총사(로즈) 쌍권총: SQL로 넣은 전설 무기 · 별칭 h 정규화 · 제작/드롭/분해
{ const gs = P.clean({ hero: 'gunner', inv: [{ id: 'gun4', s: 'weapon', h: 'gunner', g: 4, n: '심홍의 쌍권총 블러디로즈', m: ['atk', 25], sub: [['crit', 8], ['spd', 9]], e: 0, u: 'rosebarrage' }, { id: 'gunA', s: 'weapon', h: 'Pistol', g: 1, n: '은탄 쌍권총', m: ['atk', 9], sub: [], e: 0 }], eq: { gunner: { weapon: 'gun4' } } });
  assert.equal(gs.inv.length, 2); assert.equal(gs.inv[0].h, 'gunner'); assert.equal(gs.inv[0].u, 'rosebarrage'); assert.equal(gs.inv[1].h, 'gunner'); assert.equal(gs.eq.gunner.weapon, 'gun4'); assert.equal(E.legendOf(gs, 'gunner'), 'rosebarrage');
  for (let g = 0; g < 5; g++) { const it = E.makeItem('weapon', 'gunner', g, r); assert.equal(it.h, 'gunner'); assert.ok(/쌍권총/.test(it.n)); if (g === 4) assert.ok(['ricochet', 'rosebarrage'].includes(it.u)); }
  gs.souls = 1e4; gs.mat = { steel: 500, crystal: 50 }; let gr, gi; [, gr, gi] = E.craft(gs, 'master', 'weapon', 'gunner', r); assert.equal(gr, 'ok'); assert.equal(gi.h, 'gunner');
  const ch = E.chestsFor(20, 'gunner', r); assert.equal(ch.length, 4); ch.filter(x => x.s === 'weapon').forEach(x => assert.equal(x.h, 'gunner'));
  assert.deepEqual(E.dismantleYield(gs.inv[0]), { steel: 20, crystal: 8 }); }
console.log('equip tests OK');
