// 능력치 패널 수식 · 피해 미터 테스트: node tests/stats.test.mjs
import * as S from '../src/data/herostats.js';
import * as Mt from '../src/combat/meter.js';
import { CLASSES, VISIBLE_HEROES } from '../src/data/heroes.js';
import { ADV } from '../src/data/advance.js';
import { blessMods } from '../src/data/dungeon.js';
import assert from 'node:assert/strict';
const near = (a, b, e = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} != ${b}`);
let n = 0; const ok = () => n++;

// 1) 기본 영웅 (마을 밖 · 장비 없음) = CLASSES 값 그대로, DPS = 공격력 × 공속
for (const h of VISIBLE_HEROES) { const C = S.sortieC(h, {}), F = S.finalStats(C, null, { cls: h });
  assert.equal(C, CLASSES[h]); near(F.dmg, CLASSES[h].dmg); near(F.rate, CLASSES[h].rate); near(F.range, CLASSES[h].range); assert.equal(F.crit, 0); near(F.critX, 1.5); near(F.dps, CLASSES[h].dmg * CLASSES[h].rate, 1e-9, h);
  near(F.cd, CLASSES[h].cd); near(F.cdRed, 0); near(F.taken, 1 - CLASSES[h].armor); near(F.ehp, CLASSES[h].hp / (1 - CLASSES[h].armor)); ok(); }
// 2) 출정 C = spawnHero 순서 (여신탑 → 전직 → 장비)
{ const perm = { hp: 3, atk: 4 }, eq = { atk: 20, hp: 10, spd: 12, rng: 6, crit: 9, critD: 30, skill: 16, cdr: 50 }, A = ADV.archer.hawk;
  const C = S.sortieC('archer', { perm, adv: A, eq }), B = CLASSES.archer;
  assert.equal(C.hp, Math.round(Math.round(Math.round(B.hp * 1.18) * 1) * 1.1)); near(C.dmg, B.dmg * 1.2 * 1.7 * 1.2); near(C.rate, B.rate * .65 * 1.12); near(C.range, B.range * 1.3 * 1.06); assert.equal(C.adv, A);
  const F = S.finalStats(C, eq, { cls: 'archer' }); near(F.crit, 9); near(F.critX, 1.8); near(F.skillMul, 1.16); near(F.cd, B.cd * .6, 1e-9, 'cdr cap 40'); near(F.cdRed, .4);
  near(F.dps, C.dmg * C.rate * (1 + .09 * .8)); ok();
  // 전직은 그 영웅의 분기만 · perm 없으면 장비·전직 무시 (마을 밖)
  assert.equal(S.sortieC('mage', { perm, adv: A, eq }).adv, undefined); assert.equal(S.sortieC('archer', { adv: A, eq }), B); ok(); }
// 3) 판 안 배수: 강화 · 고유 버프 · 광전사 · 던전 축복 · 로봇
{ const C = CLASSES.gunner, M = blessMods({ haste: 2, might: 1, crit: 1, ranged: 1 }, 'ranged'), m = { cls: 'gunner', ups: { atk: 2, spd: 3, rng: 1, skill: 2 }, uqAtk: 1.06, uqRate: 1.3, advLow: 1, M };
  const F = S.finalStats(C, { crit: 5, critD: 10, cdr: 10 }, m);
  near(F.dmg, C.dmg * 1.3 * 1.06 * M.dmg); near(F.rate, C.rate * 1.3 * 1.3 * M.rate); near(F.range, C.range * 1.08 * M.range); near(F.crit, 5 + 12); near(F.critX, 1.5 + .35); near(F.skillMul, 1.5);
  near(F.cd, C.cd * .92 * .92 * .9 * M.cd); near(F.dps, F.dmg * F.rate * (1 + .17 * (F.critX - 1))); ok();
  const R = S.finalStats(CLASSES.mechanic, null, { robo: true }); near(R.range, CLASSES.mechanic.range * 1.45); ok();
  const T = S.finalStats(CLASSES.warrior, null, { M: blessMods({ tank: 1 }, 'tank') }); near(T.taken, .6 * .75); ok(); }
// 4) 장미 저격수 치명 +15% (전직 atk.crit) · 치명 확률 100% 초과는 기대값에서 100% 로
{ const C = S.sortieC('gunner', { perm: { hp: 0, atk: 0 }, adv: ADV.gunner.thorn, eq: { crit: 95 } }), F = S.finalStats(C, { crit: 95 }, { cls: 'gunner' });
  near(F.crit, 110); near(S.critMul(F.crit, F.critX), 1.5); near(F.dps, C.dmg * C.rate * 1.5); ok(); }
// 5) 전투력: 단조 증가 (장비가 좋아지면 오름) · 정수
{ const a = S.heroCP('mage', S.finalStats(CLASSES.mage, null, { cls: 'mage' })), C2 = S.sortieC('mage', { perm: { hp: 2, atk: 2 }, eq: { atk: 10 } }), b = S.heroCP('mage', S.finalStats(C2, { atk: 10 }, { cls: 'mage' }));
  assert.ok(Number.isInteger(a) && b > a, `${a} ${b}`); near(a, Math.round(34 * .95 * 10 + 330 / 4 + 100)); ok(); }
// 6) 내역 행: 9개 (공격력·공속·치명·치명 피해·사거리·체력·피해 감소·스킬 피해·재사용) · 출처 표시
{ const B = S.breakdown('warrior', { perm: { hp: 2, atk: 3 }, adv: ADV.warrior.berserk, eq: { atk: 12, crit: 6 } }, { ups: { atk: 1 } });
  assert.deepEqual(B.rows.map(r => r.k), ['dmg', 'rate', 'crit', 'critX', 'range', 'hp', 'taken', 'skill', 'cd']);
  const d = B.rows[0].parts.map(p => p[0]); assert.deepEqual(d, ['기본', '여신탑 공격 Lv.3', '전직 광전사', '장비', '영웅 강화 Lv.1']);
  assert.equal(B.rows[6].v, '25%'); assert.ok(B.rows[6].parts.some(p => p[0] === '전직 광전사')); near(B.F.dmg, 50 * 1.15 * .8 * 1.12 * 1.15); assert.equal(B.cp, S.heroCP('warrior', B.F)); ok(); }
// 7) 효과 텍스트: 전설 · 고유 무기(각성 쿨) · 고유 방어구/장신구
{ const e = S.effectsOf('catpaw', { weapon: { k: 'd_fist', a: 3 }, acc: { k: 'c_ring', a: 0 } }, 10);
  assert.equal(e.length, 2); assert.ok(e[0].n.includes('묘신 너클 호랑냥이') && e[0].n.includes('묘신 냥발 장풍')); assert.equal(e[0].aw, 3); assert.ok(e[0].a3);
  assert.equal(e[0].tag, `[E] 재사용 ${Math.round(11 * Math.pow(.96, 3) * .9 * 10) / 10}초`); assert.ok(e[1].n.includes('우로보로스') && e[1].tag === '고유 자동');
  const l = S.effectsOf('multishot', {}); assert.equal(l[0].kind, 'legend'); assert.equal(l[0].tag, '공격 시 25% 발동'); assert.equal(S.effectsOf(null, {}).length, 0); ok(); }

// ---------- 피해 미터 ----------
{ const m = Mt.newMeter(0); Mt.meterAdd(m, 100, .1, false, false); Mt.meterAdd(m, 50, 1.2, true, true); Mt.meterAdd(m, 0, 1.3, false, true);
  assert.equal(m.tot, 150); assert.equal(m.sk, 50); assert.equal(m.max, 100); assert.equal(m.kills, 2); assert.equal(m.hits, 2); near(Mt.skillShare(m), 1 / 3);
  near(Mt.meterDps(m, 2), 150 / 2, 1e-9, '판 시작 2초'); ok();
  // 일정한 100 DPS (0.05초마다 5) → 5초 창 ≈ 100
  const k = Mt.newMeter(0); for (let t = 0; t < 30; t += .05) Mt.meterAdd(k, 5, t, false, false); near(Mt.meterDps(k, 30), 100, 3, 'steady'); ok();
  // 6초 쉬면 0 · 오래된 칸은 지워짐
  near(Mt.meterDps(k, 36.01), 0); Mt.meterAdd(k, 40, 36.2, false, false); near(Mt.meterDps(k, 36.4), 40 / (4.5 + .4)); ok();
  // 시간이 거꾸로 (새 판) → 창 비움, 누적은 유지
  Mt.meterAdd(k, 10, 1, false, false); near(Mt.meterDps(k, 1.2), 10 / 1.2, 1e-9, 'reset'); assert.ok(k.tot > 3000); ok();
  // 할당 없음: 같은 버퍼 재사용
  const buf = k.b; for (let i = 0; i < 1000; i++) Mt.meterAdd(k, 1, 40 + i * .01, i & 1, false); assert.equal(k.b, buf); assert.equal(k.b.length, Mt.NB); ok();
  Mt.resetMeter(k, 5); assert.equal(k.tot + k.max + k.kills + k.sk, 0); near(Mt.meterDps(k, 6), 0); ok(); }
console.log(`stats.test OK (${n} groups)`);
