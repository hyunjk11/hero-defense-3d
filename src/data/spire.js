// ================= 🗼 무한의 탑 (코드 이름 spire — 'tower' 는 방어 타워) : 데이터 · 순수 함수 =================
// 계획: docs/SPIRE_PLAN_2026-10-24.md · 진행: docs/SPIRE_2026-10-24.md
// T-2 (2026-10-24): 층 종류 · 난이도 배수 · 웨이브 · 어픽스(주간 시드) · 보스 로테이션 · 체크포인트 · 따라잡기 축복 · 첫 돌파/주간 보상
// 이 파일은 DOM/three 를 쓰지 않음 (node 테스트 tests/spire.test.mjs). 서버(T-6 schema.sql hd3d_spire_*) 상수는 여기 값과 같아야 함 (테스트로 비교 예정)
// 층 번호 n 은 1부터. 층 객체는 data/dungeon.js FLOORS 와 같은 모양 {n, hpMul, dmgMul, gap, every, boss, waves} + 탑 전용 필드
import { DG_BOSS_TYPE } from './dungeon.js';

export const SP_LIVE = false; // T-10 에서 true (공개). 그 전에는 ?sptest=1 일 때만 열림
export const SP_OPEN = SP_LIVE || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('sptest'));
export const SP_PICK_KEY = 'hd3d_sppick'; // 탑 전용 파티 (원정 hd3d_dgpick 과 따로)

// ---------- 난이도 공식 (시뮬 T-5 뒤 조정 가능하게 상수 한 곳) ----------
export const SP = {
  hpBase: 2.2, hpGrow: 1.05,   // hpMul(n) = 2.2 × 1.05^(n−1)
  dmgBase: 1.3, dmgGrow: 1.03, // dmgMul(n) = 1.3 × 1.03^(n−1)
  cntBase: 14, cntCap: 24,     // 웨이브당 마리 = min(24, 14 + ⌊n/3⌋)
  hordeK: 1.25, hordeCap: 30,  // 👥 대군: 마리 ×1.25 (상한 30) · 웨이브 간격 ×0.5
  bossHpK: .55,                // 보스 체력 = 기본 × hpMul(n) × 0.55
  everyBase: .6, everyStep: .004, everyMin: .4, gap: 4,
  awakenCd: .85,               // 60층부터(로테이션 2회차) 보스 능력 대기 ×0.85
};
// 서버 강제 값 (T-6 에서 schema.sql 과 같게)
export const SP_SERVER = { dailyCap: 30, maxPerRun: 30, minSec: { normal: 25, boss: 40 }, pingMinSec: 125, expireH: 3 };
export const SP_REVIVE = .3; // 쓰러진 영웅: 매 층 체력 30% 복귀 (던전과 같음 — 결정 Q3)

const int = n => Math.max(1, Math.floor(+n || 1));
export const hpMul = n => SP.hpBase * SP.hpGrow ** (int(n) - 1);
export const dmgMul = n => SP.dmgBase * SP.dmgGrow ** (int(n) - 1);
export const countOf = n => Math.min(SP.cntCap, SP.cntBase + Math.floor(int(n) / 3));
export const everyOf = n => Math.max(SP.everyMin, SP.everyBase - int(n) * SP.everyStep);

// ---------- 층 종류 ----------
// boss = 10의 배수 (대보스) · mid = 10k+5 (중간 보스) · elite = 5k+3 · normal = 나머지
export function floorType(n) { n = int(n); return n % 10 === 0 ? 'boss' : n % 10 === 5 ? 'mid' : n % 5 === 3 ? 'elite' : 'normal'; }
export const isBossFloor = n => int(n) % 5 === 0; // 대보스·중간 보스 = 체크포인트 층 (돌파 시 축복 3택1 · 서버 ping)
export const SP_TYPE = { normal: { n: '일반', icon: '' }, elite: { n: '정예', icon: '🔴' }, mid: { n: '중간 보스', icon: '💀' }, boss: { n: '대보스', icon: '👑' } };

