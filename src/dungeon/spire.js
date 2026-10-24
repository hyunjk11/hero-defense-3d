// ================= 🗼 무한의 탑 판 진행 (T-4 연습 탑: 클라이언트만 · 기록/보상 없음) =================
// dungeon/run.js 가 G.spire 가 있을 때만 부름 (원정·일반 스테이지·하드에서는 G.spire / G.spireE 가 없어 아무것도 안 함)
// 진입: ?sptest=1 (SP_OPEN) + ?dungeon=1&run=1&spire=N (core/nav.js go({spire:N})) → run.js startDungeonRun
import { G } from '../core/state.js';
import { QS } from '../core/util.js';
import { ETYPES } from '../data/monsters.js';
import { HARD } from '../data/stages.js';
import { SP_OPEN, SP_AFFIX_BY, spireFloor, spireFloors, catchupBless, weekKey, snapFrom, bossTune, frenzyK, healK, resK } from '../data/spire.js';
import { ROLE } from '../data/dungeon.js';

// 이번 판이 탑이면 시작 층, 아니면 0
export const spireFrom = () => SP_OPEN && QS.has('spire') ? snapFrom(QS.get('spire')) : 0;
export function spireInit(from) { const week = weekKey(); G.spire = { from, week, top: from - 1, practice: true }; G.spireE = spireE; G.spireAtkK = spireAtkK; G.spireDmgK = spireDmgK; _cache.clear();
  return { floors: spireFloors(from, 3, week), catchup: catchupBless(from) }; }
// 층 목록은 끝이 없으므로 현재 층 + 2 까지 이어 붙임
export function ensureFloors(D) { while (D.floors.length < D.floor + 3) D.floors.push(spireFloor(G.spire.from + D.floors.length, G.spire.week)); }

// 몬스터 정의 (monsters/enemy.js spawnEnemy 가 G.spireE 로 부름): 정예(하드와 같은 체력 ×2.5·크기 ×1.25, 하드 피해 배수는 안 씀) · 보스 체력 ×0.55 · 💨가속 · 🛡철갑
const _cache = new Map();
export function spireE(type, elite) { const E0 = ETYPES[type], D = G.dg, F = D && D.floors && D.floors[D.floor]; if (!E0 || !F) return E0;
  const aw = !!(F.bossInfo && F.bossInfo.awaken), A = F.affixes || [], key = `${type}${elite ? '*' : ''}|${F.bossHpK}|${aw}|${A.join()}`; let E = _cache.get(key); if (E) return E;
  E = { ...bossTune(E0, aw) }; if (E0.boss) E.hp = E0.hp * (F.bossHpK || 1); // 보스: 체력 ×0.5 · 근접 ×0.75 · 각성(60층~) 능력 대기 ×0.85
  if (elite && !E0.boss) Object.assign(E, { elite: true, hp: E0.hp * HARD.eliteHp, h: E0.h * HARD.eliteScale, n: '정예 ' + E0.n });
  if (A.includes('haste')) { const k = SP_AFFIX_BY.haste.spd; E.spd = E0.spd * k; if (E0.sprint) E.sprint = E0.sprint * k; }
  if (A.includes('armor')) E.armor = Math.min(.9, (E0.armor || 0) + SP_AFFIX_BY.armor.armor);
  _cache.set(key, E); return E; }
// 웨이브 정예 표시: 정예 기사단(중간 보스)은 그 종류에, 나머지는 웨이브 안에 고르게 (앞부분 제외)
export function eliteQueue(F, w, q) { const k = Math.min(q.length, (F.elite && F.elite[w]) || 0), out = q.map(() => false); if (!k) return out;
  const B = F.bossInfo; if (B && B.knights && w === F.waves.length - 1) { let n = 0; q.forEach((t, i) => { if (t === B.base && n < k) { out[i] = true; n++; } }); return out; }
  for (let j = 0; j < k; j++) out[Math.min(q.length - 1, Math.floor((j + 1) * q.length / (k + 1)))] = true; return out; }
// 매 스텝: 🌿 재생 (몬스터 매초 최대 체력 1%)
export function spireTick(F, dt) { if (!F || !F.affixes || !F.affixes.includes('regen')) return; const k = SP_AFFIX_BY.regen.regen * dt;
  for (const e of G.enemies) if (!e.dead && e.dying === undefined && e.hp > 0 && e.hp < e.max) e.hp = Math.min(e.max, e.hp + e.max * k); }
// T-5 보통 어픽스 (현재 층 기준): 😡 광폭(ai.js 근접 공격 G.spireAtkK) · 🔮🏹 역할 저항(enemy.js hurt G.spireDmgK) · 💔 저주(run.js 층 사이 회복·재생 축복 healKOf)
const curF = () => { const D = G.dg; return D && D.floors ? D.floors[D.floor] : null; };
export const spireAtkK = e => G.spire && G.dungeon ? frenzyK(curF(), e.hp, e.max) : 1;
export const spireDmgK = h => G.spire && G.dungeon && h && h.cls ? resK(curF(), ROLE[h.cls]) : 1;
export const healKOf = F => healK(F);
