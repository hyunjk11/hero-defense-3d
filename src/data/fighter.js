// ================= 격투가 진서윤 — 수치·순수 판단 함수 (DOM/three 없음 → node 테스트: tests/seoyun.test.mjs) =================
// 실제 동작: src/heroes/fighter.js (cls === 'fighter' 일 때만). 기본 수치(체력·공격·공속·사거리)는 data/heroes.js CLASSES.fighter
export const FT = {
  combo: [1, 1, 1.8],          // 3연타 배수: 주먹(왼) · 주먹(오른) · 회전 돌려차기
  kickR: 2.9, kickKb: 0,       // 돌려차기: 반경 2.9 주변 지상 적 모두 · 밀쳐내기 없음 (2026-10-24 패치: 넉백 제거 — 적이 주먹 사거리에 남아 콤보가 이어짐)
  kickCd: 1.25,                // 돌려차기 뒤 다음 공격까지 공격 간격 ×1.25 (큰 동작)
  comboReset: 1.4,             // 이 시간 동안 공격이 없으면 콤보가 처음(주먹)부터
  jpRange: 10,                 // 장풍 사거리: 공격 사거리(기본 2.6) 밖 ~ 10 의 모든 적 (2026-10-24 패치: 원거리/비행 적만 → 모든 적) · 비행은 가까워도 장풍
  jpWeak: .4, jpFull: 1.2,     // 충전 0.4초 = 약한 장풍, 1.2초 = 완전 충전 관통 장풍
  jpWeakMul: 1.2, jpFullMul: 2.5, jpLen: 12, jpW: 1.3, // 약 120% 단일 · 완전 250% 관통 직선(길이 12, 폭 1.3)
  qMul: 4, qR: 4.5, qStun: 1, qStunBoss: .35, qLeap: 9, qAir: .62, // [Q] 냥냥 진각: 최대 9 도약 → 반경 4.5 400% + 기절 1초(보스 0.35초)
};
// 콤보 단계 (0,1 = 주먹, 2 = 돌려차기)
export const comboMul = n => FT.combo[((n % 3) + 3) % 3];
export const isKick = n => ((n % 3) + 3) % 3 === 2;
// 원거리/비행 적: 비행(박쥐·정령) 또는 사거리 있는 능력(눈덩이·메테오·저주…)을 가진 몬스터 — 장풍 대상 · 던전 격투가가 먼저 덮침
export const isRangedFoe = E => !!E && (!!E.fly || (!!E.ab && Object.values(E.ab).some(a => a && typeof a === 'object' && +a.range > 0)));
// 충전 시간 → 'none' | 'weak' | 'full'
// o = ftOpt(전직) 결과 (생략하면 FT = 전직 없는 기본값 그대로)
export const jpLevel = (t, o = FT) => (t >= o.jpFull ? 'full' : t >= o.jpWeak ? 'weak' : 'none');
export const jpMul = (t, o = FT) => ({ none: 0, weak: o.jpWeakMul, full: o.jpFullMul }[jpLevel(t, o)]);
// 전직(data/advance.js ADV.fighter) → 서윤 동작 수치. A 없으면 FT 와 같은 값 (전직 안 한 서윤 불변). FT 전역은 절대 바꾸지 않음
export function ftOpt(A) { const a = (A && A.atk) || {};
  return { jpWeak: FT.jpWeak, jpFull: a.jpFull || FT.jpFull, jpWeakMul: FT.jpWeakMul, jpFullMul: a.jpFullMul || FT.jpFullMul, jpW: FT.jpW * (a.jpWMul || 1), jpLen: FT.jpLen,
    slow: a.jpSlow || 0, slowT: a.jpSlowT || 0, fin: a.fin || 0, leech: a.leech || 0, leechCap: a.leechCap || 0 }; }
// 백호권성 콤보 회복: 콤보 동안 실제로 깎은 피해 합 × leech, 최대 체력 × leechCap 이 상한
export const comboHeal = (dealt, max, o) => (o.leech > 0 && dealt > 0 ? Math.min(dealt * o.leech, max * (o.leechCap || 0)) : 0);
// 장풍 대상 판정 (2026-10-24 패치): 근접 사거리 밖(d > meleeR) 이고 장풍 사거리(jpR) 안인 모든 적. 비행은 주먹이 안 닿으므로 가까워도 장풍
export const jpWants = (d, meleeR, fly, jpR = FT.jpRange) => d <= jpR && (fly || d > meleeR);
// [Q] 전직 스킬 수치 — 백호진천권(TQ) · 천룡파(DW)
// 🐯 백호진천권 (2026-10-24, 백호난무 대체): 제자리에서 기를 모아(windT) 땅을 내려침 → 반경 R 지상 적 mul 피해 + 기절(보스 제외) → 땅 충격파 고리가 waveR 까지 퍼지며 지상 적마다 1회 waveMul
//   중심 적 합계 5 + 2 = 7.0 = 옛 백호난무(6×0.75 + 2.5) 와 같음 · 넉백 없음 · 시전 중(dur) 받는 피해 -guard · 도약/이동 없음
export const TQ = { windT: .42, R: 4.6, mul: 5, stun: .8, waveR: 7.5, waveMul: 2, waveSpd: 16, guard: .3, dur: .95, hitStop: .12 };
// 🐉 천룡파 (2026-10-24 강화): 더 큰 용(scale) · 가까운 '아직 안 맞은' 적을 쫓아 방향을 틀며(turn rad/s, seek 반경) 비행 거리 len 까지 · 반폭 w 관통 500% (적마다 1회)
export const DW = { len: 24, w: 1.9, mul: 5, stun: 1, bossSlow: .25, bossSlowT: 2, spd: 28, castT: .32, turn: 5, seek: 9, scale: 1.6 };
// 유도: 현재 방향(dx,dz 단위)에서 목표 쪽으로 최대 turn*dt 만큼 회전한 새 단위 방향 [x, z]
export const steer = (dx, dz, tx, tz, maxA) => { const a0 = Math.atan2(dx, dz), a1 = Math.atan2(tx, tz); let d = a1 - a0; d = Math.atan2(Math.sin(d), Math.cos(d)); const a = a0 + Math.max(-maxA, Math.min(maxA, d)); return [Math.sin(a), Math.cos(a)]; };
// 옛 저장/데이터의 스킬 id 별칭 (백호난무 tigerfury → 백호진천권 tigerquake). 저장에는 분기 키(tiger)만 있으나 혹시 남은 옛 id 도 새 스킬로
export const ftSkillId = k => (k === 'tigerfury' ? 'tigerquake' : k);
// 직선 판정: 점(ex,ez) 이 from 에서 dir(단위) 방향 길이 len · 반폭 w 안인가 (적마다 한 번만은 호출 쪽 Set)
export const inLine = (ex, ez, fx, fz, dx, dz, len, w) => { const px = ex - fx, pz = ez - fz, t = px * dx + pz * dz; if (t < -.5 || t > len) return false; const qx = px - dx * t, qz = pz - dz * t; return qx * qx + qz * qz <= w * w; };
// 이론 DPS (단일 대상, 강화·장비 없음): 피해 × 공속 × 콤보 평균 배수
export const fighterDps = C => C.dmg * C.rate * FT.combo.reduce((a, b) => a + b, 0) / (FT.combo.length - 1 + FT.kickCd); // 3연타 한 바퀴 = 간격 2 + 1.25
