// ================= 던전 순수 로직: 추적 흐름장(BFS) · 어그로 대상 · 역할 AI 판단 (three·DOM 없음 → node 테스트) =================
import { alive } from '../core/party.js';
import { AGGRO_BONUS, AGGRO_R, ROLE } from '../data/dungeon.js';
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// 영웅 칸(sources)에서 걸을 수 있는 칸으로 퍼지는 거리장. pass(c, r) → bool. 막힌/닿지 않는 칸 = 65535
export function bfsField(GW, GH, pass, sources) {
  const F = new Uint16Array(GW * GH).fill(65535), q = [];
  for (const [c, r] of sources) { if (c < 0 || r < 0 || c >= GW || r >= GH) continue; const k = c * GH + r; if (F[k] !== 0) { F[k] = 0; q.push(k); } }
  for (let i = 0; i < q.length; i++) { const k = q[i], c = (k / GH) | 0, r = k % GH, d = F[k] + 1;
    for (const [dc, dr] of D4) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= GW || nr >= GH) continue; const nk = nc * GH + nr; if (F[nk] <= d || !pass(nc, nr)) continue; F[nk] = d; q.push(nk); } }
  return F;
}
// 거리장을 따라 한 칸 내려가기 (가장 작은 이웃, 같으면 D4 순서). 이미 0 이거나 막혔으면 null
export function downhill(F, GW, GH, c, r) { const k0 = c * GH + r; let best = null, bv = F[k0];
  for (const [dc, dr] of D4) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= GW || nr >= GH) continue; const v = F[nc * GH + nr]; if (v < bv) { bv = v; best = [nc, nr]; } }
  return best; }
// 몬스터가 노릴 영웅: 가장 가까운 살아있는 영웅, 단 탱커(세라)는 AGGRO_R 안이면 AGGRO_BONUS 만큼 가깝게 침 (어그로 유지)
export function aggroHero(L, x, z) { let best = null, bd = Infinity;
  for (const h of L || []) { if (!alive(h)) continue; let d = Math.hypot(h.g.position.x - x, h.g.position.z - z); if (ROLE[h.cls] === 'tank' && d < AGGRO_R) d -= AGGRO_BONUS; if (d < bd) { bd = d; best = h; } }
  return best; }
// 밀집 지점: 적 위치 중 반경 r 안에 적이 가장 많은 곳 (같으면 앞쪽). → { x, z, n } 또는 null
export function bestCluster(E, r, from = null, maxD = Infinity) { let best = null;
  for (const a of E) { if (from && Math.hypot(a.x - from.x, a.z - from.z) > maxD) continue; let n = 0, sx = 0, sz = 0; for (const b of E) if (Math.hypot(a.x - b.x, a.z - b.z) <= r) { n++; sx += b.x; sz += b.z; }
    if (!best || n > best.n) best = { x: sx / n, z: sz / n, n }; }
  return best; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 역할 AI 판단 (조작하지 않는 영웅). self = { x, z, range, skillReady }, lead = 조작 영웅 { x, z } (없으면 null), tank = 탱커 { x, z } (없거나 자신이면 null),
// enemies = [{ x, z }] 살아있는 적, backs = 탱커가 지킬 후방 영웅들 [{ x, z }]. → { move: {x,z}|null, skill: {x,z}|null, focus: 적 index|null }
export function rolePlan(role, self, { lead = null, tank = null, enemies = [], backs = [] } = {}) {
  const out = { move: null, skill: null, focus: null }, E = enemies;
  const near = E.length ? E.reduce((b, e, i) => (dist(e, self) < b.d ? { d: dist(e, self), i } : b), { d: Infinity, i: -1 }) : null;
  if (!E.length) { const anchor = role === 'tank' ? lead : tank || lead; if (anchor && dist(anchor, self) > (role === 'tank' ? 3.5 : 4.5)) out.move = { x: anchor.x + (self.x - anchor.x) * .3, z: anchor.z + (self.z - anchor.z) * .3 }; return out; } // 적 없음: 따라가기
  if (role === 'tank') { // 후방(아군 평균)에 가장 가까운 적에게 붙어 막음
    const c = backs.length ? { x: backs.reduce((s, b) => s + b.x, 0) / backs.length, z: backs.reduce((s, b) => s + b.z, 0) / backs.length } : self;
    let ti = 0, td = Infinity; E.forEach((e, i) => { const d = dist(e, c); if (d < td) { td = d; ti = i; } }); const t = E[ti]; out.focus = ti;
    if (dist(t, self) > self.range * .8) out.move = { x: t.x, z: t.z };
    if (self.skillReady && E.filter(e => dist(e, self) <= 3.6).length >= 3) out.skill = { x: self.x, z: self.z };
    return out; }
  if (role === 'bruiser') { // 격투가: 원거리(지상) 적을 먼저 덮치고, 없으면 가장 가까운 지상 적 · 비행만 남으면 장풍 사거리(jp) 안에 서서 충전
    const idx = E.map((e, i) => i), ground = idx.filter(i => !E[i].fly), rg = ground.filter(i => E[i].r), pool = rg.length ? rg : ground;
    if (pool.length) { let ti = pool[0], td = Infinity; for (const i of pool) { const d = dist(E[i], self); if (d < td) { td = d; ti = i; } } out.focus = ti; if (td > self.range * .8) out.move = { x: E[ti].x, z: E[ti].z }; }
    else { const jp = self.jp || 10, f = E[near.i]; if (near.d > jp * .85) { const k = (near.d - jp * .6) / near.d; out.move = { x: self.x + (f.x - self.x) * k, z: self.z + (f.z - self.z) * k }; } }
    if (self.skillReady) { if (self.qSelf) { const n = E.filter(e => !e.fly && dist(e, self) <= self.qSelf).length; if (n >= 3) out.skill = { x: self.x, z: self.z }; } // 백호진천권: 제자리 광역 → 주변 지상 적 3+ 일 때만
      else { const cl = bestCluster(E.filter(e => !e.fly), 3.5, self, 9); if (cl && cl.n >= 3) out.skill = { x: cl.x, z: cl.z }; } }
    return out; }
  // ranged / caster: 너무 가까우면 탱커 쪽(없으면 반대쪽)으로 물러나고, 사거리 밖이면 다가감
  const e0 = E[near.i];
  if (near.d < 4) { let ax = self.x - e0.x, az = self.z - e0.z; if (tank) { ax += (tank.x - self.x) * .25; az += (tank.z - self.z) * .25; } const L = Math.hypot(ax, az) || 1; out.move = { x: self.x + ax / L * 4, z: self.z + az / L * 4 }; }
  else if (near.d > self.range * .95) { const k = (near.d - self.range * .75) / near.d; out.move = { x: self.x + (e0.x - self.x) * k, z: self.z + (e0.z - self.z) * k }; }
  if (role === 'caster') { const cl = bestCluster(E, 2.2, self, self.range); if (cl && cl.n >= 2) { let bi = -1, bd = Infinity; E.forEach((e, i) => { const d = dist(e, cl); if (d < bd && dist(e, self) <= self.range) { bd = d; bi = i; } }); if (bi >= 0) out.focus = bi; } }
  if (self.skillReady) { const cl = bestCluster(E, role === 'caster' ? 4.5 : 4, self, 15); if (cl && cl.n >= 3) out.skill = { x: cl.x, z: cl.z }; }
  return out;
}
