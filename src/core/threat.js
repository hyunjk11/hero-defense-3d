// 웨이브 위협도 (순수 로직, node: tests/hard2.test.mjs) — core/waves.js startWave 의 대기열·체력 배수·하드 정예/보스 보정을 그대로 따라 계산
// threat = { hp: 웨이브 몬스터 실제 체력 합, dps: 근접 피해 합, n: 마리 수 } — 하드/노말 난이도 비교표(docs/HARD2_2026-10-23.md)용
import { ETYPES, ROSTERS } from '../data/monsters.js';
import { HARD, hardHp, hardDmg, hardView } from '../data/stages.js';
import { stageWave, applyElites } from './roster.js';
const chapterBoss = ch => (ROSTERS[ch] && ROSTERS[ch].boss) || 'boss';
export function waveQueue(S, n, rand) {
  const count = 8 + n * 3, boss = n % 5 === 0, q = stageWave(S, n, count, rand) || Array(count).fill('grunt');
  if (n === S.waves && !boss) q.splice(Math.floor(count / 2), 0, 'boss'); if (S.boss && n === S.waves) q.push(chapterBoss(S.ch));
  if (boss && !(S.boss && n === S.waves)) q.splice(Math.floor(count / 2), 0, 'boss'); return q;
}
export function waveThreat(S, n, hard = false, rand = Math.random) {
  const V = hard ? hardView(S) : S, q = waveQueue(V, n, rand), el = hard ? applyElites(V, n, q) : q.map(() => false), mul = Math.pow(1.16, n - 1) * S.hp * (hard ? hardHp(n, S.ch) : 1);
  let hp = 0, dps = 0; q.forEach((t, i) => { const E = ETYPES[t]; if (!E) return; let h = E.hp, d = E.dps || 0;
    if (hard) { if (E.boss && t !== 'boss') h *= HARD.bossHp; if (el[i]) h *= HARD.eliteHp; d *= hardDmg(S.ch); } hp += h * mul; dps += d; });
  return { hp, dps, n: q.length };
}
// 여러 시드 평균 (구성 난수 영향 제거)
export function avgThreat(S, n, hard = false, seeds = 24) { let a = { hp: 0, dps: 0, n: 0 };
  for (let k = 1; k <= seeds; k++) { let s = k * 7919; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; const t = waveThreat(S, n, hard, r); a.hp += t.hp; a.dps += t.dps; a.n += t.n; }
  return { hp: a.hp / seeds, dps: a.dps / seeds, n: a.n / seeds }; }
