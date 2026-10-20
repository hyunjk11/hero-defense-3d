// 보상 상자 보관/개봉(한 개·10개·모두 열기) 로직 테스트: node tests/chest.test.mjs
import * as E from '../src/account/equip.js';
import * as P from '../src/account/progress.js';
import assert from 'node:assert/strict';
const R = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const withChests = (n, seed = 5, inv = 0) => { const r = R(seed), s = P.empty(); for (let i = 0; i < inv; i++) s.inv.push(E.makeItem('armor', 'mage', 0, r)); E.addChests(s, Array.from({ length: n }, (_, i) => ({ it: E.makeItem(E.SLOT_KEYS[i % 3], 'mage', i % 5, r), src: i % 4 ? 'chest' : 'boss' }))); return s; };
// 1) 판 보상 → 미개봉 상자 (가방에는 아직 없음), 개봉 시 영혼석
let [s, got, loot] = P.applyRun({ ...P.empty(), uqLog: { c_acc: 1, c_arm: 1 } }, { wave: 40, kills: 90, drops: [E.makeItem('weapon', 'mage', 4, R(9))], hero: 'mage' }, R(3));
assert.equal(s.chests.length, 9); assert.equal(s.inv.length, 0); assert.equal(loot.length, 9); assert.ok(loot.every(x => x.chest && !x.auto));
const souls0 = s.souls, expSouls = s.chests.reduce((a, c) => a + c.souls, 0); assert.ok(expSouls > 0);
let res; [s, res] = E.openChests(s); assert.equal(res.opened.length, 9); assert.equal(s.inv.length, 9); assert.equal(s.chests.length, 0); assert.equal(res.left, 0); assert.ok(!res.full);
assert.equal(res.souls, expSouls); assert.equal(s.souls, souls0 + expSouls);
// 2) 두 번째 호출(더블 클릭) → 아무것도 더 안 나옴, 영혼석 그대로
const s2 = JSON.stringify(s); [s, res] = E.openChests(s); assert.equal(res.opened.length, 0); assert.equal(res.souls, 0); assert.equal(JSON.stringify(s), s2);
assert.equal(new Set(s.inv.map(x => x.id)).size, s.inv.length, '중복 장비 없음');
// 3) 가방 용량: 35칸 찬 가방 + 상자 12개 → 5개만 열리고 7개는 보관, full 알림
s = withChests(12, 7, 35); [s, res] = E.openChests(s); assert.equal(res.opened.length, 5); assert.equal(s.inv.length, E.CAP); assert.equal(s.chests.length, 7); assert.ok(res.full); assert.equal(res.blocked, 7); assert.equal(res.left, 7);
[s, res] = E.openChests(s); assert.equal(res.opened.length, 0); assert.ok(res.full); assert.equal(s.chests.length, 7); // 가득 찬 가방: 상자 그대로
s.inv.splice(0, 3); [s, res] = E.openChests(s, 1); assert.equal(res.opened.length, 1); assert.equal(s.chests.length, 6); assert.ok(!res.full); // 한 개 열기
// 4) x10 열기 / 특정 상자 열기
s = withChests(23); [s, res] = E.openChests(s, E.BATCH); assert.equal(res.opened.length, 10); assert.equal(s.chests.length, 13);
const id = s.chests[5].id, itId = s.chests[5].it.id; [s, res] = E.openChests(s, 1, [id]); assert.equal(res.opened[0].it.id, itId); assert.ok(!s.chests.some(c => c.id === id));
[s, res] = E.openChests(s, 1, [id]); assert.equal(res.opened.length, 0); // 이미 연 상자 id → 아무것도 없음
// 5) 결정성: 같은 시드 → 같은 결과 (상자 내용은 획득 시 정해짐 — 여는 방식과 무관)
const a = withChests(15, 11), b = JSON.parse(JSON.stringify(a)), a2 = withChests(15, 11); assert.deepEqual(a2.chests.map(c => [c.it.g, c.it.n, c.it.m, c.souls]), a.chests.map(c => [c.it.g, c.it.n, c.it.m, c.souls])); const [, ra] = E.openChests(a); const ids = []; for (let i = 0; i < 15; i++) { const [, rb] = E.openChests(b, 1); ids.push(rb.opened[0].it.id); }
assert.deepEqual(ra.opened.map(x => x.it.id), ids); assert.deepEqual(a.inv, b.inv); assert.equal(a.souls, b.souls);
// 6) 등급순 정렬, 등급 집계
const sorted = [...ra.opened].sort(E.byRarity); for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].it.g >= sorted[i].it.g);
assert.deepEqual(E.gradeCount(ra.opened), [3, 3, 3, 3, 3]);
// 7) 저장 왕복 · 잘못된 값 · 이미 가방에 있는 장비의 상자 제거 · 병합 시 중복 없음
const c = withChests(4, 13); const rt = P.clean(JSON.parse(JSON.stringify(c))); assert.deepEqual(rt.chests, c.chests);
assert.deepEqual(P.clean({ chests: [null, 3, { it: { id: 'x' } }, { src: 'hack', it: c.chests[0].it, souls: 1e9 }] }).chests, [{ id: c.chests[0].id, src: 'chest', it: c.chests[0].it, souls: 100 }]);
const opened = JSON.parse(JSON.stringify(c)); E.openChests(opened, 2); // 다른 기기에서 2개 연 저장 + 아직 안 연 저장 병합 → 연 상자는 사라지고 장비는 1개씩만
const m = P.merge(opened, c); assert.equal(m.chests.length, 2); assert.equal(m.inv.length, 2); assert.equal(new Set([...m.inv.map(x => x.id), ...m.chests.map(x => x.it.id)]).size, 4);
// 8) 보관함 한도 초과분은 자동 분해(재료)
const big = P.empty(), r = R(17); const out = E.addChests(big, Array.from({ length: E.CHEST_CAP + 3 }, () => ({ it: E.makeItem('armor', 'mage', 1, r), src: 'chest' })));
assert.equal(big.chests.length, E.CHEST_CAP); assert.equal(out.filter(x => x.auto).length, 3); assert.equal(big.mat.steel, 12);
console.log('chest.test ok');
