// ================= 던전 원정 (파티 던전) 데이터 · 순수 함수 (DOM/three 없음 → node 테스트) =================
// 단계 계획: docs/DUNGEON_2026-10-22.md. 2단계 = 1층만. FLOORS 에 층을 추가하면 3단계(5층·축복)로 확장, 보스(4단계)는 마지막 층 웨이브에 넣음
import { CLASSES, isHidden } from './heroes.js';

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
// 1층 균형(2026-10-22): 강화 없는 기본 3영웅 파티로 ~90초 안팎, 세라가 앞에서 버티면 전멸 없음 (tests/dungeon.py 시뮬레이션 검사)
export const FLOORS = [
  { n: '1층 · 해골 동굴', hpMul: 1.6, dmgMul: 1, gap: 4, every: .55,
    waves: [[['imp', 6], ['grunt', 4]], [['grunt', 8], ['imp', 6]], [['golem', 2], ['grunt', 8], ['imp', 6]]] },
];
export const floorCount = () => FLOORS.length;
export function waveList(floor, w) { const F = FLOORS[floor], W = F && F.waves[w]; if (!W) return []; const out = []; let left = W.map(([t, n]) => [t, n]);
  while (left.some(x => x[1] > 0)) for (const x of left) if (x[1] > 0) { out.push(x[0]); x[1]--; } return out; } // 종류를 섞어서 (같은 종류만 몰려 나오지 않게)
// 임시 보상 (5단계에서 던전 메달·하루 3회 서버 강제로 교체)
export const DG_REWARD = { souls: 20 };
