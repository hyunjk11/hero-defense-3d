import { QS } from './util.js';

const G = window.G = {
  phase: 'loading', gold: 220, wave: 0, coreHp: 30, coreMax: 30, ups: { atk: 0, spd: 0, rng: 0, skill: 0, bar: 0 },
  tool: 'move', enemies: [], projs: [], towers: [], fxs: [], coins: [], tiles: [], D: null, spawnQ: [], t: 0, shake: 0, night: 0, nightTarget: 0,
  sel: null, timers: [], ready: false, distT: 0, distDirty: false, dirty: new Set(),
  manual: QS.has('test'), grow: QS.has('grow'), research: null, classic: QS.has('classic'), stats: { kills: {}, leaked: 0, goldEarned: 0, carvedTiles: 0, distCalcs: 0 },
};
// 예약 실행: 예약한 영웅 문맥(G.curHero)을 기억 → 실행 때 같은 영웅으로 (파티). 단일 영웅이면 항상 같은 영웅이라 기존과 동일
const later = (t, fn) => G.timers.push({ t, fn, h: G.curHero });
const runTimer = tm => { if (tm.h && tm.h !== G.curHero && G.withHero) G.withHero(tm.h, tm.fn); else tm.fn(); };
// 영웅 이펙트 목록: push 한 영웅 문맥으로 콜백 실행 (전설·전직·총사·메카닉·고유 FX). 단일 영웅이면 콜백을 그대로 넣음
function heroFx() { const a = []; const push0 = a.push;
  a.push = (...fns) => push0.apply(a, fns.map(fn => { const h = G.curHero; return dt => (h && h !== G.curHero && G.withHero) ? G.withHero(h, () => fn(dt)) : fn(dt); }));
  return a; }

export { G, later, runTimer, heroFx };
