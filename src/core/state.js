import { QS } from './util.js';

const G = window.G = {
  phase: 'loading', gold: 220, wave: 0, coreHp: 30, coreMax: 30, ups: { atk: 0, spd: 0, rng: 0, skill: 0, bar: 0 },
  tool: 'move', enemies: [], projs: [], towers: [], fxs: [], coins: [], tiles: [], D: null, spawnQ: [], t: 0, shake: 0, night: 0, nightTarget: 0,
  sel: null, timers: [], ready: false, distT: 0, distDirty: false, dirty: new Set(),
  manual: QS.has('test'), classic: QS.has('classic'), stats: { kills: {}, leaked: 0, goldEarned: 0, carvedTiles: 0, distCalcs: 0 },
};
const later = (t, fn) => G.timers.push({ t, fn });

export { G, later };
