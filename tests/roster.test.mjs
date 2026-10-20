// 챕터 몬스터 구성 (순수 로직): node tests/roster.test.mjs
import assert from 'node:assert/strict';
import { ETYPES, ROSTERS, rosterTypes } from '../src/data/monsters.js';
import { CHAPTERS, STAGES } from '../src/data/stages.js';
import { stageWave, endlessMix, endlessBoss, rosterPool, stageLevel, newTypes } from '../src/core/roster.js';
let seed = 7; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// 데이터 무결성: 구성의 모든 종류가 존재, 능력 수치가 유한, 분열 대상 존재, 화산/폐허도 미리 정의
for (const [ch, R] of Object.entries(ROSTERS)) { assert.ok(ETYPES[R.boss] && ETYPES[R.boss].boss, `boss ${ch}`); for (const [t, w, from] of R.pool) { assert.ok(ETYPES[t], `${ch}:${t}`); assert.ok(w > 0 && from >= 1); } }
for (const [k, E] of Object.entries(ETYPES)) { for (const f of ['hp', 'spd', 'gold', 'core', 'h']) assert.ok(Number.isFinite(E[f]) && E[f] >= 0, `${k}.${f}`); if (E.ab && E.ab.split) assert.ok(ETYPES[E.ab.split.type] && ETYPES[E.ab.split.type].child, k);
  if (E.ab) for (const v of Object.values(E.ab)) for (const x of Object.values(v)) if (typeof x === 'number') assert.ok(Number.isFinite(x), k); if (!E.child && E.ab) assert.ok(E.desc && E.icon, `${k} desc/icon`); }
assert.ok(ROSTERS[3] && ROSTERS[4] && ROSTERS[3].ready && ROSTERS[4].ready && ROSTERS[3].boss === 'boss_fire' && ROSTERS[4].boss === 'boss_ruins');
// 준비된 챕터 = 스테이지가 있는 챕터
for (const ch of CHAPTERS) assert.equal(!!(ROSTERS[ch.id] && ROSTERS[ch.id].ready), ch.stages.length > 0, `ch${ch.id} ready`);
// 스테이지별: 해당 챕터 구성만, 웨이브 마릿수 >= count, 무리는 3마리 단위
for (const ch of CHAPTERS.filter(c => c.stages.length)) { const allowed = new Set(rosterTypes(ch.id)); const seen = new Set();
  for (const s0 of ch.stages) { const s = STAGES[s0.id]; for (let n = 1; n <= s.waves; n++) { const count = 8 + n * 3, q = stageWave(s, n, count, rand);
    assert.ok(q.length >= count && q.length <= count + 4, `${s.id} w${n} ${q.length}`); q.forEach(t => { assert.ok(allowed.has(t), `${s.id}:${t}`); seen.add(t); });
    let run = 0, pt = null; for (let i = 0; i <= q.length; i++) { if (q[i] && ETYPES[q[i]].pack && (run === 0 || q[i] === pt)) { run++; pt = q[i]; } else { if (pt) assert.equal(run % ETYPES[pt].pack, 0, `${s.id} w${n} pack`); run = 0; pt = null; if (q[i] && ETYPES[q[i]].pack) { run = 1; pt = q[i]; } } }
    const lv = stageLevel(s, n); for (const t of q) assert.ok(rosterPool(ch.id, lv).some(p => p[0] === t), `${t} before its level`); } }
  for (const t of ROSTERS[ch.id].pool.map(p => p[0])) assert.ok(seen.has(t), `ch${ch.id} never spawns ${t}`); }
