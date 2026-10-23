// 서윤 전직 수치·순수 함수 테스트: node tests/seoyun_adv.test.mjs — ftOpt(전직 → 동작 수치) · 장풍 충전 단계 · 콤보 회복 상한 · Q 직선 판정
import assert from 'node:assert/strict';
import { FT, ftOpt, jpLevel, jpMul, comboHeal, TF, DW, inLine } from '../src/data/fighter.js';
import { ADV } from '../src/data/advance.js';
let ok = 0; const t = (n, f) => { f(); ok++; console.log('OK', n); };
const T = ADV.fighter.tiger, D = ADV.fighter.dragon, F0 = JSON.stringify(FT);
t('전직 없음 = FT 기본값 그대로', () => { const o = ftOpt(null); for (const k of ['jpWeak', 'jpFull', 'jpWeakMul', 'jpFullMul', 'jpW', 'jpLen']) assert.equal(o[k], FT[k], k); assert.equal(o.slow, 0); assert.equal(o.fin, 0); assert.equal(o.leech, 0);
  for (const x of [0, .39, .4, 1.19, 1.2, 3]) { assert.equal(jpLevel(x, o), jpLevel(x)); assert.equal(jpMul(x, o), jpMul(x)); } });
t('천기권사: 완전 충전 0.8초 · 300% · 폭 ×1.2 · 둔화 20% 1초', () => { const o = ftOpt(D); assert.equal(jpLevel(.79, o), 'weak'); assert.equal(jpLevel(.8, o), 'full'); assert.equal(jpLevel(.39, o), 'none'); assert.equal(jpMul(.8, o), 3); assert.equal(jpMul(.5, o), FT.jpWeakMul);
  assert.ok(Math.abs(o.jpW - FT.jpW * 1.2) < 1e-9); assert.equal(o.slow, .2); assert.equal(o.slowT, 1); assert.equal(o.fin, 0); });
t('백호권성: 피니시 +35% · 회복 2% (상한 최대 체력 2%) · 장풍 기본값', () => { const o = ftOpt(T); assert.equal(o.fin, .35); assert.equal(o.jpFull, FT.jpFull); assert.equal(o.jpFullMul, FT.jpFullMul); assert.equal(o.slow, 0);
  assert.ok(Math.abs(comboHeal(100, 760, o) - 2) < 1e-9); assert.ok(Math.abs(comboHeal(1e6, 760, o) - 15.2) < 1e-9); assert.equal(comboHeal(0, 760, o), 0); assert.equal(comboHeal(100, 760, ftOpt(D)), 0); });
t('FT 전역 불변', () => { ftOpt(D); ftOpt(T); assert.equal(JSON.stringify(FT), F0); assert.equal(FT.jpFull, 1.2); assert.equal(FT.jpFullMul, 2.5); });
t('Q 수치: 백호난무 6×75% + 250% · 피해 -30% / 천룡파 16·폭 3·500%·기절 1초·보스 둔화', () => { assert.equal(TF.hits, 6); assert.equal(TF.hitMul, .75); assert.equal(TF.finMul, 2.5); assert.equal(TF.guard, .3); assert.ok(TF.finT < TF.dur && TF.dash <= 5);
  assert.equal(DW.len, 16); assert.equal(DW.w * 2, 3); assert.equal(DW.mul, 5); assert.equal(DW.stun, 1); assert.equal(DW.bossSlow, .25); assert.equal(DW.bossSlowT, 2);
  // Q 총 배수: 백호난무 6×0.75+2.5 = 7.0 (단일) · 천룡파 5.0 (관통) · 기본 냥냥 진각 4.0 (광역)
  assert.ok(Math.abs(TF.hits * TF.hitMul + TF.finMul - 7) < 1e-9); assert.ok(DW.mul > FT.qMul); });
t('직선 판정 inLine', () => { assert.ok(inLine(5, 0, 0, 0, 1, 0, 16, 1.5)); assert.ok(inLine(16, 1.4, 0, 0, 1, 0, 16, 1.5)); assert.ok(!inLine(16.5, 0, 0, 0, 1, 0, 16, 1.5)); assert.ok(!inLine(5, 1.6, 0, 0, 1, 0, 16, 1.5)); assert.ok(!inLine(-2, 0, 0, 0, 1, 0, 16, 1.5)); });
console.log(`seoyun adv tests OK (${ok})`);
