// 판 종료 통계 집계·표시 형식 테스트: node tests/endstats.test.mjs  (src/data/endstats.js · combat/meter.js 기록과 연결)
import * as ES from '../src/data/endstats.js';
import * as Mt from '../src/combat/meter.js';
import assert from 'node:assert/strict';
const near = (a, b, e = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} != ${b}`);
let n = 0; const ok = () => n++;

// 1) 미터로 판 하나 재현: 영웅 2명 + 타워 3개(1개 철거) + 웨이브 3개 (마지막 진행 중)
const log = [], A = Mt.newMeter(0), B = Mt.newMeter(0), O = Mt.newMeter(0), towers = [];
const t1 = { type: 'arrow', stars: 2 }, t2 = { type: 'cannon', stars: 3, branch: 'x' }, t3 = { type: 'magic', stars: 1 };
Mt.waveStart(log, 1, 10); Mt.meterAdd(A, 100, 12, 0, false); Mt.meterAdd(A, 250, 14, 1, true); Mt.meterAdd(B, 40, 15, 0, true); Mt.meterTaken(A, 30);
Mt.meterAdd(O, 70, 15, 0, true); Mt.towerAdd(towers, t1, 70, true); Mt.waveEnd(log, 30);
Mt.waveStart(log, 2, 50); Mt.meterAdd(O, 200, 55, 0, false); Mt.towerAdd(towers, t2, 200, false); Mt.meterAdd(O, 5, 56, 0, false); Mt.towerAdd(towers, t3, 5, false); Mt.meterTaken(B, 12.5); Mt.waveEnd(log, 60);
Mt.waveStart(log, 3, 70);
const R = ES.aggregate({ heroes: [{ cls: 'archer', nm: '실바', icon: '🏹', dm: A }, { cls: 'mage', nm: '루나', icon: '🧙', dm: B, dead: true }], other: O, towers: towers.map(x => ({ ...x, dmT: x.dmT, dmK: x.dmK, gone: x === t3 })), waves: log, t: 75 });
near(R.span, 20 + 10 + 5, 1e-9, 'span'); // 웨이브 시간 합 (진행 중 = t 까지) · 정비 시간 제외
const [a, b] = R.heroes; assert.equal(a.tot, 350); assert.equal(a.max, 250); assert.equal(a.kills, 1); assert.equal(a.taken, 30); near(a.skPct, 250 / 350); near(a.dps, 350 / 35); ok();
assert.equal(b.tot, 40); assert.equal(b.kills, 1); assert.equal(b.taken, 12.5); assert.equal(b.skPct, 0); assert.equal(b.dead, true); near(a.bar, 1); near(b.bar, 40 / 350); ok();
assert.equal(R.team, 350 + 40 + 275); near(a.share + b.share + R.other.tot / R.team, 1); assert.equal(R.other.tot, 275); assert.equal(R.other.label, '타워'); ok();
// 타워: 피해 순 · 막대 = 1위 대비 · 철거 표시 · 아이콘 기본값
assert.deepEqual(R.towers.map(x => x.type), ['cannon', 'arrow', 'magic']); near(R.towers[0].bar, 1); near(R.towers[1].bar, 70 / 200); assert.equal(R.towers[1].dmK, 1); assert.equal(R.towers[2].gone, true); assert.equal(R.towers[1].icon, '🏹'); assert.equal(R.towerCount, 3); assert.equal(R.towersMore, 0); ok();
near(R.towers.reduce((s, x) => s + x.dmT, 0), O.tot); ok(); // 타워 합 = 공용 미터 (일반 판)
// 웨이브: 시간 · 진행 중 · 최단/최장 (끝난 웨이브만)
assert.deepEqual(R.waves.map(w => [w.n, w.sec, w.done]), [[1, 20, true], [2, 10, true], [3, 5, false]]); near(R.waves[0].bar, 1); near(R.waves[1].bar, .5); assert.equal(R.fastest.n, 2); assert.equal(R.slowest.n, 1); ok();

// 2) 상위 TOP_TOWERS 개만 + '외 n개' · 피해 0 타워 제외
const many = Array.from({ length: 9 }, (_, i) => ({ type: 'arrow', dmT: (i + 1) * 10, dmK: 0 })).concat([{ type: 'magic', dmT: 0, dmK: 0 }]);
const R2 = ES.aggregate({ heroes: [], towers: many, waves: [], t: 0 }); assert.equal(R2.towers.length, ES.TOP_TOWERS); assert.equal(R2.towersMore, 9 - ES.TOP_TOWERS); assert.equal(R2.towers[0].dmT, 90); assert.equal(R2.towerCount, 9); ok();
// 3) 빈 판 (영웅 미터 없음 · 웨이브 없음) → 0 으로 나누지 않음
const R3 = ES.aggregate({ heroes: [{ cls: 'warrior', dm: null }], t: 0 }); assert.equal(R3.heroes[0].tot, 0); assert.equal(R3.heroes[0].dps, 0); assert.equal(R3.heroes[0].skPct, 0); assert.equal(R3.team, 0); assert.equal(R3.fastest, null); assert.deepEqual(R3.waves, []); ok();
// 웨이브 기록 없음 → 판 시간 (t − t0) 으로 평균 DPS
const M4 = Mt.newMeter(5); Mt.meterAdd(M4, 90, 10, 0, false); const R4 = ES.aggregate({ heroes: [{ cls: 'archer', dm: M4 }], t: 35 }); near(R4.span, 30); near(R4.heroes[0].dps, 3); ok();
// 4) 던전: 웨이브 이름 '층-웨이브' · 합동 공격 라벨
const dl = []; Mt.waveStart(dl, '1-1', 0); Mt.waveStart(dl, '1-2', 12); Mt.waveEnd(dl, 20); const R5 = ES.aggregate({ heroes: [], waves: dl, t: 20, dungeon: true, other: Mt.newMeter(0) });
assert.deepEqual(R5.waves.map(w => [w.n, w.sec]), [['1-1', 12], ['1-2', 8]]); assert.equal(R5.other.label, '합동 공격'); assert.equal(ES.waveLabel('1-2'), '1-2'); assert.equal(ES.waveLabel(7), 'W7'); ok();
// 5) 형식
assert.equal(ES.fmtBig(1234), (1234).toLocaleString('ko-KR')); assert.equal(ES.fmtBig(12345), '12.3k'); assert.equal(ES.fmtBig(2500000), '2.5M'); assert.equal(ES.fmtBig(NaN), '0'); ok();
assert.equal(ES.fmtDps(12.34), '12.3'); assert.equal(ES.fmtDps(123.4), '123'); assert.equal(ES.fmtDps(25000), '25k'); ok();
assert.equal(ES.fmtPct(.256), '26%'); assert.equal(ES.fmtPct(0), '0%'); ok();
assert.equal(ES.fmtTime(42.34), '42.3초'); assert.equal(ES.fmtTime(65), '1분 5초'); assert.equal(ES.fmtTime(119.7), '2분 0초'); assert.equal(ES.fmtTime(-3), '0초'); ok();
assert.equal(ES.fmtClock(65.4), '1:05'); assert.equal(ES.fmtClock(5), '0:05'); assert.equal(ES.fmtClock(600), '10:00'); ok();
near(ES.combatTime([{ t0: 0, t1: 10 }, { t0: 20, t1: -1 }], 25), 15); ok();
console.log(`endstats.test OK ${n}`);
