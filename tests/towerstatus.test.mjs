// 타워 상태이상: 저주·용암 웅덩이·속박 = 공격 정지(쿨타임 멈춤), 빙결·한기 = 감속 — node tests/towerstatus.test.mjs
import assert from 'node:assert/strict';
import { towerDisabled, towerRateK, towerCdStep } from '../src/combat/towerstatus.js';

const base = () => ({ cd: 1, shots: 0 });
// 간이 시뮬: 적이 항상 사거리 안, rate 발/초. updTowers 와 같은 순서 (cdStep → 정지면 건너뜀 → cd<=0 이면 발사·cd=1/rate)
function sim(tw, secs, rate = 2, t0 = 0, dt = 1 / 60, each) { let t = t0; for (let i = 0; i < Math.round(secs / dt); i++) { t += dt; if (each) each(tw, dt, t); const can = towerCdStep(tw, dt, t); if (!can) continue; if (tw.cd > 0) continue; tw.cd = 1 / rate; tw.shots++; } return tw; }

// 상태 없음: 쿨타임이 정확히 dt 만큼 (기존과 같은 값) · 2발/초
{ const tw = base(); assert.equal(towerRateK(tw, 0), 1); assert.equal(towerDisabled(tw), false); towerCdStep(tw, .25, 0); assert.equal(tw.cd, .75); sim(tw, 10); assert.ok(tw.shots >= 17 && tw.shots <= 21, tw.shots); }

for (const [k, n] of [['curseT', '저주'], ['meltT', '용암 웅덩이'], ['rootT', '속박']]) {
  // 그 상태 하나만으로 정지: 4초 동안 0발, 쿨타임 그대로
  const tw = base(); tw[k] = 4.5; assert.equal(towerDisabled(tw), true, n); assert.equal(towerRateK(tw, 0), 0, n);
  sim(tw, 4, 2, 0, 1 / 60, (x, dt) => { x[k] -= dt; }); assert.equal(tw.shots, 0, n + ' 중 발사 0'); assert.equal(tw.cd, 1, n + ' 중 쿨타임 멈춤');
  // 끝나면 다시 공격 — 몰아 쏘기 없음 (끝난 뒤 2초 ≈ 정상 2초 발사 수 이하)
  sim(tw, 3, 2, 4, 1 / 60, (x, dt) => { x[k] -= dt; }); assert.ok(tw.shots >= 3 && tw.shots <= 5, n + ' 이후 ' + tw.shots);
  // 빙결·한기와 겹쳐도 정지 우선
  const tw2 = { ...base(), [k]: 1, frostT: 1, frostK: .5, chillT: 10, chillK: .75 }; assert.equal(towerRateK(tw2, 0), 0, n + '+감속');
}
// 감속: 빙결 ×frostK, 한기 ×chillK (G.t 기준 만료), 겹치면 곱
{ const tw = { ...base(), frostT: 2, frostK: .5 }; assert.equal(towerRateK(tw, 0), .5); assert.equal(towerDisabled(tw), false); towerCdStep(tw, .2, 0); assert.ok(Math.abs(tw.cd - .9) < 1e-12);
  const c = { ...base(), chillT: 5, chillK: .75 }; assert.equal(towerRateK(c, 4.9), .75); assert.equal(towerRateK(c, 5.1), 1, '한기 만료');
  assert.equal(towerRateK({ ...c, frostT: 1, frostK: .5 }, 0), .375);
  // 감속 중에도 공격은 함 (느리게)
  const s = sim({ ...base(), chillT: 100, chillK: .5 }, 10); assert.ok(s.shots >= 8 && s.shots <= 11, s.shots); }
// 끝난 상태 값(0 이하·undefined)은 영향 없음
{ assert.equal(towerDisabled({ curseT: 0, meltT: -.01, rootT: undefined }), false); assert.equal(towerRateK({ frostT: -1, frostK: .5, chillT: 0 }, 1), 1); }
console.log('towerstatus OK');
