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
// am = 전직 타워 보너스(advance.js advTowerMods) — 연구 결과에 곱만 추가. 없으면 기존 결과와 완전히 같음
export function resMods(research, type, am) { const r = research && research[type], o = !r ? { dmg: 1, rate: 1, rng: 1, xp0: 0 } : { dmg: 1 + RES.atk.per * r.atk, rate: 1 + RES.spd.per * r.spd, rng: 1 + RES.rng.per * r.rng, xp0: startXp(research, type) };
  if (!am) return o; o.dmg *= am.dmg; o.rate *= am.rate; o.rng *= am.rng; if (am.splash !== 1) o.splash = am.splash; if (am.slowAdd) o.slowAdd = am.slowAdd; if (Object.keys(am.br || {}).length) o.br = am.br; return o; }
// ★★★ 분기 + 전직 분기 보너스(mods.br: targets/cluster 더하기, dmg 곱, freezeEvery 설정)
export function branchFor(type, branch, mods) { const B = branch && BRANCH[type][branch]; if (!B) return null; const x = mods && mods.br && mods.br[branch]; if (!x) return B;
  const o = { ...B }; if (x.targets) o.targets = (B.targets || 1) + x.targets; if (x.cluster) o.cluster = (B.cluster || 0) + x.cluster; if (x.dmg) o.dmg = (B.dmg || 1) * x.dmg; if (x.freezeEvery) o.freezeEvery = x.freezeEvery; return o; }
// 별/XP 상태 → 별 수
export const starsFor = xp => xp >= XP_NEED[2] ? 3 : xp >= XP_NEED[1] ? 2 : 1;
// 시작 XP: Lv4 = ★★ + (★★→★★★ 구간 60%)
export function startXp(research, type) { const r = research && research[type]; if (!r || !r.start) return 0; return r.start >= 4 ? Math.round(XP_NEED[1] + (XP_NEED[2] - XP_NEED[1]) * .6) : Math.round(XP_NEED[1] * .2 * r.start); }
// 타워 실전 수치: 기본(단계 L) × 별 × 분기 × 연구 (× ✨초월 aw). 성장/연구 없으면 TOWERS 값 그대로 · aw=false 면 기존 결과와 완전히 같음
export function towerStats(type, lvl, stars = 1, branch = null, mods = null, aw = false) {
  const D = TOWERS[type], L = lvl - 1, S = STAR[(stars || 1) - 1], B = branchFor(type, branch, mods) || {}, M = mods || { dmg: 1, rate: 1, rng: 1 };
  const o = { dmg: D.dmg[L] * S.dmg * (B.dmg || 1) * M.dmg, rate: D.rate[L] * S.rate * (B.rate || 1) * M.rate, range: D.range[L] * S.rng * (B.rng || 1) * M.rng };
  if (D.splash) o.splash = D.splash[L] * (B.splash || 1) * (M.splash || 1); if (D.chain) { o.chain = B.chainSet || D.chain[L] + (B.chainAdd || 0); o.slow = (B.slowSet || D.slow[L]) + (M.slowAdd || 0); o.falloff = B.falloff || .85; o.hop = B.hop || 3.8; }
  if (aw) { const A = AWK[type]; o.dmg *= AWK.dmg; if (A.rate) o.rate *= A.rate; if (D.chain) { o.chain += branch === 'frost' ? A.frostChainAdd : A.chainAdd; o.slow = Math.min(A.slowCap, o.slow + A.slowAdd); } }
  return o;
}

