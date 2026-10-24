// ⚡ 스킬 자동 사용 (2026-10-24) — 순수 판단 로직 (three·DOM 없음 → node 테스트 tests/autoskill.test.mjs)
// 런타임(토글·HUD·매 틱 판단 → castSkill) = heroes/autoskill.js. 던전 파티 AI(dungeon/logic.js rolePlan)의 밀집 판정 bestCluster 와 백호진천권 qSelf(TQ.R*.85)를 그대로 씀
import { bestCluster } from '../dungeon/logic.js';
import { FT, TQ, DW, ftSkillId } from '../data/fighter.js';
export const AS_TICK = .25;   // 판단 주기 (초, 게임 시간)
export const AS_MIN = 3;      // 광역: 범위 안 적 3+ (또는 보스·정예)
export const AS_LINE_MIN = 3; // 직선: 한 줄에 3+ 관통
// 시전 중(채널·도약·변신·조준·회전) — 던전 파티 AI 와 같은 판정 (dungeon/run.js partyAI 도 이 함수를 씀)
export const skillBusy = h => !!(h.spinT > 0 || h.roseT > 0 || h.snipeT > 0 || h.leap || (h.mech && h.mech.busy > 0) || (h.ft && h.ft.leap));
// 스킬 모양: kind 'ground'(지점 광역: r 판정 반경 · reach 최대 시전 거리) | 'self'(제자리 광역/버프: r) | 'line'(직선 관통: len · w 반폭 · reach 대상 찾는 거리)
// ground: true = 지상 적만 셈 (비행은 안 맞음). r 은 실제 피해 반경보다 조금 작게 (가장자리 적은 셈에서 뺌)
export function skillShape(cls, skill, range = 8) {
  const k = cls === 'fighter' ? ftSkillId(skill) : skill;
  switch (k) {
    case 'storm': return { kind: 'ground', r: 4.6, reach: 16 };             // 실바 바람의 순찰자: 폭풍 화살비 (반경 5.5)
    case 'snipe': return { kind: 'line', len: 32, w: 1.1, reach: Math.max(14, range * 1.2) }; // 실바 매의 눈: 일섬 저격 (직선 관통 600%)
    case 'meteors': return { kind: 'ground', r: 4.2, reach: 16 };           // 루나 업화: 유성우
    case 'glacier': return { kind: 'ground', r: 4.4, reach: 16 };           // 루나 서리: 빙하 낙하 (반경 5 빙결)
    case 'sanct': return { kind: 'self', r: 3.2 };                          // 세라 성기사: 성역 (반경 3.5, 4초)
    case 'bloodspin': return { kind: 'self', r: 3.9 };                      // 세라 광전사: 피의 회오리 (반경 4.3)
    case 'rose+': return { kind: 'self', r: Math.min(7, range * .85) };     // 로즈 결투가: 로즈 피니시+ (사방 난사)
    case 'pierceshot': return { kind: 'line', len: 32, w: 1.1, reach: Math.max(14, range * 1.1) }; // 로즈 저격수: 관통 저격
    case 'tigerquake': return { kind: 'self', r: TQ.R * .85, ground: true }; // 서윤 백호권성: 백호진천권 (던전 AI 와 같은 5.1)
    case 'dragonwave': return { kind: 'line', len: DW.len, w: DW.w, reach: 14 }; // 서윤 천기권사: 천룡파 (유도 관통)
  }
  switch (cls) {
    case 'archer': return { kind: 'ground', r: 3.6, reach: 16 };            // 화살비 (반경 4.2)
    case 'mage': return { kind: 'ground', r: 4.0, reach: 16 };              // 메테오 (반경 4.8)
    case 'warrior': return { kind: 'self', r: 3.0 };                        // 회오리 베기
    case 'gunner': return { kind: 'self', r: Math.min(6.5, range * .8) };   // 로즈 피니시 (사방 난사)
    case 'fighter': return { kind: 'ground', r: FT.qR * .8, reach: FT.qLeap, ground: true }; // 냥냥 진각 (최대 9 도약 → 반경 4.5)
    case 'mechanic': return { kind: 'self', r: 6 };                         // 변신 (숨김 영웅)
  }
  return { kind: 'ground', r: 3.5, reach: 12 };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const big = e => !!(e.boss || e.elite);
// 맞힐 가치: 보스·정예, 또는 체력이 넉넉한 적 (거의 죽은 약한 몹 한 마리에 낭비 금지)
export const worthy = (e, dmg = 0) => big(e) || (e.hp >= Math.max(1, dmg * 2) && e.hp >= (e.max || e.hp) * .35);
// 무리 전체 체력이 기본 공격 1.5방도 안 되면(거의 다 죽은 몹들) 아낌
const sumOk = (L, dmg) => L.reduce((s, e) => s + (e.hp || 0), 0) >= dmg * 1.5;
const bestBig = L => L.filter(big).sort((a, b) => (b.boss ? 1 : 0) - (a.boss ? 1 : 0) || b.hp - a.hp)[0] || null;
// self = { x, z, dmg } (dmg = 기본 공격 피해), enemies = [{ x, z, hp, max, boss, elite, fly }] (살아있는 적만)
// → { x, z, why, n } 시전 지점 또는 null (쏘지 않음)
export function autoTarget(shape, self, enemies) {
  const dmg = self.dmg || 0; let E = enemies || []; if (shape.ground) E = E.filter(e => !e.fly); if (!E.length) return null;
  if (shape.kind === 'self') {
    const inR = E.filter(e => dist(e, self) <= shape.r); if (!inR.length) return null;
    if (inR.length >= AS_MIN && sumOk(inR, dmg)) return { x: self.x, z: self.z, why: 'cluster', n: inR.length };
    const b = bestBig(inR); return b ? { x: self.x, z: self.z, why: b.boss ? 'boss' : 'elite', n: inR.length } : null;
  }
  if (shape.kind === 'ground') {
    const inReach = E.filter(e => dist(e, self) <= shape.reach + shape.r * .5); if (!inReach.length) return null;
    const cl = bestCluster(inReach, shape.r, self, shape.reach);
    if (cl && cl.n >= AS_MIN && dist(cl, self) <= shape.reach + .5) { const mem = inReach.filter(e => dist(e, cl) <= shape.r); if (sumOk(mem, dmg)) return { x: cl.x, z: cl.z, why: 'cluster', n: cl.n }; }
    const b = bestBig(inReach.filter(e => dist(e, self) <= shape.reach)); if (!b) return null;
    const n = inReach.filter(e => dist(e, b) <= shape.r).length; return { x: b.x, z: b.z, why: b.boss ? 'boss' : 'elite', n };
  }
  // line: 보스·정예 → 한 줄에 3+ → 가장 체력 많은 '가치 있는' 적
  const inReach = E.filter(e => { const d = dist(e, self); return d > .3 && d <= shape.reach; }); if (!inReach.length) return null;
  const onLine = t => { const dx = t.x - self.x, dz = t.z - self.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    return E.filter(e => { const px = e.x - self.x, pz = e.z - self.z, along = px * ux + pz * uz; return along > -.3 && along <= shape.len && Math.abs(px * uz - pz * ux) <= shape.w; }).length; };
  const b = bestBig(inReach); if (b) return { x: b.x, z: b.z, why: b.boss ? 'boss' : 'elite', n: onLine(b) };
  let best = null, bn = 0; for (const e of inReach) { const n = onLine(e); if (n > bn || (n === bn && best && e.hp > best.hp)) { bn = n; best = e; } }
  if (best && bn >= AS_LINE_MIN) return { x: best.x, z: best.z, why: 'line', n: bn };
  const top = inReach.filter(e => worthy(e, dmg)).sort((a, b2) => b2.hp - a.hp)[0];
  return top ? { x: top.x, z: top.z, why: 'hp', n: onLine(top) } : null;
}
