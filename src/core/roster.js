// 챕터별 몬스터 구성 → 웨이브 대기열 (순수 로직, node 테스트 가능: tests/roster.test.mjs)
import { ETYPES, ROSTERS, ENDLESS_MIX, rosterShare, NEW_TYPES, NEW_WEIGHT, newShare } from '../data/monsters.js';

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
// 도전 모드 보스: 5웨이브마다, 10의 배수는 챕터 보스 순환 (숲 → 설원 → 화산 → 폐허)
const CH_BOSSES = ['boss_forest', 'boss_snow', 'boss_fire', 'boss_ruins'];
export const endlessBoss = n => n % 10 !== 0 ? 'boss' : CH_BOSSES[(n / 10 - 1) % CH_BOSSES.length];
// 대기열에서 처음 보는 종류 (seen: Set) — 신규 몬스터 알림용
export const newTypes = (q, seen) => [...new Set(q)].filter(t => !seen.has(t) && !ETYPES[t].child);

// ---------- 다음 웨이브 미리보기 (건설 단계 HUD) ----------  게임 난수(rand)를 쓰지 않음 → 판 진행·결정성에 영향 없음
// 반환 { n, boss: 종류|null, list: [{ t, share(0~1 예상 비율), fresh(이번에 처음 열림) }] } — share 큰 순서. waves.js startWave 의 구성 규칙을 확률로 옮긴 것
const ICON0 = { grunt: '💀', imp: '🗡', golem: '🛡', bat: '🦇', boss: '👑' };
export const monIcon = t => (ETYPES[t] && ETYPES[t].icon) || ICON0[t] || '💀';
export function previewWave(stage, n, classic = false) {
  const add = (m, t, w) => { if (w > 0) m.set(t, (m.get(t) || 0) + w); }, out = new Map(); let fresh = [];
  let boss = n % 5 === 0 ? (classic || stage ? 'boss' : endlessBoss(n)) : null;
  const pool = stage && !classic ? rosterPool(stage.ch, stageLevel(stage, n)) : [];
  if (pool.length) { const sum = pool.reduce((a, p) => a + p[1], 0); for (const [t, w] of pool) add(out, t, w / sum);
    const lv = stageLevel(stage, n); fresh = ROSTERS[stage.ch].pool.filter(p => p[2] === lv && lv > 1).map(p => p[0]); }
  else { // 기본 해골 구성 (waves.js: imp 32%, golem 3웨이브~ 14%, bat 4웨이브~ 13%)
    const base = new Map([['imp', .32], ['golem', n >= 3 ? .14 : 0], ['bat', n >= 4 ? .13 : 0]]); base.set('grunt', 1 - [...base.values()].reduce((a, b) => a + b, 0));
    let m = base;
    if (!classic) { const avail = NEW_TYPES.filter(t => n >= ETYPES[t].from), ws = avail.reduce((a, t) => a + NEW_WEIGHT[t], 0), sh = avail.length ? newShare(n) : 0, m2 = new Map();
      for (const [t, p] of m) { if (t === 'bat') { add(m2, t, p); continue; } add(m2, t, p * (1 - sh)); for (const a of avail) add(m2, a, p * sh * NEW_WEIGHT[a] / ws); }
      fresh = avail.filter(t => ETYPES[t].from === n); m = m2;
      if (!stage) { const ep = []; for (const [ch, from, off] of ENDLESS_MIX) if (n >= from) ep.push(...rosterPool(ch, n + off)); const es = ep.reduce((a, p) => a + p[1], 0);
        if (ep.length) { const r = rosterShare(n), m3 = new Map(); for (const [t, p] of m) { const k = t === 'bat' ? r * .5 : r; add(m3, t, p * (1 - k)); for (const [e, w] of ep) add(m3, e, p * k * w / es); } m = m3; } } }
    for (const [t, p] of m) add(out, t, p); }
  if (stage && n === stage.waves) boss = stage.boss && !classic ? ((ROSTERS[stage.ch] && ROSTERS[stage.ch].boss) || 'boss') : 'boss';
  { let z = 0; for (const [t, p] of out) { const v = p * (ETYPES[t].pack || 1); out.set(t, v); z += v; } if (z > 0) for (const [t, p] of out) out.set(t, p / z); } // 무리 몬스터는 한 번 뽑힐 때 pack 마리 → 마릿수 비율
  const list = [...out].filter(([t, p]) => p >= .005 && !ETYPES[t].child).map(([t, p]) => ({ t, share: p, fresh: fresh.includes(t) })).sort((a, b) => (b.fresh - a.fresh) || (b.share - a.share));
  return { n, boss, list };
}
// 짧은 특성 (미리보기 칸에 한두 단어)
export function monTrait(t) { const E = ETYPES[t]; if (!E) return ''; const ab = E.ab || {}, o = [];
  if (E.boss) o.push('보스'); if (E.fly) o.push('비행'); if (E.pack) o.push(`${E.pack}마리 무리`); if (ab.split) o.push('분열'); if (ab.heal) o.push('치유');
  if (ab.root) o.push('타워 묶기'); if (E.ai === 'shield') o.push('방패'); if (ab.shield) o.push('보호막'); if (E.ai === 'digger') o.push('굴착'); if (E.ai === 'charger') o.push('질주');
  if (E.ai === 'bomber') o.push('자폭'); if (E.ai === 'siege') o.push('타워 공격'); if (ab.phase) o.push('무적 순간'); if (ab.perch) o.push('석상 변신'); if (ab.crack) o.push('갑옷');
  if (ab.chill || ab.snowball) o.push('감속'); if (ab.panic) o.push('겁쟁이');
  if (!o.length) { if (E.spd >= 3.3) o.push('빠름'); else if (E.hp >= 280) o.push('튼튼함'); else if (E.armor) o.push('방어'); else o.push('기본'); }
  return o.slice(0, 2).join(' · '); }