// ================= ✨ 초월 (하드 스테이지 전용 4번째 단계, docs/TOWER_AWAKEN_2026-10-24.md) =================
// 판 안 상태만 (tw.awk · G.awkOpen) — 저장/스키마 변경 없음. 수치는 이 표 하나에서만 조정
export const AWK = {
  needLab: true, // 사용자 결정 (2026-10-24): 연구소 3종 연구 전부 최대 AND 판 안 조건 — 둘 다 필수
  maxPerType: 2, cost: { arrow: 240, cannon: 320, magic: 340 }, dmg: 1.3, hp: 1.3,
  arrow: { n: '천궁', icon: '🏹', c: '#fff3a0', rate: 1.1, pierce: 2, pierceR: 3.5, pierceK: [.8, .65], volleyEvery: 6, volleyN: 5, volleyK: .6, multiAdd: 1, snipeX2: 2,
    d: '공속 +10% · 화살 꿰뚫기 2회(3.5 안 다음 적 80%→65%) · 6타마다 일제사격 5발(각 60%, 공중 포함)' },
  cannon: { n: '화염 포루', icon: '💣', c: '#ff5a2a', poolR: 2.2, poolT: 3, tick: .5, poolK: .08, poolMax: 8, clusterAdd: 2, lineT: 2, lineW: .8,
    d: '착탄 지점 불바다(반경 2.2 · 3초, 0.5초마다 착탄 피해 8%, 지상 · 겹치면 가장 센 1개)' },
  magic: { n: '뇌전 첨탑', icon: '🔮', c: '#ffe27a', chainAdd: 2, frostChainAdd: 1, slowAdd: .1, slowCap: .8, boltEvery: 8, boltR: 3, boltK: 2, stunT: .8, stunBoss: .25, bossCd: 4, frostEvery: 3,
    d: '연쇄 +2 · 둔화 +10%p(최대 80%) · 8타마다 천뢰(반경 3 광역 200% + 기절 0.8초, 보스 0.25초)' },
};
// 분기별 덧붙임 설명 (UI)
export const AWK_BR = { multi: '동시 대상 3→4', snipe: '꿰뚫기도 방어 무시 · 일제사격 대신 6타마다 피해 ×2', blast: '집속탄 3→5발', pierce: '지나간 직선에 2초 불길', storm: '연쇄 감쇠 그대로', frost: '연쇄 +1만 · 빙결 주기 4→3타' };
// 연구소: 한 종류의 4개 연구가 모두 최대인가
export function labMaxed(research, type) { const r = research && research[type]; return !!r && RKEYS.every(k => (r[k] | 0) >= RES[k].max); }
// 판 안: 그 종류 타워 1기 이상이 Lv.3 + ★★★ + 진화
export const awkTowerDone = tw => !!tw && !tw.dead && tw.lvl >= 3 && (tw.stars || 1) >= 3 && !!tw.branch;
// 종류별 상태 (🔒 체크리스트): { lab: {arrow:bool..}, stage: {arrow:bool..}, labOk, stageOk, ok }
export function awakenStatus(towers, hard, research, needLab = AWK.needLab) {
  const lab = {}, stage = {}; for (const t of TTYPES) { lab[t] = labMaxed(research, t); stage[t] = (towers || []).some(w => w.type === t && awkTowerDone(w)); }
  const labOk = !needLab || TTYPES.every(t => lab[t]), stageOk = TTYPES.every(t => stage[t]); return { lab, stage, labOk, stageOk, ok: !!hard && labOk && stageOk };
}
export const awakenReady = (towers, hard, research, needLab = AWK.needLab) => awakenStatus(towers, hard, research, needLab).ok;
export const awkCost = type => AWK.cost[type];
// 초월 가능 여부: null 이면 가능, 아니면 사유
export function awkBlock(tw, towers, gold, open) {
  if (!tw || tw.dead || !AWK[tw.type]) return '타워 없음'; if (tw.awk) return '초월 완료'; if (!open) return '초월 잠김';
  if (!awkTowerDone(tw)) return 'Lv.3·★★★·진화 필요'; if ((towers || []).filter(w => w !== tw && !w.dead && w.type === tw.type && w.awk).length >= AWK.maxPerType) return `종류별 최대 ${AWK.maxPerType}기`;
  if (gold < awkCost(tw.type)) return '골드 부족'; return null;
}
// 초월 분기 덧씌움: 동시 대상 +1 · 집속탄 +2 · 서리 빙결 주기 3
export function awkBranch(type, branch, B) { if (!B) return B; const o = { ...B };
  if (branch === 'multi') o.targets = (B.targets || 1) + AWK.arrow.multiAdd; else if (branch === 'blast') o.cluster = (B.cluster || 0) + AWK.cannon.clusterAdd; else if (branch === 'frost') o.freezeEvery = AWK.magic.frostEvery; return o; }
// 꿰뚫기 k번째(1부터) 피해 = 원래 화살 피해 × pierceK[k-1]
export const pierceDmg = (base, k) => base * (AWK.arrow.pierceK[k - 1] || 0);
// 불바다 틱: 적마다 덮는 불바다 중 가장 센 1개만. pools = [{x,z,r,dmg} | {x,z,x2,z2,w,dmg}(직선)], enemies = [{x,z,fly}] → Map(적 index → 그 불바다)
export function poolHits(pools, enemies) { const out = new Map();
  enemies.forEach((e, i) => { if (e.fly) return; let best = null; for (const p of pools) { if (best && !(p.dmg > best.dmg)) continue; if (inPool(p, e.x, e.z)) best = p; } if (best) out.set(i, best); }); return out; }
export function inPool(p, x, z) { if (p.x2 === undefined) { const dx = x - p.x, dz = z - p.z; return dx * dx + dz * dz <= p.r * p.r; }
  const vx = p.x2 - p.x, vz = p.z2 - p.z, L2 = vx * vx + vz * vz || 1e-9, k = Math.max(0, Math.min(1, ((x - p.x) * vx + (z - p.z) * vz) / L2)), dx = x - (p.x + vx * k), dz = z - (p.z + vz * k); return dx * dx + dz * dz <= p.w * p.w; }
