// 영웅 능력치 계산 (순수 함수 — DOM·three·G 없음 → tests/stats.test.mjs). 마을 능력치 패널 + 전투 능력치 오버레이 (src/ui/stats.js) 가 씀
// 수식은 heroes/hero.js 와 같은 순서 (바꾸면 둘 다): spawnHero = 기본 → 여신탑(영구 강화) → 전직 → 장비,  stat.* = × 판 안 강화(G.ups) × 고유 버프 × 광전사 × 던전 축복(G.dgM)
import { CLASSES } from './heroes.js';
import { applyAdv } from './advance.js';
import { UQ, awakeMul, awakeCd } from './items.js';
import { LSK } from '../account/equip.js';

export const NOM = Object.freeze({ rate: 1, dmg: 1, crit: 0, critD: 0, range: 1, cd: 1, taken: 1 }); // hero.js NOM 과 같음 (던전 밖)
export const CRIT_BASE = 1.5, CDR_CAP = 40, ROBO_RANGE = 1.45;
const r1 = v => Math.round(v * 10) / 10, pc = v => `${v >= 0 ? '+' : ''}${r1(v)}%`, xm = v => `×${Math.round(v * 1000) / 1000}`;

// 출정 영웅 C (spawnHero 와 같은 계산). L = { perm: {hp,atk}|null, adv: ADV 분기|null, eq: E.bonus 결과|null } — perm 없으면(마을 밖 영웅 선택) 기본값 그대로
export function sortieC(cls, L = {}) {
  let C = CLASSES[cls]; if (!C) return null; const { perm, adv, eq } = L;
  if (perm) C = { ...C, hp: Math.round(C.hp * (1 + .06 * (perm.hp || 0))), dmg: C.dmg * (1 + .05 * (perm.atk || 0)) };
  if (perm && adv && adv.h === cls) C = applyAdv(C, adv);
  const q = perm && eq ? eq : null; if (q) C = { ...C, hp: Math.round(C.hp * (1 + (q.hp || 0) / 100)), dmg: C.dmg * (1 + (q.atk || 0) / 100), rate: C.rate * (1 + (q.spd || 0) / 100), range: C.range * (1 + (q.rng || 0) / 100) };
  return C;
}
// 기대 피해 배율 (치명 확률 % · 치명 배율)
export const critMul = (crit, critX) => 1 + Math.min(100, Math.max(0, crit)) / 100 * (critX - 1);
export const expectedDps = (dmg, rate, crit, critX) => dmg * rate * critMul(crit, critX);
// 최종 능력치. C = 출정 C (hero.C), eq = 장비 보너스 (hero.eq), m = 판 안 배수 { ups, uqAtk, uqRate, advLow, M, robo, advCrit }
export function finalStats(C, eq, m = {}) {
  const u = m.ups || {}, M = m.M || NOM, q = eq || {}, advCrit = m.advCrit !== undefined ? m.advCrit : ((C.adv && C.adv.atk && C.adv.atk.crit) || 0);
  const dmg = C.dmg * (1 + .15 * (u.atk || 0)) * (m.uqAtk || 1) * (m.advLow || 1) * M.dmg;
  const rate = C.rate * (1 + .1 * (u.spd || 0)) * (m.uqRate || 1) * M.rate;
  const range = C.range * (1 + .08 * (u.rng || 0)) * (m.robo ? ROBO_RANGE : 1) * M.range;
  const crit = (q.crit || 0) + advCrit + M.crit, critX = CRIT_BASE + ((q.critD || 0) + M.critD) / 100;
  const skillMul = (1 + .25 * (u.skill || 0)) * (1 + (q.skill || 0) / 100), cdr = Math.min(CDR_CAP, q.cdr || 0);
  const cd = C.cd * Math.pow(.92, u.skill || 0) * (1 - cdr / 100) * M.cd, taken = (1 - (C.armor || 0)) * M.taken;
  const dps = expectedDps(dmg, rate, crit, critX), hp = m.max || C.hp, ehp = hp / Math.max(.05, taken);
  return { hp, armor: C.armor || 0, taken, dmg, rate, range, crit, critX, skillMul, cd, cdRed: 1 - cd / (CLASSES[m.cls] || C).cd, dps, ehp };
}
// 영웅 전투력 (아이템 전투력 E.power 와 별개): 공격(예상 DPS) + 생존(실효 체력) + 스킬(위력 × 쿨 단축)
export function heroCP(cls, F) { const base = (CLASSES[cls] || {}).cd || F.cd; return Math.round(F.dps * 10 + F.ehp / 4 + F.skillMul * (base / F.cd) * 100); }
export const CP_TXT = '전투력 = 예상 DPS × 10 + 실효 체력 ÷ 4 + 스킬 위력 × (기본 재사용 ÷ 현재 재사용) × 100';