// ---------- 몬스터 풀 (구간별, 던전 검증 몬스터 우선 · T-3 에서 후보 확인) ----------
export const SP_BANDS = [
  { to: 10, n: '해골 동굴', add: ['imp', 'grunt', 'goblin', 'mushroom', 'golem'] },
  { to: 20, n: '얼어붙은 회랑', add: ['icewolf', 'yeti', 'wisp', 'frostgolem'] },
  { to: 30, n: '불타는 심연', add: ['ember_slime', 'lavahound', 'magmagolem'] },
  { to: 40, n: '무너진 성소', add: ['gargoyle', 'wraith', 'ruin_guard', 'shield'] },
  { to: Infinity, n: '혼돈의 층', add: [] },
];
export const SP_EXCLUDE = ['digger', 'bomber', 'firebomber', 'siege', 'charger']; // 지형/타워/경로 의존 (던전 맵 미검증)
const HEAVY = new Set(['golem', 'yeti', 'frostgolem', 'magmagolem', 'gargoyle']); // 무거운 종류: 웨이브당 몇 마리만
export const bandOf = n => SP_BANDS.find(b => int(n) <= b.to);
export function poolOf(n) { const out = []; for (const b of SP_BANDS) { out.push(...b.add); if (int(n) <= b.to) break; } return out.filter(k => !SP_EXCLUDE.includes(k)); }

// ---------- 주차 · 시드 (한국 시간 월요일 0시 기준, 모든 유저 같은 탑) ----------
const KST = 9 * 3600e3;
const ymd = d => d.toISOString().slice(0, 10);
// 주차 키 = 그 주 월요일의 KST 날짜 'YYYY-MM-DD' (서버 date 와 같은 모양)
export function weekKey(t = Date.now()) { const k = new Date(+new Date(t) + KST), dow = (k.getUTCDay() + 6) % 7; return ymd(new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow))); }
export const prevWeek = w => ymd(new Date(Date.parse(w + 'T00:00:00Z') - 7 * 864e5));
export function hash32(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; } // FNV-1a
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; } // mulberry32
export const floorRng = (n, week, salt = '') => rng(hash32(`${week}:${int(n)}${salt}`));

// ---------- 어픽스 (층 변형) ----------
// tier easy = T-4 구현 · mid = T-5 구현 (on:false 동안 뽑히지 않음) · good = 좋은 변형
export const SP_AFFIX = [
  { id: 'haste', icon: '💨', n: '가속', desc: '몬스터 이동 속도 +20%', tier: 'easy', on: true, spd: 1.2 },
  { id: 'armor', icon: '🛡', n: '철갑', desc: '몬스터 방어 +0.15', tier: 'easy', on: true, armor: .15 },
  { id: 'regen', icon: '🌿', n: '재생', desc: '몬스터가 매초 최대 체력 1% 회복', tier: 'easy', on: true, regen: .01 },
  { id: 'horde', icon: '👥', n: '대군', desc: '몬스터 수 +25% · 웨이브 간격 절반', tier: 'easy', on: true },
  { id: 'elite', icon: '🔴', n: '정예 증가', desc: '웨이브마다 정예 +1', tier: 'easy', on: true },
  { id: 'blessed', icon: '✨', n: '축복의 층', desc: '이 층을 돌파하면 축복 1회 추가', tier: 'easy', on: true, good: true },
  { id: 'frenzy', icon: '😡', n: '광폭', desc: '체력 30% 이하 몬스터의 공격 +30%', tier: 'mid', on: false },
  { id: 'curse', icon: '💔', n: '저주', desc: '영웅 회복 −50%', tier: 'mid', on: false },
  { id: 'resM', icon: '🔮', n: '마법 저항', desc: '마법사 영웅의 피해 −35%', tier: 'mid', on: false },
  { id: 'resR', icon: '🏹', n: '원거리 저항', desc: '원거리 영웅의 피해 −35%', tier: 'mid', on: false },
];
export const SP_AFFIX_BY = Object.fromEntries(SP_AFFIX.map(a => [a.id, a]));
export const SP_CLASH = [['horde', 'elite'], ['resM', 'resR'], ['blessed', 'curse']]; // 같은 층에 같이 안 나옴
export const clash = (a, b) => SP_CLASH.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
// 개수: 6층부터 1 · 21층부터 2 · 41층부터 3 · 보스 층(5의 배수)은 1개 적게
export function affixCount(n) { n = int(n); const c = n >= 41 ? 3 : n >= 21 ? 2 : n >= 6 ? 1 : 0; return Math.max(0, c - (isBossFloor(n) ? 1 : 0)); }
export function affixesOf(n, week, pool = SP_AFFIX.filter(a => a.on).map(a => a.id)) {
  const want = affixCount(n), r = floorRng(n, week, ':aff'), left = [...pool], out = [];
  while (out.length < want && left.length) { const id = left.splice(Math.floor(r() * left.length), 1)[0]; if (!out.some(x => clash(x, id))) out.push(id); }
  return out;
}

