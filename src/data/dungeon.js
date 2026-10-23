// ================= 던전 원정 (파티 던전) 데이터 · 순수 함수 (DOM/three 없음 → node 테스트) =================
// 단계 계획: docs/DUNGEON_2026-10-22.md. 2단계 = 1층만. FLOORS 에 층을 추가하면 3단계(5층·축복)로 확장, 보스(4단계)는 마지막 층 웨이브에 넣음
import { CLASSES, isHidden } from './heroes.js';
import { UQ, UQ_DG } from './items.js';

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
// 3단계(2026-10-22): 5개 층. 층 사이 축복 3택1(판 한정) · 쓰러진 영웅은 다음 층에 체력 30% 로 복귀 · 5층 = 임시 보스 방(해골 군주, 4단계에서 새 Meshy 보스로 교체)
// 몬스터는 던전 맵에서 검증된 능력 없는/단순 능력 종류만 (imp·grunt·golem·goblin(겁먹으면 빨라짐)·mushroom(몬스터 치유)·boss(능력 없음))
// 4단계: 5층 던전 보스 '망령 여왕 모르비아' (몬스터 종류 dg_lich, data/monsters.js · 기믹 dungeon/boss.js · 모델 models/lich_meshy.glb 지연 로딩, 없으면 해골 마법사 + 절차적 왕관)
export const DG_BOSS_TYPE = 'dg_lich';
export const FLOORS = [
  { n: '1층 · 해골 동굴', hpMul: 2.4, dmgMul: 1.4, gap: 4, every: .55,
    waves: [[['imp', 6], ['grunt', 4]], [['grunt', 8], ['imp', 6]], [['golem', 2], ['grunt', 8], ['imp', 6]]] },
  { n: '2층 · 고블린 굴', hpMul: 2.5, dmgMul: 1.45, gap: 4, every: .55,
    waves: [[['goblin', 6], ['imp', 6]], [['grunt', 8], ['goblin', 6]], [['golem', 3], ['grunt', 6], ['mushroom', 2]]] },
  { n: '3층 · 버섯 늪', hpMul: 2.6, dmgMul: 1.5, gap: 4, every: .55,
    waves: [[['mushroom', 3], ['grunt', 8], ['imp', 6]], [['goblin', 8], ['golem', 2], ['imp', 6]], [['golem', 3], ['mushroom', 3], ['grunt', 8], ['goblin', 4]]] },
  { n: '4층 · 기사의 회랑', hpMul: 2.65, dmgMul: 1.5, gap: 4.5, every: .6,
    waves: [[['golem', 2], ['grunt', 8], ['goblin', 6]], [['golem', 3], ['mushroom', 2], ['imp', 8]], [['golem', 3], ['grunt', 8], ['goblin', 6]]] },
  { n: '5층 · 망령 여왕의 방', hpMul: 1.4, dmgMul: 1.2, gap: 5, every: .7, boss: true,
    waves: [[['grunt', 6], ['imp', 6]], [[DG_BOSS_TYPE, 1], ['grunt', 2]]] },
];
// T-1 (무한의 탑 준비): floor = 층 번호(FLOORS 기준, 기존 호출) 또는 층 객체 {waves} (판 진행은 G.dg.floors 의 층 객체를 넘김)
export function waveList(floor, w) { const F = typeof floor === 'number' ? FLOORS[floor] : floor, W = F && F.waves && F.waves[w]; if (!W) return []; const out = []; let left = W.map(([t, n]) => [t, n]);
  while (left.some(x => x[1] > 0)) for (const x of left) if (x[1] > 0) { out.push(x[0]); x[1]--; } return out; } // 종류를 섞어서 (같은 종류만 몰려 나오지 않게)
