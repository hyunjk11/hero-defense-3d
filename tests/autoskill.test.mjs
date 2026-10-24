// ⚡ 스킬 자동 사용 — 순수 판단 로직 (src/core/autoskill.js)
import assert from 'node:assert/strict';
import { skillShape, autoTarget, skillBusy, worthy, AS_MIN } from '../src/core/autoskill.js';
import { TQ, FT } from '../src/data/fighter.js';
import { ADV } from '../src/data/advance.js';
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('OK', name); };
const S = { x: 0, z: 0, dmg: 30 };
const M = (x, z, o = {}) => ({ x, z, hp: 200, max: 200, ...o });
const ring = (cx, cz, n, r = 1) => Array.from({ length: n }, (_, i) => M(cx + Math.cos(i * 2.1) * r, cz + Math.sin(i * 2.1) * r));
t('모든 영웅·전직 Q 에 모양이 있음', () => { for (const c of ['archer', 'mage', 'warrior', 'gunner', 'fighter', 'mechanic']) { const s = skillShape(c, null, 8); assert.ok(['ground', 'self', 'line'].includes(s.kind), c); }
  for (const h in ADV) for (const b in ADV[h]) { const k = ADV[h][b].skill; if (!k) continue; const s = skillShape(h, k, 8); assert.ok(s && s.kind, h + b); } });
t('전직 모양: 저격(직선) · 백호진천권(제자리 TQ.R*.85 지상) · 천룡파(직선) · 진각(지점, 도약 거리)', () => {
  assert.equal(skillShape('gunner', 'pierceshot').kind, 'line'); assert.equal(skillShape('archer', 'snipe').kind, 'line');
  const tq = skillShape('fighter', 'tigerquake'); assert.equal(tq.kind, 'self'); assert.equal(tq.r, TQ.R * .85); assert.ok(tq.ground);
  assert.equal(skillShape('fighter', 'tigerfury').kind, 'self', '옛 id 별칭'); assert.equal(skillShape('fighter', 'dragonwave').kind, 'line');
  const q = skillShape('fighter', null); assert.equal(q.kind, 'ground'); assert.equal(q.reach, FT.qLeap); });
t('적 없음 → 안 씀 (모든 모양)', () => { for (const c of ['archer', 'mage', 'warrior', 'gunner', 'fighter']) for (const k of [null, 'pierceshot', 'tigerquake', 'dragonwave', 'snipe', 'sanct']) assert.equal(autoTarget(skillShape(c, k), S, []), null); });
t('지점 광역: 3+ 밀집 → 무리 중심', () => { const r = autoTarget(skillShape('mage'), S, ring(8, 2, 4)); assert.ok(r); assert.equal(r.why, 'cluster'); assert.ok(r.n >= AS_MIN); assert.ok(Math.hypot(r.x - 8, r.z - 2) < 1.2); });
t('지점 광역: 흩어진 2마리 → 안 씀', () => assert.equal(autoTarget(skillShape('archer'), S, [M(5, 0), M(-6, 3)]), null));
t('지점 광역: 사거리 밖 무리 → 안 씀', () => assert.equal(autoTarget(skillShape('mage'), S, ring(30, 0, 5)), null));
t('지점 광역: 보스 한 마리 → 보스에게', () => { const r = autoTarget(skillShape('mage'), S, [M(6, 1, { boss: true, hp: 5000, max: 5000 })]); assert.equal(r.why, 'boss'); assert.equal(r.x, 6); });
t('지점 광역: 정예 한 마리 → 정예에게', () => assert.equal(autoTarget(skillShape('archer', 'storm'), S, [M(4, 4, { elite: true })]).why, 'elite'));
t('거의 죽은 3마리 무리는 아낌', () => assert.equal(autoTarget(skillShape('mage'), S, ring(6, 0, 3).map(e => ({ ...e, hp: 5 }))), null));
t('제자리 광역: 주변 3+ → 제자리 · 멀면 안 씀', () => { const sh = skillShape('warrior'); assert.equal(autoTarget(sh, S, ring(0, 0, 3, 1.5)).why, 'cluster'); assert.equal(autoTarget(sh, S, ring(10, 0, 5)), null); });
t('백호진천권: 비행 적은 안 셈 (던전 AI 와 같음)', () => { const sh = skillShape('fighter', 'tigerquake'); assert.equal(autoTarget(sh, S, ring(0, 0, 3, 2).map(e => ({ ...e, fly: true }))), null); assert.equal(autoTarget(sh, S, ring(0, 0, 3, 4.8)).why, 'cluster'); });
t('직선(관통 저격): 보스 우선', () => { const r = autoTarget(skillShape('gunner', 'pierceshot', 11.9), S, [M(5, 0), M(-4, 4), M(3, 8, { boss: true, hp: 9000, max: 9000 })]); assert.equal(r.why, 'boss'); assert.equal(r.z, 8); });
t('직선: 한 줄 3+ 관통', () => { const r = autoTarget(skillShape('archer', 'snipe', 11), S, [M(4, 0), M(7, .3), M(10, -.2), M(0, 9)]); assert.equal(r.why, 'line'); assert.ok(r.n >= 3); assert.ok(r.z < 1); });
t('직선: 체력 가장 많은 적', () => { const r = autoTarget(skillShape('gunner', 'pierceshot', 11.9), S, [M(5, 0, { hp: 100, max: 100 }), M(0, -7, { hp: 900, max: 900 })]); assert.equal(r.why, 'hp'); assert.equal(r.z, -7); });
t('직선: 거의 죽은 약한 몹 한 마리 → 안 씀', () => { assert.equal(autoTarget(skillShape('gunner', 'pierceshot', 11.9), S, [M(5, 0, { hp: 8, max: 200 })]), null); assert.equal(worthy({ hp: 8, max: 200 }, 30), false); assert.equal(worthy({ hp: 8, max: 200, boss: true }, 30), true); });
t('천룡파: 직선 · 사거리 안 큰 적', () => { const r = autoTarget(skillShape('fighter', 'dragonwave'), S, [M(8, 0, { hp: 600, max: 600 })]); assert.ok(r); });
t('결정적: 같은 입력 → 같은 출력', () => { const E = ring(5, 5, 6, 2); assert.deepEqual(autoTarget(skillShape('mage', 'meteors'), S, E), autoTarget(skillShape('mage', 'meteors'), S, E)); });
t('skillBusy: 회전·난사·조준·도약·변신 중', () => { assert.equal(skillBusy({}), false); for (const h of [{ spinT: 1 }, { roseT: .5 }, { snipeT: .2 }, { leap: {} }, { mech: { busy: 1 } }, { ft: { leap: {} } }]) assert.equal(skillBusy(h), true); assert.equal(skillBusy({ ft: { leap: null }, mech: { busy: 0 } }), false); });
console.log(`autoskill: ${ok} OK`);
