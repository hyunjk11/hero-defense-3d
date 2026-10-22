// ================= 격투가 진서윤 — 수치·순수 판단 함수 (DOM/three 없음 → node 테스트: tests/seoyun.test.mjs) =================
// 실제 동작: src/heroes/fighter.js (cls === 'fighter' 일 때만). 기본 수치(체력·공격·공속·사거리)는 data/heroes.js CLASSES.fighter
export const FT = {
  combo: [1, 1, 1.8],          // 3연타 배수: 주먹(왼) · 주먹(오른) · 회전 돌려차기
  kickR: 2.6, kickKb: 1.3,     // 돌려차기: 반경 2.6 주변 지상 적 모두 + 밀쳐내기 거리 1.3 (보스는 knock() 이 25%)
  kickCd: 1.25,                // 돌려차기 뒤 다음 공격까지 공격 간격 ×1.25 (큰 동작)
  comboReset: 1.4,             // 이 시간 동안 공격이 없으면 콤보가 처음(주먹)부터
  jpRange: 10,                 // 장풍 충전 시작 거리 (근접 사거리 밖 · 원거리/비행 적)
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
export const jpLevel = t => (t >= FT.jpFull ? 'full' : t >= FT.jpWeak ? 'weak' : 'none');
export const jpMul = t => ({ none: 0, weak: FT.jpWeakMul, full: FT.jpFullMul }[jpLevel(t)]);
// 이론 DPS (단일 대상, 강화·장비 없음): 피해 × 공속 × 콤보 평균 배수
export const fighterDps = C => C.dmg * C.rate * FT.combo.reduce((a, b) => a + b, 0) / (FT.combo.length - 1 + FT.kickCd); // 3연타 한 바퀴 = 간격 2 + 1.25