// ---------- 보스 로테이션 ----------
// 대보스 (10의 배수): 5회 주기. sp_* 는 T-5 에서 monsters.js VARIANTS 에 추가 (그 전에는 base 종류로 대체)
export const SP_BOSSES = [
  { id: 'sp_forest', base: 'boss_forest', n: '🌳 숲의 군주' },
  { id: 'sp_snow', base: 'boss_snow', n: '❄ 빙결의 군주', escort: 'icewolf' },
  { id: 'sp_fire', base: 'boss_fire', n: '🔥 화염의 군주' },
  { id: 'sp_ruins', base: 'boss_ruins', n: '👑 망국의 왕' },
  { id: DG_BOSS_TYPE, base: DG_BOSS_TYPE, n: '💀 망령 여왕 모르비아' },
];
export function bossOf(n) { n = int(n); const t = floorType(n);
  if (t === 'boss') { const i = n / 10 - 1, B = SP_BOSSES[i % SP_BOSSES.length]; return { ...B, cycle: Math.floor(i / SP_BOSSES.length), awaken: i >= SP_BOSSES.length }; }
  if (t === 'mid') { const k = (n - 5) / 10; return k % 2 === 0 ? { id: 'boss', base: 'boss', n: '💀 해골 군주', cycle: 0, awaken: false } : { id: 'knights', base: 'golem', n: '🛡 정예 해골 기사단', knights: 3, cycle: 0, awaken: false }; }
  return null; }

// ---------- 층 생성 ----------
// 웨이브 = [[종류, 수], …] (FLOORS 와 같은 모양 → data/dungeon.js waveList(층 객체, w) 그대로 사용)
// elite = 웨이브별 정예 수 (T-4: enemy.js 에서 G.spire 일 때만 정예로 스폰)
function mixWave(n, total, r) { const pool = poolOf(n), heavy = pool.filter(k => HEAVY.has(k)), light = pool.filter(k => !HEAVY.has(k));
  const nh = Math.min(heavy.length ? 3 : 0, Math.max(heavy.length ? 1 : 0, Math.floor(total / 8))), cnt = {};
  for (let i = 0; i < nh; i++) { const k = heavy[Math.floor(r() * heavy.length)]; cnt[k] = (cnt[k] || 0) + 1; }
  const kinds = []; const pick = Math.min(light.length, 2 + Math.floor(r() * 2)), L = [...light];
  for (let i = 0; i < pick; i++) kinds.push(L.splice(Math.floor(r() * L.length), 1)[0]);
  for (let i = 0; i < total - nh; i++) { const k = kinds[i % kinds.length]; cnt[k] = (cnt[k] || 0) + 1; }
  return Object.entries(cnt); }
export function spireFloor(n, week = weekKey()) {
  n = int(n); const type = floorType(n), aff = affixesOf(n, week), r = floorRng(n, week, ':wave'), horde = aff.includes('horde');
  const cnt = horde ? Math.min(SP.hordeCap, Math.round(countOf(n) * SP.hordeK)) : countOf(n), gap = horde ? SP.gap / 2 : SP.gap;
  const B = bossOf(n), plusE = aff.includes('elite') ? 1 : 0, waves = [], elite = [];
  if (type === 'normal' || type === 'elite') { const nw = type === 'elite' ? 2 : 3, e0 = type === 'elite' ? Math.min(4, 2 + Math.floor(n / 15)) : 0;
    for (let w = 0; w < nw; w++) { waves.push(mixWave(n, cnt, r)); elite.push(e0 + plusE); } }
  else { waves.push(mixWave(n, cnt, r)); elite.push(plusE); // 호위 웨이브
    const last = B.knights ? [[B.base, B.knights], ['grunt', 4]] : [[B.base, 1], [B.escort || 'grunt', B.escort ? 4 : 2]];
    waves.push(last); elite.push(B.knights ? B.knights : 0); }
  const bless = (isBossFloor(n) ? 1 : 0) + (aff.includes('blessed') ? 1 : 0);
  return { n: `${n}층 · ${bandOf(n).n}`, floor: n, type, hpMul: hpMul(n), dmgMul: dmgMul(n), gap, every: everyOf(n), boss: type === 'boss' || type === 'mid',
    waves, elite, affixes: aff, bossInfo: B, bossHpK: SP.bossHpK, bless, week };
}
// 이번 도전의 층 목록 (run.js 의 G.dg.floors 로 바꿔 끼움). 끝이 없으므로 필요한 만큼 이어 붙임
export const spireFloors = (from, count, week = weekKey()) => Array.from({ length: Math.max(0, count | 0) }, (_, i) => spireFloor(int(from) + i, week));
export const preview = (from, week = weekKey(), k = 5) => spireFloors(from, k, week).map(F => ({ floor: F.floor, type: F.type, affixes: F.affixes, boss: F.bossInfo && F.bossInfo.n }));

