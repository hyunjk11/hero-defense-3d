// 타워 성장(판 안 별 ★1~★3 + ★★★ 분기) · 타워 연구소(영구 연구). 순수 로직 (DOM/three 없음 → node 테스트 가능)
import { TOWERS } from './towers.js';
export const TTYPES = ['arrow', 'cannon', 'magic'];
// 누적 XP 요구량: ★★ 600, ★★★ 2400. XP = 실제로 깎은 체력 + 처치 15
export const XP_NEED = [0, 600, 2400], KILL_XP = 15;
// 별 보너스 (곱연산)
export const STAR = [{ dmg: 1, rate: 1, rng: 1 }, { dmg: 1.2, rate: 1.08, rng: 1.05 }, { dmg: 1.45, rate: 1.15, rng: 1.1 }];
// ★★★ 분기: 타워 종류마다 2개 (기계적으로 다른 방식)
export const BRANCH = {
  arrow: {
    multi: { n: '연발 사수', icon: '🏹', c: '#7affc0', d: '대상 3명 동시 사격 (각 피해 75%) · 공격속도 +15%', dmg: .75, rate: 1.15, targets: 3 },
    snipe: { n: '저격수', icon: '🎯', c: '#ff7a9a', d: '사거리 +40% · 피해 ×2.3 · 공격속도 -40% · 체력 높은 적(보스) 우선 · 방어력 무시', dmg: 2.3, rate: .6, rng: 1.4, prio: 'hp', pierceArmor: true },
  },
  cannon: {
    blast: { n: '광역 폭발', icon: '💥', c: '#ffa04a', d: '폭발 반경 +60% · 피해 +10% · 착탄 후 집속탄 3발 (각 40%, 반경 1.6)', dmg: 1.1, splash: 1.6, cluster: 3, clusterK: .4, clusterR: 1.6 },
    pierce: { n: '단일 관통', icon: '➶', c: '#9ad8ff', d: '관통 철갑탄: 사거리 끝까지 직선 위 모든 지상 적 관통 · 피해 ×2 · 방어력 무시 · 폭발 없음', dmg: 2, pierce: true, pierceArmor: true },
  },
  magic: {
    storm: { n: '폭풍 연쇄', icon: '⚡', c: '#c8a0ff', d: '연쇄 +4 · 연쇄 감쇠 15%→5% · 연쇄 거리 3.8→5.5', chainAdd: 4, falloff: .95, hop: 5.5 },
    frost: { n: '서리 결정', icon: '❄', c: '#8ae8ff', d: '연쇄 2로 감소 · 피해 ×1.6 · 둔화 70%(2초) · 4번째 공격마다 1.2초 빙결 (보스 0.4초)', dmg: 1.6, chainSet: 2, slowSet: .7, slowT: 2, freezeEvery: 4, freezeT: 1.2, freezeBoss: .4 },
  },
};
// 연구: 종류별 공격력/사거리/공격속도 + 후반 '시작 성장'(Lv1~3 시작 XP, Lv4 시작 별 ★★)
export const RES = {
  atk: { n: '공격력', icon: '⚔', d: lv => `피해 +${lv * 4}%`, max: 10, per: .04, souls: 40, k: 1.38, mat: 'steel', m0: 2, m1: 1 },
  rng: { n: '사거리', icon: '◎', d: lv => `사거리 +${lv * 3}%`, max: 5, per: .03, souls: 50, k: 1.5, mat: 'steel', m0: 3, m1: 2 },
  spd: { n: '공격속도', icon: '➹', d: lv => `공격속도 +${lv * 3}%`, max: 8, per: .03, souls: 45, k: 1.42, mat: 'steel', m0: 2, m1: 1 },
  start: { n: '시작 성장', icon: '★', d: lv => lv >= 4 ? '★★로 시작 + 시작 XP 60%' : `시작 XP: ★★까지 ${lv * 20}%`, max: 4, souls: 160, k: 1.6, mat: 'crystal', m0: 2, m1: 2, need: 12 },
};
export const RKEYS = Object.keys(RES);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(+v) ? +v : 0)));
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export function emptyResearch() { return Object.fromEntries(TTYPES.map(t => [t, Object.fromEntries(RKEYS.map(k => [k, 0]))])); }
export function cleanResearch(r) { const o = emptyResearch(); r = obj(r); for (const t of TTYPES) { const x = obj(r[t]); for (const k of RKEYS) o[t][k] = int(x[k], 0, RES[k].max); } return o; }
export function mergeResearch(a, b) { a = cleanResearch(a); b = cleanResearch(b); const o = emptyResearch(); for (const t of TTYPES) for (const k of RKEYS) o[t][k] = Math.max(a[t][k], b[t][k]); return o; }
export const basicSum = r => r.atk + r.rng + r.spd;
export function resCost(k, lv) { const R = RES[k]; return { souls: Math.round(R.souls * Math.pow(R.k, lv)), [R.mat]: R.m0 + R.m1 * lv }; }
// 구매 가능 여부: null 이면 가능, 아니면 사유
export function resBlock(save, type, k) {
  const r = save.research[type], lv = r[k], R = RES[k]; if (lv >= R.max) return '최대';
  if (R.need && basicSum(r) < R.need) return `기본 연구 ${R.need}레벨 필요 (${basicSum(r)}/${R.need})`;
  const c = resCost(k, lv); if (save.souls < c.souls) return '영혼석 부족'; if ((save.mat[R.mat] || 0) < c[R.mat]) return (R.mat === 'steel' ? '강철' : '마력석') + ' 부족'; return null;
}
// save 는 progress.clean 된 객체 (souls, mat, research) — 성공 시 그 객체를 수정하고 true
export function buyResearch(save, type, k) { if (!TTYPES.includes(type) || !RES[k] || resBlock(save, type, k)) return false; const c = resCost(k, save.research[type][k]); save.souls -= c.souls; save.mat[RES[k].mat] -= c[RES[k].mat]; save.research[type][k]++; return true; }
// 판 시작 시 연구 효과 (연구 없으면 모두 1/0 → 기존 수치 그대로)
export function resMods(research, type) { const r = research && research[type]; if (!r) return { dmg: 1, rate: 1, rng: 1, xp0: 0 };
  return { dmg: 1 + RES.atk.per * r.atk, rate: 1 + RES.spd.per * r.spd, rng: 1 + RES.rng.per * r.rng, xp0: startXp(research, type) }; }
