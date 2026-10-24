// 📦 창고 (2026-10-24, docs/STORAGE_2026-10-24.md): 옮기기·용량·확장·압축·병합(복제/분실 없음)·고유 계정당 1개·옛 세이브. node tests/storage.test.mjs
import assert from 'node:assert/strict';
import * as P from '../src/account/progress.js';
import * as E from '../src/account/equip.js';
import * as SG from '../src/account/storage.js';
import { packItem, unpackItem } from '../src/account/storpack.js';
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const r = rng(7), H = 'mage';
const mk = (g = 1, slot = 'armor') => E.makeItem(slot, H, g, r);
const ids = L => L.map(x => x.id).sort();
const uqKeys = Object.keys(E.UQ), K = uqKeys[0], K2 = uqKeys[1];
// 옛 세이브: stor 없음 → 빈 창고, storX 키 없음
let s = P.clean({ souls: 10, inv: [mk(), mk()] }); assert.deepEqual(s.stor, []); assert.equal('storX' in s, false); assert.deepEqual(P.empty().stor, []);
assert.equal(SG.storCap(s), 60); assert.equal(SG.storMax(), 100); assert.equal(SG.STOR_COST.length, SG.STOR.steps);
// 보관 / 꺼내기
s = P.clean({ inv: [mk(0), mk(2), mk(3, 'acc')] }); const [a0, a1, a2] = s.inv.map(x => x.id);
let o; [s, o] = SG.store(s, [a0, a1]); assert.deepEqual(o, { moved: 2, full: 0, eq: 0 }); assert.deepEqual(ids(s.stor), [a0, a1].sort()); assert.deepEqual(s.inv.map(x => x.id), [a2]);
[s, o] = SG.store(s, [a0, 'nope']); assert.equal(o.moved, 0); assert.equal(s.stor.length, 2); // 이미 창고 / 없는 id
[s, o] = SG.take(s, [a1]); assert.deepEqual(o, { moved: 1, full: 0 }); assert.ok(s.inv.some(x => x.id === a1)); assert.ok(!s.stor.some(x => x.id === a1));
// 장착 중은 보관 불가
s = P.clean({ inv: [mk(1, 'armor')] }); s.eq = { [H]: { armor: s.inv[0].id } }; [s, o] = SG.store(s, [s.inv[0].id]); assert.deepEqual(o, { moved: 0, full: 0, eq: 1 }); assert.equal(s.inv.length, 1);
assert.equal(SG.storable(s).length, 0);
// 정리 후 저장/불러오기 왕복 (P.clean)
s = P.clean({ inv: [mk(2), mk(4, 'acc')] }); [s] = SG.store(s, s.inv.map(x => x.id)); const back = P.clean(JSON.parse(JSON.stringify(s)));
assert.deepEqual(back.stor, s.stor); assert.equal(back.inv.length, 0);
// 용량: 60칸 가득 → full · 가방 가득 → 일반은 못 꺼냄, 고유는 꺼냄
s = P.clean({}); s.stor = Array.from({ length: 60 }, () => mk(0)); s.inv = [mk(1)]; [s, o] = SG.store(s, [s.inv[0].id]); assert.deepEqual(o, { moved: 0, full: 1, eq: 0 }); assert.equal(s.stor.length, 60);
s = P.clean({}); s.inv = Array.from({ length: E.CAP }, () => mk(0)); s.stor = [mk(1), E.makeUnique(K)]; [s, o] = SG.take(s, s.stor.map(x => x.id)); assert.deepEqual(o, { moved: 1, full: 1 });
assert.equal(s.inv.length, E.CAP + 1); assert.ok(s.inv.some(x => x.uq === K)); assert.equal(s.stor.length, 1);
// 일괄 (필터) — 등급 2만
s = P.clean({ inv: [mk(0), mk(2), mk(2, 'acc'), mk(3)] }); [s, o] = SG.storeAll(s, { slot: 'all', grade: 2 }, 'grade'); assert.equal(o.moved, 2); assert.ok(s.stor.every(x => x.g === 2)); assert.equal(s.inv.length, 2);
[s, o] = SG.takeAll(s, { slot: 'acc', grade: 'all' }, 'grade'); assert.equal(o.moved, 1); assert.equal(s.stor.length, 1);
assert.equal(SG.matches(E.makeUnique(K), { grade: 'uq' }), true); assert.equal(SG.matches(E.makeUnique(K), { grade: 4 }), false);
const srt = SG.sortItems([mk(0), mk(4), E.makeUnique(K), mk(2)], 'grade'); assert.ok(srt[0].uq); assert.equal(srt[1].g, 4); assert.equal(srt[3].g, 0);
for (const m of Object.keys(SG.SORTS)) assert.equal(SG.sortItems([mk(0), mk(3)], m).length, 2);
// 확장: 강철 또는 영혼석, 단계마다, 최대 4단계, 부족하면 그대로
s = P.clean({ souls: 100, mat: { steel: 50, crystal: 0 } }); let rr; [s, rr] = SG.expand(s, 'steel'); assert.equal(rr, 'poor'); [s, rr] = SG.expand(s, 'souls'); assert.equal(rr, 'poor'); assert.equal(SG.storCap(s), 60);
[s, rr] = SG.expand(s, 'gold'); assert.equal(rr, 'none');
s = P.clean({ souls: 99999, mat: { steel: 99999, crystal: 0 } }); [s, rr] = SG.expand(s, 'steel'); assert.equal(rr, 'ok'); assert.equal(s.mat.steel, 99999 - 120); assert.equal(SG.storCap(s), 70);
[s, rr] = SG.expand(s, 'souls'); assert.equal(rr, 'ok'); assert.equal(s.souls, 99999 - 900); [s] = SG.expand(s, 'steel'); [s] = SG.expand(s, 'steel'); assert.equal(SG.storCap(s), 100); assert.equal(SG.nextCost(s), null);
const st0 = s.mat.steel; [s, rr] = SG.expand(s, 'steel'); assert.equal(rr, 'max'); assert.equal(s.mat.steel, st0);
assert.equal(P.clean(JSON.parse(JSON.stringify(s))).storX, 4); assert.equal(P.clean({ storX: 99 }).storX, 4); assert.equal('storX' in P.clean({ storX: -2 }), false); assert.equal('storX' in P.clean({ storX: 'x' }), false);
// 압축: 왕복 같음, 장비당 ~100바이트 이하, 망가진 값은 버림
const sample = [mk(0), mk(2), mk(4, 'weapon'), E.makeUnique(K, 7, 2)]; sample[1].e = 6;
for (const it of sample) { const p = packItem(it); assert.equal(typeof p, 'string'); assert.ok(p.length < 140, p); const u = E.cleanItem(unpackItem(p), P.HEROES); assert.deepEqual(u, E.cleanItem(it, P.HEROES)); }
assert.equal(unpackItem('garbage'), null); assert.equal(unpackItem('x'.repeat(500)), null); assert.equal(unpackItem(42), null);
s = P.clean({}); s.stor = sample.map(x => ({ ...x })); const packed = SG.packSave(s); assert.ok(packed.stor.every(x => typeof x === 'string')); assert.ok(s.stor.every(x => typeof x === 'object')); // 원본 그대로
assert.deepEqual(P.clean(JSON.parse(JSON.stringify(packed))).stor, P.clean(s).stor);
const full = P.clean({}); full.stor = Array.from({ length: 100 }, (_, i) => mk(i % 5)); assert.ok(JSON.stringify(SG.packSave(full).stor).length < 100 * 120);
// 고유: 창고에 있어도 계정당 1개 (보유 판정·상자/메일 지급 중복 방지·로그)
s = P.clean({}); s.stor = [E.makeUnique(K)]; s = P.clean(s); assert.equal(E.ownsUnique(s, K), true); assert.equal(E.ownsUnique(s, K2), false);
assert.ok(s.uqLog && s.uqLog[K]); // cleanUq 가 창고 고유도 기록
const before = s.inv.length + s.stor.length; E.addChests(s, [{ ...E.chestOf(E.makeUnique(K), 'unique') }]); E.openChests(s);
assert.equal(E.allItems(s).filter(x => x.uq === K).length, 1, 'unique duplicated via chest'); assert.ok(s.inv.length + s.stor.length <= before + 1);
// 같은 고유가 가방+창고 둘 다 (망가진 세이브) → 하나만 (가방 쪽), 강화·각성 큰 값
s = P.clean({}); s.inv = [E.makeUnique(K, 3, 0)]; s.stor = [E.makeUnique(K, 1, 2)]; s = P.clean(s); assert.equal(E.allItems(s).filter(x => x.uq === K).length, 1); assert.equal(s.inv.filter(x => x.uq === K).length, 1);
// 같은 일반 id 가 가방+창고 → 가방 쪽만
s = P.clean({}); const dup = mk(2); s.inv = [dup]; s.stor = [{ ...dup }, mk(1)]; s = P.clean(s); assert.equal(s.inv.length, 1); assert.equal(s.stor.length, 1); assert.notEqual(s.stor[0].id, dup.id);
// 가방이 CAP+20 넘치면 버리지 않고 창고로
s = P.clean({}); s.inv = Array.from({ length: E.CAP + 25 }, () => mk(0)); const allIds = ids(s.inv); s = P.clean(s); assert.equal(s.inv.length, E.CAP + 20); assert.equal(s.stor.length, 5); assert.deepEqual(ids(E.allItems(s)), allIds);
// 병합: 복제·분실 없음
const base = P.clean({ inv: [mk(1), mk(2), mk(3)] }); const [i0, i1, i2] = base.inv.map(x => x.id);
let A = JSON.parse(JSON.stringify(base)), B = JSON.parse(JSON.stringify(base));
[A] = SG.store(A, [i0]); // 기기 A: i0 보관
[B] = SG.store(B, [i1]); B.inv.push(mk(4, 'acc')); const bNew = B.inv[B.inv.length - 1].id; // 기기 B: i1 보관 + 새 장비
let M = P.merge(A, P.clean(SG.packSave(B))); const all = ids(E.allItems(M));
assert.deepEqual(all, [i0, i1, i2, bNew].sort()); assert.equal(new Set(all).size, all.length);
assert.ok(M.stor.some(x => x.id === i0)); // 로컬 위치 우선
assert.ok(M.inv.some(x => x.id === i1)); // 로컬엔 가방, 클라우드엔 창고 → 이 기기 위치(가방) 우선
assert.ok(M.inv.some(x => x.id === bNew)); // 클라우드에만 있는 새 장비 → 클라우드 위치
// 꺼낸 장비 + 분해: 로컬에서 꺼냄(가방), 클라우드엔 창고 → 가방 하나만
A = JSON.parse(JSON.stringify(base)); [A] = SG.store(A, [i2]); B = JSON.parse(JSON.stringify(A)); [A] = SG.take(A, [i2]);
M = P.merge(A, B); assert.equal(E.allItems(M).filter(x => x.id === i2).length, 1); assert.ok(M.inv.some(x => x.id === i2));
// 고유: 로컬 가방(+5) · 클라우드 창고(+2, 각성 1) → 하나, 큰 값, 로컬 위치
A = P.clean({ inv: [E.makeUnique(K, 5, 0)] }); B = P.clean({ stor: [E.makeUnique(K, 2, 1)] }); M = P.merge(A, P.clean(SG.packSave(B)));
let U = E.allItems(M).filter(x => x.uq === K); assert.equal(U.length, 1); assert.equal(U[0].e, 5); assert.equal(U[0].a, 1); assert.ok(M.inv.some(x => x.uq === K));
M = P.merge(B, A); U = E.allItems(M).filter(x => x.uq === K); assert.equal(U.length, 1); assert.ok(M.stor.some(x => x.uq === K));
// 클라우드에서 장착 중인 장비를 이 기기가 보관했음 → 장착이 이기므로 가방 (잃지 않음)
B = P.clean({ inv: [mk(1, 'armor')] }); B.eq[H] = { armor: B.inv[0].id }; A = JSON.parse(JSON.stringify(B)); A.eq[H] = {}; [A] = SG.store(A, [A.inv[0].id]);
M = P.merge(A, B); assert.equal(E.allItems(M).length, 1); assert.equal(M.inv.length, 1); assert.equal(M.eq[H].armor, B.inv[0].id);
// 확장 단계 = 큰 값 · 창고 넘쳐도(병합) 잃지 않음
A = P.clean({ storX: 2 }); A.stor = Array.from({ length: 60 }, () => mk(0)); B = P.clean({ storX: 1 }); B.stor = Array.from({ length: 30 }, () => mk(0));
M = P.merge(A, B); assert.equal(M.storX, 2); assert.equal(M.stor.length, 90); assert.equal(SG.storFree(M), 0); let oo; [M, oo] = SG.store(M, []); assert.equal(oo.moved, 0);
// 같은 기기 반복 병합 = 그대로 (멱등)
M = P.merge(A, A); assert.deepEqual(ids(M.stor), ids(A.stor));
// 옛 클라이언트가 저장한 행(stor 키 없음) → 이 계정 백업으로 치유, stor 키가 있으면 서버 값 그대로
const bak = { stor: [packItem(mk(3))], storX: 1 }; const oldRow = { souls: 5, inv: [] };
let h = SG.healStor(oldRow, bak); assert.notEqual(h, oldRow); assert.equal(P.clean(h).stor.length, 1); assert.equal(P.clean(h).storX, 1);
assert.equal(SG.healStor({ ...oldRow, stor: [] }, bak).stor.length, 0); assert.equal(SG.healStor(oldRow, { stor: [] }), oldRow); assert.equal(SG.healStor(oldRow, null), oldRow); assert.equal(SG.healStor(null, bak), null);
console.log('OK storage');
