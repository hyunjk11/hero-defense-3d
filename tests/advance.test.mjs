// 전직 데이터·해금·스탯 테스트: node tests/advance.test.mjs
import * as A from '../src/data/advance.js';
import { CLASSES, VISIBLE_HEROES, HERO_KEYS, isHidden } from '../src/data/heroes.js';
import assert from 'node:assert/strict';
// 보이는 영웅은 모두 분기 2개 (칭호·아이콘·설명·Q 스킬·타워 보너스), 숨긴 영웅(버들)은 예약만
for (const h of VISIBLE_HEROES) { const bs = A.branchesOf(h); assert.equal(bs.length, 2, h); assert.ok(A.ADV_HEROES.includes(h));
  for (const b of bs) { const X = A.ADV[h][b]; assert.ok(X.n && X.icon && X.d && X.skill && X.sk && X.td && Number.isInteger(X.col) && /^#/.test(X.c), h + b); assert.ok(!X.reserved); assert.equal(X.h, h); assert.equal(X.k, b); } }
for (const h of HERO_KEYS.filter(isHidden)) { assert.ok(!A.ADV_HEROES.includes(h)); assert.equal(A.advOf(h, { b: A.branchesOf(h)[0] }), null); assert.equal(A.branchesOf(h).length, 2); assert.ok(A.branchesOf(h).every(b => A.ADV[h][b].reserved)); }
// applyAdv: 배수 (기본 → 전직), 원본 불변, 없으면 같은 객체
const C = CLASSES.archer; assert.equal(A.applyAdv(C, null), C);
const w = A.applyAdv(C, A.ADV.archer.wind), k = A.applyAdv(C, A.ADV.archer.hawk);
assert.ok(Math.abs(w.rate - 2.5) < 1e-9 && Math.abs(w.dmg - 24 * .9) < 1e-9 && w.range === 11 && w.skill === '폭풍 화살비' && w.title === '바람의 순찰자' && w.adv === A.ADV.archer.wind);
assert.ok(Math.abs(k.range - 11 * 1.3) < 1e-9 && Math.abs(k.dmg - 24 * 1.7) < 1e-9 && Math.abs(k.rate - 1.3) < 1e-9 && k.skill === '일섬 저격'); assert.equal(C.rate, 2.0); assert.equal(C.skill, '화살비');
const pal = A.applyAdv(CLASSES.warrior, A.ADV.warrior.paladin), ber = A.applyAdv(CLASSES.warrior, A.ADV.warrior.berserk);
assert.equal(pal.hp, 1250); assert.equal(pal.armor, .55); assert.equal(ber.armor, .25); assert.ok(Math.abs(ber.rate - 1.3 * 1.3) < 1e-9);
assert.equal(A.applyAdv(CLASSES.mage, A.ADV.mage.flame).aoe, 3); assert.equal(A.applyAdv(CLASSES.mage, A.ADV.mage.frost).aoe, 2);
const th = A.applyAdv(CLASSES.gunner, A.ADV.gunner.thorn); assert.ok(Math.abs(th.dmg - 26) < 1e-9 && Math.abs(th.range - 8.5 * 1.1) < 1e-9);
// 밸런스: 두 분기 기본 DPS 차이 10% 이내, 기본 대비 -10%~+25%
for (const h of A.ADV_HEROES) { const [a, b] = A.branchesOf(h).map(x => A.advDps(h, x)), base = A.advDps(h);
  assert.ok(Math.abs(a - b) / Math.max(a, b) <= .10, `${h} ${a} ${b}`); for (const v of [a, b]) assert.ok(v >= base * .9 && v <= base * 1.25, `${h} ${v} vs ${base}`); }
// 타워 보너스: 없으면 1/0, 있으면 해당 종류만
assert.deepEqual(A.advTowerMods(null, 'arrow'), { dmg: 1, rate: 1, rng: 1, splash: 1, slowAdd: 0, br: {} });
assert.equal(A.advTowerMods(A.ADV.archer.wind, 'arrow').rate, 1.06); assert.equal(A.advTowerMods(A.ADV.archer.wind, 'arrow').br.multi.targets, 1); assert.equal(A.advTowerMods(A.ADV.archer.wind, 'cannon').rate, 1);
assert.equal(A.advTowerMods(A.ADV.mage.frost, 'magic').slowAdd, .1); assert.equal(A.advBarMul(A.ADV.warrior.paladin), 1.15); assert.equal(A.advBarMul(null), 1);
// 해금 조건: 사유 순서 = 소유 → 챕터 → 숙련 → 시련 → 재료(영혼석 → 마력석 → 정수)
const s = { st: {}, heroLv: { archer: { hp: 0, atk: 0 } }, hq: {}, souls: 0, mat: { steel: 0, crystal: 0 }, adv: {} };
assert.equal(A.advBlock(s, 'mechanic'), '전직할 수 없는 영웅'); assert.equal(A.advBlock(s, 'gunner', 'duel', false), '영웅 미보유'); assert.equal(A.advBlock(s, 'archer', 'nope'), '알 수 없는 분기');
assert.match(A.advBlock(s, 'archer', 'wind'), /2장 보스/); s.st = { '2-4': 1 };
assert.match(A.advBlock(s, 'archer', 'wind'), /영구 강화 합 10 \(0\/10\)/); s.heroLv.archer = { hp: 4, atk: 6 };
assert.match(A.advBlock(s, 'archer', 'wind'), /시련/); s.hq = { warrior: { boss: 3 } }; assert.match(A.advBlock(s, 'archer', 'wind'), /시련/); s.hq.archer = { boss: 1, clr: 1 };
assert.equal(A.advBlock(s, 'archer', 'wind'), '영혼석 부족'); s.souls = 1500; assert.equal(A.advBlock(s, 'archer', 'wind'), '마력석 부족'); s.mat.crystal = 20;
assert.equal(A.advBlock(s, 'archer', 'wind'), '고유 정수 부족'); s.mat.essence = 3; assert.equal(A.advBlock(s, 'archer', 'wind'), null); assert.ok(A.advChecks(s, 'archer').every(x => x.ok));
// 재전직: 이미 전직 → 같은 분기 불가, 다른 분기는 영혼석 500
s.adv = { archer: { b: 'wind', n: 1 } }; s.souls = 499; assert.equal(A.advBlock(s, 'archer', 'wind'), '현재 분기'); assert.equal(A.advBlock(s, 'archer', 'hawk'), '영혼석 부족'); s.souls = 500; assert.equal(A.advBlock(s, 'archer', 'hawk'), null);
// 상한: 전직하면 15
assert.equal(A.permMax(s, 'archer'), 15); assert.equal(A.permMax(s, 'mage'), 10); assert.equal(A.advTitle('archer', s.adv.archer), '실바 · 바람의 순찰자'); assert.equal(A.advTitle('mage', undefined), '');
console.log('advance tests OK');
