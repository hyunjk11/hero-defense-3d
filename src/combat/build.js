// 건설 규칙 (C-11: ui/input.js 에서 분리 — 동작 불변). 도구 비용·불가 사유·경로 차단 검사
import { GH, SPAWNS, T, inGrid, isBlock, toTile } from '../core/grid.js';
import { BLK } from '../data/terrain.js';
import { TOWERS, BARRICADE } from '../data/towers.js';
import { G } from '../core/state.js';
import { tileAt } from '../world/terrain.js';
import { dijkstra } from '../world/pathfinding.js';
import { hero } from '../heroes/hero.js';
export function occupied(c, r) {
  if (G.enemies.some(e => !e.dead && !e.E.fly && ((e.tile[0] === c && e.tile[1] === r) || (e.next && e.next[0] === c && e.next[1] === r)))) return true;
  if (hero && hero.dead <= 0) { const [hc, hr] = toTile(hero.g.position.x, hero.g.position.z); if (hc === c && hr === r) return true; } return false;
}
export function toolCost(t) { const tool = G.tool; return TOWERS[tool] ? TOWERS[tool].cost : tool === 'barricade' ? BARRICADE.cost : tool === 'clear' && isBlock(t.t) ? clearCost(t) : 0; }
// 폐허 고대 성벽: 바위보다 단단하고 개간 비용도 큼
export function clearCost(t) { return t.wall ? 60 : BLK[t.t].clear; }
export function blkName(t) { return t.wall ? '고대 성벽' : BLK[t.t].n; }
export const TOOLN = { barricade: '바리케이드', clear: '개간' };
// 불가 사유 (가능하면 null)
export function buildReason(c, r) {
  if (!inGrid(c, r)) return '맵 밖'; const t = tileAt(c, r), tool = G.tool, cost = toolCost(t);
  if (TOWERS[tool] || tool === 'barricade') {
    if (t.tower) return '이미 타워가 있음'; if (t.bar) return '이미 바리케이드가 있음';
    if (TOWERS[tool] && t.t !== T.GRASS) return isBlock(t.t) ? '지형 블록 (먼저 개간)' : t.t === T.CARVED ? '파인 길 (바리케이드만 가능)' : '건설 불가 지형';
    if (tool === 'barricade' && t.t !== T.CARVED && t.t !== T.GRASS) return isBlock(t.t) ? '지형 블록' : '설치 불가 지형';
    if (occupied(c, r)) return '유닛이 서 있음'; if (G.gold < cost) return `골드 부족 (${cost - G.gold}G 더 필요)`;
    if (TOWERS[tool] && !canBuild(c, r)) return '경로 차단'; return null; }
  if (tool === 'clear') { if (!isBlock(t.t)) return t.t === T.BEDROCK ? '파괴 불가 암반' : '개간할 블록 없음'; if (G.gold < cost) return `골드 부족 (${cost - G.gold}G 더 필요)`; return null; }
  return '도구 없음';
}
export function canBuild(c, r) {
  if (!inGrid(c, r)) return false; const t = tileAt(c, r), tool = G.tool;
  if (TOWERS[tool]) { if (t.t !== T.GRASS || t.tower || t.bar || G.gold < TOWERS[tool].cost || occupied(c, r)) return false; const D = dijkstra(t); return SPAWNS.every(s => isFinite(D[s[0] * GH + s[1]])); }
  if (tool === 'barricade') return (t.t === T.CARVED || t.t === T.GRASS) && !t.tower && !t.bar && G.gold >= BARRICADE.cost && !occupied(c, r);
  if (tool === 'clear') return isBlock(t.t) && G.gold >= clearCost(t);
  return false;
}
