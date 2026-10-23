// 하드2 테스트: node tests/hard2.test.mjs  (docs/HARD2_2026-10-23.md)
// 1) 모든 하드 스테이지의 매 웨이브 위협(체력 합·초당 피해 합)이 같은 웨이브 노말 4장(폐허) 최댓값보다 큼, 챕터 평균은 1<2<3<4
// 2) 하드 해금 = 노말처럼 표시 순서대로 하나씩 (챕터를 넘어 이어짐), 하드 1-1 = 노말 1장 보스
import * as ST from '../src/data/stages.js';
import * as P from '../src/account/progress.js';
import { avgThreat } from '../src/core/threat.js';
import assert from 'node:assert/strict';
const ids = ch => ST.CHAPTERS.find(c => c.id === ch).stages.map(s => s.id), CH = ST.CHAPTERS.filter(c => c.stages.length).map(c => c.id);
// ---- 난이도 ----
const N4 = ids(4).map(id => ST.STAGES[id]), memo = new Map();
const nMax = n => { if (!memo.has(n)) { const L = N4.filter(x => x.waves >= n).map(x => avgThreat(x, n)); memo.set(n, L.length ? { hp: Math.max(...L.map(t => t.hp)), dps: Math.max(...L.map(t => t.dps)) } : null); } return memo.get(n); };
const tot = (S, h) => { let a = 0, d = 0; for (let n = 1; n <= S.waves; n++) { const t = avgThreat(S, n, h); a += t.hp; d += t.dps; } return [a, d]; };
for (const c of CH) for (const id of ids(c)) { const S = ST.STAGES[id];
  for (let n = 1; n <= S.waves; n++) { const N = nMax(n); if (!N) continue; const h = avgThreat(S, n, true);
    assert.ok(h.hp > N.hp, `하드 ${S.no} w${n} 체력 ${Math.round(h.hp)} <= 노말 4장 ${Math.round(N.hp)}`); assert.ok(h.dps > N.dps, `하드 ${S.no} w${n} 피해 ${Math.round(h.dps)} <= 노말 4장 ${Math.round(N.dps)}`); } }
{ const avg = (c, h) => { const v = ids(c).map(id => tot(ST.STAGES[id], h)); return [v.reduce((a, x) => a + x[0], 0) / v.length, v.reduce((a, x) => a + x[1], 0) / v.length]; };
  for (let i = 1; i < CH.length; i++) { const a = avg(CH[i - 1], true), b = avg(CH[i], true); assert.ok(b[0] > a[0] && b[1] > a[1], `하드 ${CH[i]}장 평균이 ${CH[i - 1]}장보다 커야 함`); }
  // 노말은 그대로: 노말 위협은 하드 설정과 무관
  const S = ST.STAGES['1-1'], t = avgThreat(S, 1); assert.ok(t.hp > 0 && avgThreat(S, 1, true).hp > t.hp * 5); }
// ---- 해금 ----
const r = () => .5, ORD = ST.HARD_ORDER;
assert.deepEqual(ORD, ST.CHAPTERS.flatMap(c => c.stages.map(s => s.id)), '표시 순서');
let s = P.empty(); for (const id of ids(1)) [s] = P.applyStage(s, id, 3, 'mage', r);
for (const c of CH) for (const id of ids(c)) if (c > 1) [s] = P.applyStage(s, id, 3, 'mage', r); // 노말 전부 클리어
assert.ok(ST.hardUnlocked(s, ORD[0])); for (const id of ORD.slice(1)) assert.ok(!ST.hardUnlocked(s, id), `노말 전부 깨도 하드 ${id} 잠김`);
for (const c of CH.slice(1)) { assert.ok(!ST.hardChapterUnlocked(s, c)); assert.match(ST.hardLockText(c), new RegExp(`하드 ${ST.stageNo(ORD[ORD.indexOf(ids(c)[0]) - 1])} `)); }
for (let i = 0; i < ORD.length; i++) { const id = ORD[i]; assert.ok(ST.hardUnlocked(s, id), `하드 ${id} 열림`); if (ORD[i + 1]) { assert.ok(!ST.hardUnlocked(s, ORD[i + 1])); assert.match(ST.hardStageLockText(ORD[i + 1]), new RegExp(`하드 ${ST.stageNo(id)} `)); }
  let info; [s, info] = P.applyStage(s, id, 1, 'mage', r, true); assert.ok(info && info.hard); assert.deepEqual(info.unlocked, ORD[i + 1] ? [ORD[i + 1]] : [], `${id} → 다음`); assert.equal(ST.nextStage(s, id, true), ORD[i + 1] || null); }
// 하드 1-1 은 노말 1장 보스 필요 · 이미 깬 하드 스테이지는 항상 열림 (옛 저장)
{ const t = P.clean({ st: { '1-1': 3 }, hst: { '3-2': 1 } }); assert.ok(!ST.hardUnlocked(t, '1-1')); assert.match(ST.hardStageLockText('1-1'), /노말 1-6 보스/); assert.ok(ST.hardUnlocked(t, '3-2')); assert.ok(ST.hardUnlocked(t, ORD[ORD.indexOf('3-2') + 1])); assert.ok(!ST.hardUnlocked(t, '3-1')); assert.ok(ST.hardChapterUnlocked(t, 3)); }
console.log('hard2 ok');
