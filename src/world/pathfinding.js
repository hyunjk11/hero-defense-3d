import { CORE, DIRS, GH, GW, T, inGrid, isBlock } from '../core/grid.js';
import { G } from '../core/state.js';
import { PATH_PROFILES } from '../data/paths.js';
import { tileAt } from './terrain.js';
import { drawRoute } from '../render/route.js';

// ================= 경로 탐색 =================
// 목표(코어 또는 타워) 기준 다익스트라 거리장(flow field)을 프로필별로 캐시.
// - default 프로필(G.D)은 기존과 동일한 시점에 즉시 재계산 (computeDist)
// - 다른 프로필은 필요할 때 지연 재계산: 구조 변경(굴착/건설/파괴) 시 즉시, 블록 체력 변화만 있으면 0.35초 간격으로 스로틀
const DEF = PATH_PROFILES.default;
function enterCost(t, P = DEF) {
  if (t.tower || t.t === T.BEDROCK) return Infinity;
  let c = t.t === T.GRASS ? P.grass : t.t === T.CARVED ? P.carved : P.base;
  if (t.bar) c += P.barBase + t.bar.hp / P.barDiv; if (isBlock(t.t)) c += P.blockBase + t.hp / P.blockDiv; return c;
}
class Heap { constructor() { this.a = []; } push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; } get size() { return this.a.length; } }
const PS = { calls: 0, ms: 0, max: 0, byKey: {} }; G.pathStats = PS;
function dijkstra(extraBlock, P = DEF, goals = null) {
  const t0 = performance.now(), D = new Float64Array(GW * GH).fill(Infinity), h = new Heap();
  if (goals) for (const [c, r] of goals) { D[c * GH + r] = 0; h.push([0, c, r]); } else { D[CORE[0] * GH + CORE[1]] = 0; h.push([0, CORE[0], CORE[1]]); }
  while (h.size) { const [d, c, r] = h.pop(); if (d > D[c * GH + r]) continue; const cu = enterCost(tileAt(c, r), P);
    for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (!inGrid(nc, nr)) continue; const nt = tileAt(nc, nr); if (nt === extraBlock || enterCost(nt, P) === Infinity) continue;
      const nd = d + cu; if (nd < D[nc * GH + nr]) { D[nc * GH + nr] = nd; h.push([nd, nc, nr]); } } }
  const ms = performance.now() - t0; PS.calls++; PS.ms += ms; PS.max = Math.max(PS.max, ms); return D;
}
// 캐시 무효화: structural=true 는 칸 종류/타워/바리케이드 배치 변화
G.pathVer = 0; G.structVer = 0;
function invalidatePaths(structural) { G.pathVer++; if (structural) G.structVer++; }
function computeDist() { G.stats.distCalcs++; invalidatePaths(true); G.D = dijkstra(); G.distDirty = false; drawRoute(); }
const dAt = (c, r) => G.D[c * GH + r];
const fields = {};
function towerGoals() { const s = []; for (const tw of G.towers) if (!tw.dead) for (const [dc, dr] of DIRS) { const c = tw.c + dc, r = tw.r + dr; if (inGrid(c, r) && enterCost(tileAt(c, r)) !== Infinity) s.push([c, r]); } return s; }
// 프로필 거리장 (default 는 G.D 그대로)
function field(key) {
  if (key === 'default' || !PATH_PROFILES[key]) return G.D;
  const P = PATH_PROFILES[key]; let f = fields[key];
  const stale = !f || f.sv !== G.structVer || (f.pv !== G.pathVer && G.t - f.t >= .35);
  if (stale) { let goals = null; if (P.goal === 'towers') { goals = towerGoals(); if (!goals.length) goals = null; }
    f = fields[key] = { D: goals || P.goal !== 'towers' ? dijkstra(null, P, goals) : null, sv: G.structVer, pv: G.pathVer, t: G.t, towers: !!goals };
    if (!f.D) f.D = G.D; PS.byKey[key] = (PS.byKey[key] || 0) + 1; }
  return f.D;
}
function fieldInfo(key) { field(key); return fields[key]; }
function nextStep(c, r, key = 'default') {
  const P = PATH_PROFILES[key] || DEF, D = field(key); let best = null, bs = Infinity;
  for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (!inGrid(nc, nr)) continue; const t = tileAt(nc, nr), ec = enterCost(t, P); if (ec === Infinity) continue; const s = ec + D[nc * GH + nr]; if (s < bs) { bs = s; best = [nc, nr]; } }
  return best;
}

export { enterCost, Heap, dijkstra, computeDist, dAt, nextStep, field, fieldInfo, invalidatePaths, PS as pathStats };