// 첫 스테이지 1웨이브는 약한 몬스터만 (고블린/병사/도적)
assert.ok(stageWave(STAGES['1-1'], 1, 11, rand).every(t => ['goblin', 'grunt', 'imp'].includes(t)));
// 도전 모드: 초반 숲만, 6웨이브부터 설원 섞임, 보스 순환
const snow = new Set(['icewolf', 'yeti', 'wisp', 'frostgolem']);
for (let n = 1; n <= 5; n++) assert.ok(!endlessMix(Array(30).fill('grunt'), n, rand).some(t => snow.has(t)), `endless w${n}`);
let snowSeen = 0; for (let n = 6; n <= 15; n++) snowSeen += endlessMix(Array(30).fill('grunt'), n, rand).filter(t => snow.has(t)).length; assert.ok(snowSeen > 10);
assert.equal(endlessBoss(30), 'boss_fire'); assert.equal(endlessBoss(40), 'boss_ruins'); assert.equal(endlessBoss(50), 'boss_forest');
const volc = new Set(['ember_slime', 'firebomber', 'lavahound', 'magmagolem']);
for (let n = 1; n <= 11; n++) assert.ok(!endlessMix(Array(30).fill('grunt'), n, rand).some(t => volc.has(t)), `endless volcano w${n}`);
let volcSeen = 0; for (let n = 12; n <= 20; n++) volcSeen += endlessMix(Array(30).fill('grunt'), n, rand).filter(t => volc.has(t)).length; assert.ok(volcSeen > 10, 'volcano in endless');
assert.equal(endlessBoss(5), 'boss'); assert.equal(endlessBoss(10), 'boss_forest'); assert.equal(endlessBoss(20), 'boss_snow'); assert.equal(endlessBoss(15), 'boss');
// 폐허: 19웨이브까지 안 나오고, 20웨이브부터 섞임 (석상 가고일·망령·덩굴)
const ruin = new Set(['gargoyle', 'wraith', 'ruinroot']);
for (let n = 1; n <= 19; n++) assert.ok(!endlessMix(Array(30).fill('grunt'), n, rand).some(t => ruin.has(t)), `endless ruins w${n}`);
let ruinSeen = 0; for (let n = 20; n <= 30; n++) ruinSeen += endlessMix(Array(30).fill('grunt'), n, rand).filter(t => ruin.has(t)).length; assert.ok(ruinSeen > 8, 'ruins in endless ' + ruinSeen);
// 폐허 능력 데이터: 석상화는 껍질이 있을 때만(능력 수치), 망령 실체 소멸·어둠 보호막, 보스 소환 대상 존재
assert.ok(ETYPES.gargoyle.ab.perch && ETYPES.gargoyle.ab.crack && ETYPES.wraith.fly && ETYPES.wraith.ab.phase && ETYPES.wraith.ab.shield.dark && ETYPES.ruinroot.ab.root.n === 2);
assert.ok(ETYPES[ETYPES.boss_ruins.ab.summon.type] && ETYPES.boss_ruins.ab.curse && ETYPES.boss_ruins.ab.dread.at === .5 && ETYPES.boss_ruins.n === '망국의 왕');
assert.ok(ETYPES.boss_ruins.hp > ETYPES.boss_fire.hp);
assert.deepEqual(newTypes(['goblin', 'slime', 'slime_s', 'goblin'], new Set(['goblin'])), ['slime']);
console.log('roster.test.mjs OK');
// 다음 웨이브 미리보기 (previewWave): 난수 없이 결정적, 비율 합 ≈ 1, 스테이지 표본 분포와 일치(보장 몬스터 제외 근사), 최종 웨이브 보스, 특성 문구는 짧게
{ const { previewWave, monTrait, monIcon } = await import('../src/core/roster.js');
  for (const id of Object.keys(STAGES)) { const S = STAGES[id];
    for (const n of [1, 2, Math.ceil(S.waves / 2), S.waves]) { const P = previewWave(S, n); assert.deepEqual(P, previewWave(S, n), 'deterministic');
      const sum = P.list.reduce((a, x) => a + x.share, 0); assert.ok(P.list.length && Math.abs(sum - 1) < .02, `${id} w${n} sum ${sum}`);
      for (const x of P.list) { assert.ok(ETYPES[x.t] && !ETYPES[x.t].child, x.t); const tr = monTrait(x.t); assert.ok(tr && tr.length <= 12, `${x.t} trait '${tr}'`); assert.ok(monIcon(x.t), x.t); }
      if (n === S.waves && S.boss) assert.ok(P.boss && ETYPES[P.boss].boss, `${id} boss`);
      const q = []; for (let k = 0; k < 40; k++) q.push(...(stageWave(S, n, 40, rand) || [])); const allow = new Set(P.list.map(x => x.t)); for (const t of q) if (!ETYPES[t].child) assert.ok(allow.has(t), `${id} w${n} ${t} not in preview`);
      const top = P.list.slice().sort((a, b) => b.share - a.share)[0], frac = q.filter(t => t === top.t).length / q.length; assert.ok(Math.abs(frac - top.share) < .12, `${id} w${n} ${top.t} ${frac} vs ${top.share}`); } }
  for (const n of [1, 3, 5, 12, 25]) { const P = previewWave(null, n); assert.ok(P.list.length && Math.abs(P.list.reduce((a, x) => a + x.share, 0) - 1) < .02); assert.equal(!!P.boss, n % 5 === 0); const C = previewWave(null, n, true); assert.ok(C.list.every(x => ['grunt', 'imp', 'golem', 'bat'].includes(x.t))); } }
console.log('roster preview OK');
