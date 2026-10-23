// 피해 미터 (순수 · 할당 없음 → tests/stats.test.mjs). monsters/enemy.js hurt() 가 실제로 깎인 체력만 기록 (밸런스·난수 영향 없음)
// 최근 5초 DPS = 0.5초 칸 10개 링 버퍼 (시간 = G.t 게임 시간 → 배속·일시정지와 맞음)
export const BUCKET = .5, NB = 10, WIN = BUCKET * NB;
export function newMeter(t0 = 0) { return { tot: 0, sk: 0, max: 0, kills: 0, hits: 0, taken: 0, takenN: 0, b: new Float64Array(NB), bi: Math.floor(t0 / BUCKET), t0 }; }
export function resetMeter(m, t0 = 0) { m.tot = m.sk = m.max = m.kills = m.hits = m.taken = m.takenN = 0; m.b.fill(0); m.bi = Math.floor(t0 / BUCKET); m.t0 = t0; return m; }
// 칸 이동: 지난 칸은 0으로 (시간이 거꾸로 가면 = 새 판, 전부 비움)
function roll(m, t) { const i = Math.floor(t / BUCKET); if (i === m.bi) return i;
  if (i < m.bi) { m.b.fill(0); m.bi = i; m.t0 = Math.min(m.t0, t); return i; }
  const n = Math.min(NB, i - m.bi); for (let k = 1; k <= n; k++) m.b[(((m.bi + k) % NB) + NB) % NB] = 0; m.bi = i; return i; }
// d = 실제 피해, sk = 스킬(기본 공격 아님), kill = 이 피해로 처치
export function meterAdd(m, d, t, sk, kill) { if (!(d > 0)) { if (kill) m.kills++; return; } const i = roll(m, t); m.b[((i % NB) + NB) % NB] += d; m.tot += d; if (sk) m.sk += d; if (d > m.max) m.max = d; m.hits++; if (kill) m.kills++; }
// 최근 WIN초 DPS (판 시작 직후는 지난 시간으로 나눔, 최소 1칸)
export function meterDps(m, t) { roll(m, t); let s = 0; for (let k = 0; k < NB; k++) s += m.b[k]; const span = Math.min(WIN - BUCKET + (t - Math.floor(t / BUCKET) * BUCKET), Math.max(BUCKET, t - m.t0)); return s / span; }
export const skillShare = m => (m.tot > 0 ? m.sk / m.tot : 0);
// 받은 피해 (영웅이 실제로 잃은 체력 · hero.js heroDamage)
export function meterTaken(m, d) { if (d > 0) { m.taken += d; m.takenN++; } }
// 타워별 피해: tw.dmT / tw.dmK (hurt() 가 기록) · 피해를 준 타워는 list(G.dmTowers) 에 한 번만 → 판매·파괴돼도 결과 화면에 남음
export function towerAdd(list, tw, d, kill) { if (!tw.dmT && !tw.dmK && list) list.push(tw); tw.dmT = (tw.dmT || 0) + (d > 0 ? d : 0); if (kill) tw.dmK = (tw.dmK || 0) + 1; }
// 웨이브 기록 log = G.waveLog [{ n, t0, t1 }] (t1 = -1 진행 중) · 다음 웨이브 시작 = 이전 웨이브 닫음
export function waveEnd(log, t) { const w = log && log[log.length - 1]; if (w && w.t1 < 0) w.t1 = t; }
export function waveStart(log, n, t) { if (!log) return; waveEnd(log, t); log.push({ n, t0: t, t1: -1 }); }
export const waveTime = w => (w.t1 >= 0 ? w.t1 - w.t0 : -1);