// 임시 보상 (5단계에서 던전 메달·하루 3회 서버 강제로 교체): 돌파한 층마다 영혼석 + 5층까지 완주 보너스
export const DG_REWARD = { perFloor: 10, clearBonus: 30 };
export const dungeonReward = (cleared, all = FLOORS.length) => cleared <= 0 ? 0 : cleared * DG_REWARD.perFloor + (cleared >= all ? DG_REWARD.clearBonus : 0);
// ---------- 5단계 (2026-10-23): 던전 메달 · 하루 3회 · 던전 상점 — 실제 판정은 서버(supabase/schema.sql hd3d_dungeon_*), 여기 값은 표시·테스트용 (tests/dungeon.test.mjs 가 schema.sql 과 비교)
// 메달 = 돌파 층 × 2 + 완주(보스 처치) 5 → 판당 최대 15 · 하루 3회 (한국 시간 0시 초기화) · 서버는 시작 후 경과 시간(층당 20초)으로 층 수 상한
// 위 dungeonReward(영혼석)는 '연습 원정'(게스트 · 오프라인 · schema.sql 다시 실행 전) 때만 주는 임시 보상
export const DG_MEDAL = { perFloor: 2, clearBonus: 5, daily: 3, minSecPerFloor: 20 };
export const dungeonMedals = (cleared, win, all = FLOORS.length) => { const f = Math.max(0, Math.min(all, Math.floor(+cleared || 0))); return f * DG_MEDAL.perFloor + (win && f >= all ? DG_MEDAL.clearBonus : 0); };
export const DG_TITLES = { lich_hunter: '👑 망령 사냥꾼' };
export const DG_SHOP = [
  { id: 'dg_steel', price: 5, n: '강철 꾸러미', icon: '⛓', reward: { steel: 40 }, desc: '장비 강화·제작 재료 강철 40' },
  { id: 'dg_souls', price: 6, n: '영혼석 주머니', icon: '🔮', reward: { souls: 400 }, desc: '여신 강화·전직에 쓰는 영혼석 400' },
  { id: 'dg_crystal', price: 8, n: '마력석 꾸러미', icon: '💎', reward: { crystal: 10 }, desc: '고급 강화·전직 재료 마력석 10' },
  { id: 'dg_essence', price: 15, n: '고유 정수', icon: '◆', reward: { essence: 3 }, desc: '고유 장비 각성 재료 고유 정수 3' },
  { id: 'dg_title', price: 60, n: '칭호 · 망령 사냥꾼', icon: '👑', title: 'lich_hunter', desc: '던전 입장 화면과 결과 화면에 칭호 「망령 사냥꾼」 표시 (한 번만)' },
  // 고유 무기 (2026-10-23): 계정당 1개 — 서버 지갑 uniques 로 강제, 모르비아 드롭으로 얻어도 '보유 중'. 우편(items uq)으로 배달
  { id: UQ_DG.shop, price: UQ_DG.price, n: UQ[UQ_DG.key].n, icon: CLASSES.fighter.icon, uq: UQ_DG.key, desc: `${CLASSES.fighter.nm} 전용 고유 무기 · [E] ${UQ[UQ_DG.key].un} (계정당 1개 · 모르비아 처치 ${Math.round(UQ_DG.drop * 100)}% 드롭으로도 획득)` },
];
export const DG_SHOP_BY = Object.fromEntries(DG_SHOP.map(x => [x.id, x]));
// 상점 버튼 상태: 'own'(이미 산 칭호 · 이미 가진 고유) · 'lack'(메달 부족) · 'ok'. uniques = 서버 지갑 uniques (+ 세이브에 이미 있는 고유)
export const shopState = (it, medals, titles = [], uniques = []) => (it.title && titles.includes(it.title)) || (it.uq && uniques.includes(it.uq)) ? 'own' : (+medals || 0) < it.price ? 'lack' : 'ok';
// 서버 사유 → 한국어
export const DG_REASON = { daily_limit: '오늘 입장 횟수(하루 3회)를 모두 썼어요. 한국 시간 0시에 초기화돼요.', not_enough: '던전 메달이 부족해요.', already: '이미 가진 칭호예요.', owned: '이미 가진 고유 장비예요 (계정당 1개).', bad_item: '알 수 없는 상품이에요.',
  bad_token: '이 원정은 서버에 등록되지 않아 메달을 받을 수 없어요.', used: '이미 정산된 원정이에요.', expired: '원정 시간이 너무 오래 지나 메달을 받을 수 없어요.' };

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
  { id: 'bruiser', icon: '👊', n: '맹호의 기세', d: '측면(서윤) 공격력 +20% · 받는 피해 -15%', role: 'bruiser', max: 2 },
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
  return { rate: 1 + .15 * k('haste'), dmg: (1 + .12 * k('might')) * (role === 'ranged' ? 1 + .15 * k('ranged') : 1) * (role === 'bruiser' ? 1 + .2 * k('bruiser') : 1), crit: 12 * k('crit'), critD: 25 * k('crit'),
    regen: .01 * k('regen'), ult: 1 + .4 * k('ult'), taken: role === 'tank' ? Math.pow(.75, k('tank')) : role === 'bruiser' ? Math.pow(.85, k('bruiser')) : 1, range: role === 'ranged' ? 1 + .15 * k('ranged') : 1, cd: role === 'caster' ? Math.pow(.75, k('caster')) : 1 }; }

