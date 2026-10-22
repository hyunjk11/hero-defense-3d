// ================= 던전 원정 (파티 던전) 데이터 · 순수 함수 (DOM/three 없음 → node 테스트) =================
// 단계 계획: docs/DUNGEON_2026-10-22.md. 2단계 = 1층만. FLOORS 에 층을 추가하면 3단계(5층·축복)로 확장, 보스(4단계)는 마지막 층 웨이브에 넣음
import { CLASSES, isHidden } from './heroes.js';

// 공개 스위치: false 면 마을 건물은 '준비 중'(입장 불가) · ?dungeon=1 도 무시. 테스트/개발은 ?dgtest=1 로 켬
export const DG_LIVE = true;
export const DG_OPEN = DG_LIVE || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dgtest'));

// 출전 후보: 무료 3영웅 + 유료 영웅은 '서버 소유 확인'(account/shop.js heroOwned — hd3d_owned) 이 참일 때만. 숨긴 영웅(버들)은 소유해도 제외
// 실제 파티 = 후보 중 최대 DG_MAX(4)명 (입장 화면에서 탭으로 고름, 기본 = 후보 앞 4명, 최소 1명) — pickParty
export const DG_BASE = ['warrior', 'archer', 'mage'];
export const DG_PAID = ['gunner', 'fighter'];
export const DG_MAX = 4, DG_PICK_KEY = 'hd3d_dgparty'; // 고른 파티는 이 기기 localStorage 에만 (소유는 출발 때 서버로 다시 확인)
export function dungeonParty(owned) { return [...DG_BASE, ...DG_PAID.filter(c => CLASSES[c] && !isHidden(c) && typeof owned === 'function' && owned(c) === true)].filter(c => !isHidden(c)); }
// 역할: tank = 앞에서 어그로, ranged = 뒤에서 사격, caster = 밀집 지점 광역
// 고른 목록(want) → 실제 파티: 후보에 있는 것만 · 후보 순서(세라 먼저 = 조작 영웅) · 최대 4명 · 비면 후보 앞 4명
export function pickParty(cands, want) { const c = Array.isArray(cands) ? cands : [], w = Array.isArray(want) ? want : [], p = c.filter(x => w.includes(x)).slice(0, DG_MAX); return p.length ? p : c.slice(0, DG_MAX); }
// 입장 화면 탭: 넣기/빼기. → { pick, msg } (msg = 막힌 이유: 최소 1명 / 최대 4명)
export function togglePick(cur, cls, cands) { const p = pickParty(cands, cur);
  if (!cands.includes(cls)) return { pick: p, msg: null };
  if (p.includes(cls)) return p.length <= 1 ? { pick: p, msg: '최소 1명은 출전해야 해요' } : { pick: p.filter(x => x !== cls), msg: null };
  if (p.length >= DG_MAX) return { pick: p, msg: `최대 ${DG_MAX}명까지 출전할 수 있어요` };
  return { pick: cands.filter(x => p.includes(x) || x === cls), msg: null }; }
// 역할: tank = 앞에서 어그로, ranged = 뒤에서 사격, caster = 밀집 지점 광역, bruiser = 측면에서 원거리 적을 먼저 덮침 (서윤)
export const ROLE = { warrior: 'tank', archer: 'ranged', gunner: 'ranged', mage: 'caster', mechanic: 'tank', fighter: 'bruiser' };
export const ROLE_N = { tank: '전방 · 어그로', ranged: '후방 · 사격', caster: '광역 · 밀집 공격', bruiser: '측면 · 원거리 적 덮치기' };
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
export const FLOORS = [
  { n: '1층 · 해골 동굴', hpMul: 2.4, dmgMul: 1.4, gap: 4, every: .55,
    waves: [[['imp', 6], ['grunt', 4]], [['grunt', 8], ['imp', 6]], [['golem', 2], ['grunt', 8], ['imp', 6]]] },
];
export const floorCount = () => FLOORS.length;
export function waveList(floor, w) { const F = FLOORS[floor], W = F && F.waves[w]; if (!W) return []; const out = []; let left = W.map(([t, n]) => [t, n]);
  while (left.some(x => x[1] > 0)) for (const x of left) if (x[1] > 0) { out.push(x[0]); x[1]--; } return out; } // 종류를 섞어서 (같은 종류만 몰려 나오지 않게)
// 임시 보상 (5단계에서 던전 메달·하루 3회 서버 강제로 교체)
export const DG_REWARD = { souls: 20 };