// 별/XP 상태 → 별 수
export const starsFor = xp => xp >= XP_NEED[2] ? 3 : xp >= XP_NEED[1] ? 2 : 1;
// 시작 XP: Lv4 = ★★ + (★★→★★★ 구간 60%)
export function startXp(research, type) { const r = research && research[type]; if (!r || !r.start) return 0; return r.start >= 4 ? Math.round(XP_NEED[1] + (XP_NEED[2] - XP_NEED[1]) * .6) : Math.round(XP_NEED[1] * .2 * r.start); }
// 타워 실전 수치: 기본(단계 L) × 별 × 분기 × 연구. 성장/연구 없으면 TOWERS 값 그대로
export function towerStats(type, lvl, stars = 1, branch = null, mods = null) {
  const D = TOWERS[type], L = lvl - 1, S = STAR[(stars || 1) - 1], B = (branch && BRANCH[type][branch]) || {}, M = mods || { dmg: 1, rate: 1, rng: 1 };
  const o = { dmg: D.dmg[L] * S.dmg * (B.dmg || 1) * M.dmg, rate: D.rate[L] * S.rate * (B.rate || 1) * M.rate, range: D.range[L] * S.rng * (B.rng || 1) * M.rng };
  if (D.splash) o.splash = D.splash[L] * (B.splash || 1); if (D.chain) { o.chain = B.chainSet || D.chain[L] + (B.chainAdd || 0); o.slow = B.slowSet || D.slow[L]; o.falloff = B.falloff || .85; o.hop = B.hop || 3.8; }
  return o;
}