// 내역 (표시용 행): 각 능력치의 출처별 기여. L = { perm, adv, eq } (마을 출정과 같은 값) · m = 판 안 배수 (마을에서는 {})
export function breakdown(cls, L = {}, m = {}) {
  const C0 = CLASSES[cls], C = sortieC(cls, L), F = finalStats(C, L.perm ? L.eq : null, { ...m, cls }), p = L.perm || {}, A = L.perm && L.adv && L.adv.h === cls ? L.adv : null, am = (A && A.mod) || {}, q = (L.perm && L.eq) || {}, u = m.ups || {}, M = m.M || NOM;
  const add = (arr, ok, src, v) => { if (ok) arr.push([src, v]); return arr; };
  const rows = [
    { k: 'dmg', n: '공격력', v: r1(F.dmg), parts: add(add(add(add(add(add(add([['기본', r1(C0.dmg)]], p.atk, `여신탑 공격 Lv.${p.atk}`, pc(5 * p.atk)), am.dmg && am.dmg !== 1, `전직 ${A && A.n}`, xm(am.dmg)), q.atk, '장비', pc(q.atk)), u.atk, `영웅 강화 Lv.${u.atk}`, pc(15 * u.atk)), m.uqAtk && m.uqAtk !== 1, '심연 적응', pc((m.uqAtk - 1) * 100)), m.advLow && m.advLow !== 1, '광전사 분노', pc((m.advLow - 1) * 100)), M.dmg !== 1, '던전 축복', pc((M.dmg - 1) * 100)) },
    { k: 'rate', n: '공격 속도', v: `${Math.round(F.rate * 100) / 100}회/초`, parts: add(add(add(add(add([['기본', `${C0.rate}회/초`]], am.rate && am.rate !== 1, `전직 ${A && A.n}`, xm(am.rate)), q.spd, '장비', pc(q.spd)), u.spd, `영웅 강화 Lv.${u.spd}`, pc(10 * u.spd)), m.uqRate && m.uqRate !== 1, '요정의 춤', pc((m.uqRate - 1) * 100)), M.rate !== 1, '던전 축복', pc((M.rate - 1) * 100)) },
    { k: 'crit', n: '치명타 확률', v: `${r1(Math.min(100, F.crit))}%`, parts: add(add(add([['기본', '0%']], q.crit, '장비', pc(q.crit)), A && A.atk && A.atk.crit, `전직 ${A && A.n}`, pc((A && A.atk && A.atk.crit) || 0)), M.crit, '던전 축복', pc(M.crit)) },
    { k: 'critX', n: '치명타 피해', v: `${Math.round(F.critX * 100)}%`, parts: add(add([['기본', `${CRIT_BASE * 100}%`]], q.critD, '장비', pc(q.critD)), M.critD, '던전 축복', pc(M.critD)) },
    { k: 'range', n: '사거리', v: r1(F.range), parts: add(add(add(add(add([['기본', C0.range]], am.range && am.range !== 1, `전직 ${A && A.n}`, xm(am.range)), q.rng, '장비', pc(q.rng)), u.rng, `영웅 강화 Lv.${u.rng}`, pc(8 * u.rng)), m.robo, '변신 로봇', pc((ROBO_RANGE - 1) * 100)), M.range !== 1, '던전 축복', pc((M.range - 1) * 100)) },
    { k: 'hp', n: '체력', v: Math.round(F.hp), parts: add(add(add([['기본', C0.hp]], p.hp, `여신탑 체력 Lv.${p.hp}`, pc(6 * p.hp)), am.hp && am.hp !== 1, `전직 ${A && A.n}`, xm(am.hp)), q.hp, '장비', pc(q.hp)) },
    { k: 'taken', n: '피해 감소', v: `${r1((1 - F.taken) * 100)}%`, parts: add(add([['방어', `${Math.round((C0.armor || 0) * 100)}%`]], am.armor !== undefined, `전직 ${A && A.n}`, `방어 ${Math.round(am.armor * 100)}%`), M.taken !== 1, '던전 축복', pc((M.taken - 1) * 100)) },
    { k: 'skill', n: '스킬 피해', v: `${Math.round(F.skillMul * 100)}%`, parts: add(add([['기본', '100%']], u.skill, `스킬 강화 Lv.${u.skill}`, pc(25 * u.skill)), q.skill, '장비', pc(q.skill)) },
    { k: 'cd', n: '재사용 대기 감소', v: `${r1(F.cdRed * 100)}%`, parts: add(add(add([['Q 기본', `${C0.cd}초 → ${r1(F.cd)}초`]], u.skill, `스킬 강화 Lv.${u.skill}`, `×0.92^${u.skill}`), q.cdr, '장비', `-${Math.min(CDR_CAP, q.cdr)}%${q.cdr > CDR_CAP ? ` (최대 ${CDR_CAP}%)` : ''}`), M.cd !== 1, '던전 축복', pc((M.cd - 1) * 100)) },
  ];
  return { C, F, rows, cp: heroCP(cls, F), dps: F.dps };
}
// 장착한 전설/고유 효과 (텍스트). lsk = E.legendOf, uq = E.uniquesOf { weapon?, armor?, acc? }, cdr = 장비 쿨 감소 %
export function effectsOf(lsk, uq = {}, cdr = 0) {
  const out = [], w = uq.weapon && UQ[uq.weapon.k];
  if (lsk && LSK[lsk]) { const s = LSK[lsk], a = s.uq && uq.weapon ? uq.weapon.a || 0 : 0;
    out.push({ kind: s.uq ? 'uq' : 'legend', n: (w && s.uq ? `${w.n} · ` : '') + s.n, tag: s.type === 'proc' ? `공격 시 ${Math.round(s.chance * 100)}% 발동` : `[E] 재사용 ${r1(s.cd * (s.uq ? awakeCd(a) : 1) * (1 - Math.min(CDR_CAP, cdr) / 100))}초`, d: s.d, aw: s.uq ? a : null, pow: s.uq ? awakeMul(a) : 1, a3: s.uq && w && a >= 3 ? w.a3 : null }); }
  for (const sl of ['armor', 'acc']) { const o = uq[sl], U = o && UQ[o.k]; if (!U) continue; const a = o.a || 0; out.push({ kind: 'uq', n: `${U.ic || ''} ${U.n} · ${U.un}`.trim(), tag: '고유 자동', d: U.d, aw: a, pow: awakeMul(a), a3: a >= 3 ? U.a3 : null }); }
  return out;
}
