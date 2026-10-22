// ================= 던전 원정 (파티 던전) 데이터 · 순수 함수 (DOM/three 없음 → node 테스트) =================
// 단계 계획: docs/DUNGEON_2026-10-22.md. 2단계 = 1층만. FLOORS 에 층을 추가하면 3단계(5층·축복)로 확장, 보스(4단계)는 마지막 층 웨이브에 넣음
import { CLASSES, isHidden } from './heroes.js';

// 공개 스위치: false 면 마을 건물은 '준비 중'(입장 불가) · ?dungeon=1 도 무시. 테스트/개발은 ?dgtest=1 로 켬
export const DG_LIVE = true;
export const DG_OPEN = DG_LIVE || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dgtest'));

// 파티: 무료 3영웅 고정 + 유료 영웅은 '서버 소유 확인'(account/shop.js heroOwned — hd3d_owned) 이 참일 때만. 숨긴 영웅(버들)은 소유해도 제외
export const DG_BASE = ['warrior', 'archer', 'mage'];
export const DG_PAID = ['gunner'];
export function dungeonParty(owned) { return [...DG_BASE, ...DG_PAID.filter(c => CLASSES[c] && !isHidden(c) && typeof owned === 'function' && owned(c) === true)].filter(c => !isHidden(c)); }
// 역할: tank = 앞에서 어그로, ranged = 뒤에서 사격, caster = 밀집 지점 광역
export const ROLE = { warrior: 'tank', archer: 'ranged', gunner: 'ranged', mage: 'caster', mechanic: 'tank' };
export const ROLE_N = { tank: '전방 · 어그로', ranged: '후방 · 사격', caster: '광역 · 밀집 공격' };
// 어그로: 몬스터가 노릴 영웅을 고를 때 탱커는 이만큼 가깝게 친다 (AGGRO_R 안에 있을 때만)
export const AGGRO_BONUS = 4, AGGRO_R = 9;

// 맵: 24×16 칸 동굴 방. 테두리 = 바위 벽, 입구 4곳(SPAWN, 포털) · 안쪽 암반 기둥 (영웅·몬스터 모두 못 지나감)
export const DG_GW = 24, DG_GH = 16;
export const ENTRANCES = [[0, 7], [23, 8], [11, 0], [12, 15]];
export const DG_CENTER = [12, 8]; // 코어 자리(숨김) = 파티 시작 위치
export const PILLARS = [[6, 4], [7, 4], [6, 11], [17, 4], [17, 11], [16, 11], [9, 8], [15, 7], [4, 8], [19, 7]];
// 칸 종류 문자: 'W' 바위 벽, 'P' 암반 기둥, 'S' 입구, 'C' 중앙(코어 자리), '.' 바닥
export function dungeonLayout(GW = DG_GW, GH = DG_GH) {
  const g = Array.from({ length: GW }, () => Array(GH).fill('.')), ent = new Set(ENTRANCES.map(([c, r]) => c + ',' + r));
  for (let c = 0; c < GW; c++) for (let r = 0; r < GH; r++) if (c === 0 || r === 0 || c === GW - 1 || r === GH - 1) g[c][r] = ent.has(c + ',' + r) ? 'S' : 'W';
  for (const [c, r] of PILLARS) g[c][r] = 'P'; g[DG_CENTER[0]][DG_CENTER[1]] = 'C';
  return g;
}

// 층: waves = [[종류, 수], …] 웨이브마다. hpMul = 몬스터 체력 배수, gap = 웨이브 사이 쉬는 시간(초), every = 출현 간격(초)
// 1층 균형(2026-10-22 시뮬레이션, AI 자동 전투·조작 영웅 가만히): 강화·장비 없는 기본 3영웅 ~70초 클리어, 최저 체력 23~78% (hpMul 3.0/dmg 1.6 은 전멸 발생 → 너무 어려움). 로즈 포함 4명 ~62초
// 3단계(2026-10-22): 5개 층. 층 사이 축복 3택1(판 한정) · 쓰러진 영웅은 다음 층에 체력 30% 로 복귀 · 5층 = 임시 보스 방(해골 군주, 4단계에서 새 Meshy 보스로 교체)
// 몬스터는 던전 맵에서 검증된 능력 없는/단순 능력 종류만 (imp·grunt·golem·goblin(겁먹으면 빨라짐)·mushroom(몬스터 치유)·boss(능력 없음))
export const FLOORS = [
  { n: '1층 · 해골 동굴', hpMul: 2.4, dmgMul: 1.4, gap: 4, every: .55,
    waves: [[['imp', 6], ['grunt', 4]], [['grunt', 8], ['imp', 6]], [['golem', 2], ['grunt', 8], ['imp', 6]]] },
  { n: '2층 · 고블린 굴', hpMul: 2.5, dmgMul: 1.45, gap: 4, every: .55,
    waves: [[['goblin', 6], ['imp', 6]], [['grunt', 8], ['goblin', 6]], [['golem', 3], ['grunt', 6], ['mushroom', 2]]] },
  { n: '3층 · 버섯 늪', hpMul: 2.6, dmgMul: 1.5, gap: 4, every: .55,
    waves: [[['mushroom', 3], ['grunt', 8], ['imp', 6]], [['goblin', 8], ['golem', 2], ['imp', 6]], [['golem', 3], ['mushroom', 3], ['grunt', 8], ['goblin', 4]]] },
  { n: '4층 · 기사의 회랑', hpMul: 2.7, dmgMul: 1.55, gap: 4, every: .55,
    waves: [[['golem', 3], ['grunt', 8], ['goblin', 6]], [['golem', 4], ['mushroom', 3], ['imp', 8]], [['golem', 5], ['grunt', 10], ['goblin', 6]]] },
  { n: '5층 · 군주의 방', hpMul: 1.6, dmgMul: 1.4, gap: 4, every: .6, boss: true,
    waves: [[['grunt', 6], ['imp', 6]], [['boss', 1], ['grunt', 6], ['imp', 4]]] },
];
export const floorCount = () => FLOORS.length;
export function waveList(floor, w) { const F = FLOORS[floor], W = F && F.waves[w]; if (!W) return []; const out = []; let left = W.map(([t, n]) => [t, n]);
  while (left.some(x => x[1] > 0)) for (const x of left) if (x[1] > 0) { out.push(x[0]); x[1]--; } return out; } // 종류를 섞어서 (같은 종류만 몰려 나오지 않게)
