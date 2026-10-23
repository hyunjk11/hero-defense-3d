// 판 종료 통계 (순수 · DOM 없음 → tests/endstats.test.mjs) — combat/meter.js 가 판 동안 기록한 값을 결과 화면용으로 모음
// 입력: heroes [{ cls, nm, icon, dm, dead }] · other(G.dmOther) · towers(G.dmTowers 를 { type, stars, branch, n, icon, dmT, dmK, gone } 로) · waves(G.waveLog) · t(종료 게임 시간)
export const TOWER_IC = { arrow: '🏹', cannon: '💣', magic: '🔮' };
export const TOP_TOWERS = 6;
const num = v => (Number.isFinite(v) ? v : 0);
// 전투 시간 = 웨이브 시간 합 (진행 중 웨이브는 t 까지) · 웨이브 기록이 없으면 판 시간 (t − t0)
export function combatTime(waves, t, t0 = 0) { let s = 0; for (const w of waves || []) { const e = w.t1 >= 0 ? w.t1 : t; if (e > w.t0) s += e - w.t0; } return s > 0 ? s : Math.max(0, t - t0); }
export function aggregate({ heroes = [], other = null, towers = [], waves = [], t = 0, dungeon = false } = {}) {
  const tt0 = heroes.reduce((a, h) => Math.min(a, h.dm ? num(h.dm.t0) : a), Infinity), span = combatTime(waves, t, Number.isFinite(tt0) ? tt0 : 0), sec = Math.max(1, span);
  const H = heroes.map(h => { const m = h.dm || {}, tot = num(m.tot); return { cls: h.cls, nm: h.nm || h.cls, icon: h.icon || '', dead: !!h.dead, tot, dps: tot / sec, max: num(m.max), kills: num(m.kills), taken: num(m.taken), hits: num(m.hits), sk: num(m.sk), skPct: tot > 0 ? num(m.sk) / tot : 0 }; });
  const oTot = other ? num(other.tot) : 0, team = H.reduce((a, h) => a + h.tot, 0) + oTot, maxHero = Math.max(0, ...H.map(h => h.tot));
  H.forEach(h => { h.share = team > 0 ? h.tot / team : 0; h.bar = maxHero > 0 ? h.tot / maxHero : 0; });
  const T = towers.filter(x => num(x.dmT) > 0 || num(x.dmK) > 0).map(x => ({ type: x.type, n: x.n || x.type, icon: x.icon || TOWER_IC[x.type] || '🗼', stars: x.stars || 1, branch: x.branch || null, dmT: num(x.dmT), dmK: num(x.dmK), gone: !!x.gone })).sort((a, b) => b.dmT - a.dmT || b.dmK - a.dmK);
  const tMax = T.length ? T[0].dmT : 0; T.forEach(x => { x.bar = tMax > 0 ? x.dmT / tMax : 0; x.share = oTot > 0 ? x.dmT / oTot : 0; });
  const W = (waves || []).map(w => { const done = w.t1 >= 0, s = Math.max(0, (done ? w.t1 : t) - w.t0); return { n: w.n, sec: s, done }; });
  const wMax = Math.max(0, ...W.map(w => w.sec)); W.forEach(w => { w.bar = wMax > 0 ? w.sec / wMax : 0; });
  const doneW = W.filter(w => w.done);
  return { heroes: H, team, other: { tot: oTot, kills: other ? num(other.kills) : 0, label: dungeon ? '합동 공격' : '타워' }, towers: T.slice(0, TOP_TOWERS), towersMore: Math.max(0, T.length - TOP_TOWERS), towerCount: T.length, waves: W, span,
    fastest: doneW.length ? doneW.reduce((a, b) => (b.sec < a.sec ? b : a)) : null, slowest: doneW.length ? doneW.reduce((a, b) => (b.sec > a.sec ? b : a)) : null, dungeon };
}
// 표시 형식
const r1 = v => Math.round(v * 10) / 10;
export const fmtBig = v => { v = num(v); return v >= 1e6 ? `${r1(v / 1e6)}M` : v >= 1e4 ? `${r1(v / 1e3)}k` : Math.round(v).toLocaleString('ko-KR'); };
export const fmtDps = v => { v = num(v); return v >= 1e4 ? fmtBig(v) : v >= 100 ? String(Math.round(v)) : String(r1(v)); };
export const fmtPct = v => `${Math.round(num(v) * 100)}%`;
export const fmtTime = s => { s = Math.max(0, num(s)); if (s < 60) return `${r1(s)}초`; const m = Math.floor(s / 60), x = Math.round(s - m * 60); return x === 60 ? `${m + 1}분 0초` : `${m}분 ${x}초`; };
export const fmtClock = s => { s = Math.max(0, Math.round(num(s))); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const waveLabel = n => (typeof n === 'string' ? n : `W${n}`);