// ---------- 궁극기 게이지 · 합동 공격 ----------
// 게이지 0~100: 전투 중(살아있는 적이 있을 때) 매초 ULT_RATE + 적 처치마다 ULT_KILL (파티 전원, 축복 배수). 살아있는 영웅 전원이 가득 차면 합동 공격 가능
export const ULT_MAX = 100, ULT_RATE = 1, ULT_KILL = 1.5;
export const JOINT_K = 10; // 합동 공격 화면 전체 피해 = 살아있는 영웅 기본 공격력 합 × JOINT_K (보스 포함 모든 적)
export const ultGain = (dt, kills, combat, mul = 1) => ((combat ? dt * ULT_RATE : 0) + kills * ULT_KILL) * mul;
export function jointReady(heroes) { const L = (heroes || []).filter(h => h.dead <= 0); return L.length > 0 && L.every(h => (h.ult || 0) >= ULT_MAX); }
export const jointDamage = dmgs => dmgs.reduce((a, b) => a + b, 0) * JOINT_K;

// ---------- 5층 보스 '망령 여왕 모르비아' 기믹 (수치 · 순수 판정 함수) ----------
// ① 영혼의 창(lance): 후방 영웅(실바·로즈·루나 — 없으면 가장 먼 영웅)을 겨눠 붉은 선 예고 → windup 뒤 직선으로 꿰뚫음. 선 위 '첫 영웅'이 맞음
//    → 세라(tank)·서윤(bruiser)이 선 위(대상보다 앞)에 서면 대신 막고 block 배수만 받음 · 대상이 선에서 비켜나도 피함
// ② 망령의 원(circles): 살아있는 영웅 발밑마다 보라 원 예고(+남는 수는 무작위) → windup 뒤 터짐 (조작 영웅은 직접 움직여 피해야 함 · AI 영웅은 늦게 반응)
// ③ 해골 소환(summon): 체력 75%·40% 에서 졸개 소환 (2단계면 더 많이)
// ④ 2단계(phase, 체력 50%): 분노 — 이동 속도↑ · 기믹 대기 ×cd · 원 n2개 · 창 2연속
export const DG_BOSS = {
  lance: { first: 6, every: 10, windup: 1.9, w: 1.1, len: 26, dmg: 165, block: .3 },
  circles: { first: 10, every: 12, windup: 1.8, r: 2.3, n: 3, n2: 5, dmg: 95, react: .7 },
  summon: { at: [.75, .4], n: 3, n2: 5, types: ['grunt', 'imp'], hpMul: .8 },
  phase: { at: .5, spd: 1.25, cd: .7 },
};
const _dst = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 창 대상: 살아있는 후방 영웅(ranged/caster) 중 보스에서 가장 먼 영웅, 없으면 살아있는 영웅 중 가장 먼 영웅. L = [{x,z,role,alive}] → index (-1 = 없음). skip = 제외할 index (2연속 창)
export function lanceTarget(boss, L, skip = -1) { let bi = -1, bd = -1, back = L.some((h, i) => h.alive && i !== skip && (h.role === 'ranged' || h.role === 'caster'));
  L.forEach((h, i) => { if (!h.alive || i === skip || (back && h.role !== 'ranged' && h.role !== 'caster')) return; const d = _dst(h, boss); if (d > bd) { bd = d; bi = i; } }); return bi; }