// ---------- 체크포인트 · 시작 층 ----------
// 시작 가능 = 1 또는 돌파한 보스층(5k ≤ best) + 1
export function checkpoints(best) { const b = Math.max(0, Math.floor(+best || 0)), out = [1]; for (let k = 5; k <= b; k += 5) out.push(k + 1); return out; }
export const validFrom = (from, best) => checkpoints(best).includes(from);
export const catchupBless = from => Math.min(3, Math.floor((int(from) - 1) / 10)); // 높은 체크포인트 시작 = 미리 축복 (21층 = 2번)

// ---------- 보상 (서버 상수 · 우편 지급, T-6) ----------
// 첫 돌파 (1회): 보스층 n=5k → 영혼석 300+100k (100층까지) · 10의 배수 추가 메달 5+n/10 (100층까지) · 100층 이후 10층마다 메달 10
export const SP_TITLES = { spire_30: '🗼 탑의 도전자', spire_50: '🗼 탑의 정복자', spire_w1: '🗼 탑의 지배자', spire_w10: '🗼 탑의 정예' };
export function firstClear(n) { n = int(n); if (n % 5) return null; const k = n / 5;
  const souls = n <= 100 ? 300 + 100 * k : 0, medals = n % 10 ? 0 : n <= 100 ? 5 + n / 10 : 10, title = n === 30 ? 'spire_30' : n === 50 ? 'spire_50' : null;
  return souls || medals || title ? { floor: n, souls, medals, title } : null; }
// prev(이미 보상 받은 최고 층) 초과 ~ top 이하 보스층의 첫 돌파 보상 목록
export function firstClears(prev, top) { const out = []; for (let n = (Math.floor(Math.max(0, prev | 0) / 5) + 1) * 5; n <= (top | 0); n += 5) { const r = firstClear(n); if (r) out.push(r); } return out; }
export const sumRewards = L => L.reduce((a, r) => ({ souls: a.souls + r.souls, medals: a.medals + r.medals }), { souls: 0, medals: 0 });
// 주간 기록 (W = 그 주 실제로 오른 최고 층): 영혼석 min(1500, W×30) + 메달 min(25, ⌊W/5⌋×2)
export const weekReward = W => { W = Math.max(0, Math.floor(+W || 0)); return { souls: Math.min(1500, W * 30), medals: Math.min(25, Math.floor(W / 5) * 2) }; };
export const weekTitle = rank => rank === 1 ? 'spire_w1' : rank >= 2 && rank <= 10 ? 'spire_w10' : null;

// ---------- 서버 시간 하한 (T-6 schema 와 같게) ----------
export const minSecOf = n => isBossFloor(n) ? SP_SERVER.minSec.boss : SP_SERVER.minSec.normal;
export function minSecBetween(from, top) { let s = 0; for (let n = int(from); n <= top; n++) s += minSecOf(n); return s; } // from 층부터 top 층까지 돌파에 필요한 최소 시간
// 경과 시간 sec 로 인정되는 최고 층 (from−1 이면 하나도 못 깸) · 한 도전 최대 +30층
export function capTop(from, top, sec) { from = int(from); let t = Math.min(Math.floor(+top || 0), from - 1 + SP_SERVER.maxPerRun), s = 0, ok = from - 1;
  for (let n = from; n <= t; n++) { s += minSecOf(n); if (s > sec) break; ok = n; } return ok; }

// ---------- 표시 (HUD · 배너) ----------
export const affixIcons = A => (A || []).map(id => SP_AFFIX_BY[id] ? SP_AFFIX_BY[id].icon + SP_AFFIX_BY[id].n : id).join(' ');
export function floorLabel(F, wave) { const T = SP_TYPE[F.type] || SP_TYPE.normal, parts = [`🗼 ${F.floor}층`];
  if (F.type !== 'normal') parts.push(`${T.icon} ${F.bossInfo ? F.bossInfo.n : T.n}`); if (F.affixes && F.affixes.length) parts.push(affixIcons(F.affixes));
  if (wave !== undefined) parts.push(`웨이브 ${Math.max(1, wave + 1)}/${F.waves.length}`); return parts.join(' · '); }
// 연습 탑 시작 층: URL ?spire=N → 체크포인트(1·6·11…)로 내림 (서버 검증은 T-7)
export const snapFrom = n => { n = Math.floor(+n || 1); return n < 1 ? 1 : 1 + 5 * Math.floor((n - 1) / 5); };