// 임시 보상 (5단계에서 던전 메달·하루 3회 서버 강제로 교체): 돌파한 층마다 영혼석 + 5층까지 완주 보너스
export const DG_REWARD = { perFloor: 10, clearBonus: 30 };
export const dungeonReward = (cleared, all = FLOORS.length) => cleared <= 0 ? 0 : cleared * DG_REWARD.perFloor + (cleared >= all ? DG_REWARD.clearBonus : 0);

// ---------- 쓰러진 영웅 복귀 · 층 사이 휴식 ----------
export const REVIVE_HP = .3; // 쓰러진 영웅: 이 층은 쉬고 다음 층 시작 때 최대 체력의 30% 로 복귀
export const REST_HEAL = .15; // 살아남은 영웅: 층 사이에 최대 체력 15% 회복
export function nextFloorHp(hp, max, down) { return down ? Math.round(max * REVIVE_HP) : Math.min(max, hp + max * REST_HEAL); }

// ---------- 축복 (층 사이 3택1, 이번 원정에서만) ----------
// role: 그 역할 영웅이 파티에 있을 때만 후보. max: 같은 축복을 몇 번까지 고를 수 있는지
export const BLESS = [
  { id: 'haste', icon: '⚡', n: '질풍의 축복', d: '전원 공격 속도 +15%', max: 3 },
  { id: 'might', icon: '⚔', n: '힘의 축복', d: '전원 공격력 +12%', max: 3 },
  { id: 'crit', icon: '🎯', n: '예리함의 축복', d: '치명타 확률 +12% · 치명타 피해 +25%', max: 2 },
  { id: 'heal', icon: '💖', n: '생명의 샘', d: '다음 층 시작 때 전원 체력 50% 회복 (쓰러진 영웅 포함)', max: 9 },
  { id: 'regen', icon: '🌿', n: '재생의 축복', d: '전원 매초 최대 체력 1% 회복', max: 2 },
  { id: 'ult', icon: '✨', n: '별빛 충전', d: '궁극기 게이지 충전 +40% · 다음 층을 게이지 30% 로 시작', max: 2 },
  { id: 'tank', icon: '🛡', n: '수호자의 맹세', d: '전방(세라) 받는 피해 -25%', role: 'tank', max: 2 },
  { id: 'ranged', icon: '🏹', n: '명사수의 눈', d: '후방(실바·로즈) 사거리 +15% · 공격력 +15%', role: 'ranged', max: 2 },
  { id: 'caster', icon: '🔮', n: '마력 폭주', d: '광역(루나) 스킬 재사용 대기 -25%', role: 'caster', max: 2 },
];
export const BLESS_BY = Object.fromEntries(BLESS.map(b => [b.id, b]));
// 후보 3개 (중복 없음, 최대 횟수 넘은 것·파티에 없는 역할 제외). rnd = 0~1 난수 함수 (테스트는 고정 난수)
export function blessChoices(taken = {}, roles = [], rnd = Math.random, n = 3) {
  const pool = BLESS.filter(b => (taken[b.id] || 0) < b.max && (!b.role || roles.includes(b.role))), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length) % pool.length, 1)[0].id);
  return out;
}
// 고른 축복 → 배수/가산값. role = 그 영웅의 역할 (역할 축복은 해당 역할만)
export function blessMods(taken = {}, role = null) { const k = id => taken[id] || 0;
  return { rate: 1 + .15 * k('haste'), dmg: (1 + .12 * k('might')) * (role === 'ranged' ? 1 + .15 * k('ranged') : 1), crit: 12 * k('crit'), critD: 25 * k('crit'),
    regen: .01 * k('regen'), ult: 1 + .4 * k('ult'), taken: role === 'tank' ? Math.pow(.75, k('tank')) : 1, range: role === 'ranged' ? 1 + .15 * k('ranged') : 1, cd: role === 'caster' ? Math.pow(.75, k('caster')) : 1 }; }

// ---------- 궁극기 게이지 · 합동 공격 ----------
// 게이지 0~100: 전투 중(살아있는 적이 있을 때) 매초 ULT_RATE + 적 처치마다 ULT_KILL (파티 전원, 축복 배수). 살아있는 영웅 전원이 가득 차면 합동 공격 가능
export const ULT_MAX = 100, ULT_RATE = 1, ULT_KILL = 1.5;
export const JOINT_K = 10; // 합동 공격 화면 전체 피해 = 살아있는 영웅 기본 공격력 합 × JOINT_K (보스 포함 모든 적)
export const ultGain = (dt, kills, combat, mul = 1) => ((combat ? dt * ULT_RATE : 0) + kills * ULT_KILL) * mul;
export function jointReady(heroes) { const L = (heroes || []).filter(h => h.dead <= 0); return L.length > 0 && L.every(h => (h.ult || 0) >= ULT_MAX); }
export const jointDamage = dmgs => dmgs.reduce((a, b) => a + b, 0) * JOINT_K;