// 점 p 와 선분 a→b (b 방향 len 까지 연장) 의 거리 · 진행도 t(0=보스). → { d, t }
export function segDist(a, b, p, len = null) { const dx = b.x - a.x, dz = b.z - a.z, L0 = Math.hypot(dx, dz) || 1, ux = dx / L0, uz = dz / L0, L = len || L0;
  const t = (p.x - a.x) * ux + (p.z - a.z) * uz; if (t < 0 || t > L) return { d: Infinity, t }; return { d: Math.abs((p.x - a.x) * uz - (p.z - a.z) * ux), t }; }
// 창 판정: 보스 a 에서 조준점 b 방향(길이 len, 폭 w)으로 '처음' 닿는 살아있는 영웅. → { i, blocked } (blocked = 대상(tgt)이 아닌 tank/bruiser 가 막음) 또는 null
export function lanceVictim(a, b, L, w, len, tgt = -1) { let best = null;
  L.forEach((h, i) => { if (!h.alive) return; const s = segDist(a, b, h, len); if (s.d <= w && (!best || s.t < best.t)) best = { i, t: s.t }; });
  if (!best) return null; const h = L[best.i]; return { i: best.i, blocked: best.i !== tgt && (h.role === 'tank' || h.role === 'bruiser') }; }
// 막기 위치: 대상 앞(보스 쪽) k 거리 지점 (탱커/격투가 AI 가 그리로 이동)
export function interceptPoint(a, tgtPos, k = 2.4) { const dx = a.x - tgtPos.x, dz = a.z - tgtPos.z, L = Math.hypot(dx, dz) || 1, kk = Math.min(k, L * .5); return { x: tgtPos.x + dx / L * kk, z: tgtPos.z + dz / L * kk }; }
// 망령의 원 위치: 살아있는 영웅 발밑 먼저 → 남는 수는 영웅 주변 무작위 (rnd 0~1). 방 안쪽으로 clamp(bound)
export function circleSpots(L, n, rnd = Math.random, bound = { x: 20, z: 12 }) { const A = L.filter(h => h.alive), out = [];
  for (const h of A) if (out.length < n) out.push({ x: h.x, z: h.z });
  for (let k = 0; out.length < n && A.length; k++) { const h = A[k % A.length], a = rnd() * Math.PI * 2, r = 2.5 + rnd() * 3; out.push({ x: h.x + Math.cos(a) * r, z: h.z + Math.sin(a) * r }); }
  return out.map(p => ({ x: Math.max(-bound.x, Math.min(bound.x, p.x)), z: Math.max(-bound.z, Math.min(bound.z, p.z)) })); }
export const inCircle = (c, p, r) => _dst(c, p) <= r;
// 원 밖으로 피할 지점 (AI): 원 중심에서 바깥쪽으로 r + 1.2
export function dodgePoint(c, p, r) { let dx = p.x - c.x, dz = p.z - c.z, L = Math.hypot(dx, dz); if (L < 1e-3) { dx = 1; dz = 0; L = 1; } return { x: c.x + dx / L * (r + 1.2), z: c.z + dz / L * (r + 1.2) }; }
// 소환 차례: 체력 비율 frac 이 at[i] 이하로 처음 내려간 소환 번호들 (done = 이미 한 번호 Set/배열)
export function summonDue(frac, done = []) { const D = new Set(done); return DG_BOSS.summon.at.map((t, i) => i).filter(i => frac <= DG_BOSS.summon.at[i] && !D.has(i)); }
