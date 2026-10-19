// 챕터별 몬스터 구성 → 웨이브 대기열 (순수 로직, node 테스트 가능: tests/roster.test.mjs)
import { ETYPES, ROSTERS, ENDLESS_MIX, rosterShare } from '../data/monsters.js';

export const stageLevel = (stage, n) => n + (stage.idx || 0) * 2;
// 레벨 lv에서 등장 가능한 [종류, 가중치]
export function rosterPool(ch, lv) { const R = ROSTERS[ch]; return R ? R.pool.filter(p => lv >= p[2]).map(p => [p[0], p[1]]) : []; }
export function pickFrom(pool, rand) { const sum = pool.reduce((a, p) => a + p[1], 0); let x = rand() * sum; for (const p of pool) { x -= p[1]; if (x <= 0) return p[0]; } return pool[pool.length - 1][0]; }
// 무리 몬스터(pack)는 한 번에 pack 마리 연속
const push = (q, t, max) => { const k = ETYPES[t].pack || 1; if (q.length >= max) return; for (let i = 0; i < k; i++) q.push(t); }; // 무리는 잘리지 않음 (최대 pack-1 마리 초과 가능)
// 스테이지 웨이브: 챕터 구성으로 count 마리. 이번 레벨에 처음 열리는 종류는 2마리(무리는 1무리) 보장
export function stageWave(stage, n, count, rand) {
  const lv = stageLevel(stage, n), pool = rosterPool(stage.ch, lv), q = []; if (!pool.length) return null;
  const fresh = ROSTERS[stage.ch].pool.filter(p => p[2] === lv && lv > 1).map(p => p[0]);
  const guar = []; for (const t of fresh.slice(0, 3)) { const k = ETYPES[t].pack || (ETYPES[t].hp < 300 ? 2 : 1); guar.push(Array(k).fill(t)); } // 묶음(무리는 통째로)
  const room = count - guar.reduce((a, g) => a + g.length, 0); while (q.length < room) push(q, pickFrom(pool, rand), room);
  guar.forEach((g, i) => { let at = Math.min(q.length, 2 + i * 4); while (at < q.length && at > 0 && q[at] === q[at - 1] && ETYPES[q[at]].pack) at++; q.splice(at, 0, ...g); }); // 앞쪽에 섞되 무리 사이를 가르지 않음
  return q;
}
// 도전 모드: 기존 대기열(해골 + 신규 병종)의 일부를 챕터 구성 몬스터로 교체. 웨이브가 오를수록 설원 구성도 섞임
export function endlessMix(q, n, rand) {
  const pool = []; for (const [ch, from, off] of ENDLESS_MIX) if (n >= from) for (const [t, w] of rosterPool(ch, n + off)) pool.push([t, w]);
  if (!pool.length) return q; const share = rosterShare(n), out = [];
  for (const t of q) { if (t === 'boss' || ETYPES[t].fly && rand() < .5) { out.push(t); continue; } if (rand() < share) push(out, pickFrom(pool, rand), out.length + 1); else out.push(t); }
  return out;
}
// 도전 모드 보스: 5웨이브마다, 10의 배수는 챕터 보스 순환 (숲 → 설원 → 화산)
const CH_BOSSES = ['boss_forest', 'boss_snow', 'boss_fire'];
export const endlessBoss = n => n % 10 !== 0 ? 'boss' : CH_BOSSES[(n / 10 - 1) % CH_BOSSES.length];
// 대기열에서 처음 보는 종류 (seen: Set) — 신규 몬스터 알림용
export const newTypes = (q, seen) => [...new Set(q)].filter(t => !seen.has(t) && !ETYPES[t].child);
