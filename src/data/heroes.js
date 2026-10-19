
// 버들 모델 재작업 중: 상점·영웅 선택·마을에서 임시로 숨김 (코드는 유지, ?budeul=1 로만 표시 — 테스트용)
const HIDE_MECH = !(typeof location !== 'undefined' && new URLSearchParams(location.search).has('budeul'));
const CLASSES = {
  archer:  { n: '궁수', nm: '실바', model: 'archer_meshy', hp: 380, dmg: 24, rate: 2.0, range: 11, speed: 7.5, armor: 0, skill: '화살비', cd: 12, color: 0x6aff8a, atk: '2H_Ranged_Shoot', atkSpd: 1.8 },
  mage:    { n: '마법사', nm: '루나', model: 'mage_meshy', hp: 330, dmg: 34, rate: .95, range: 9, speed: 7, armor: 0, skill: '메테오', cd: 14, color: 0xb07aff, aoe: 2, atk: 'Spellcast_Shoot', atkSpd: 1.5 },
  warrior: { n: '전사', nm: '세라', model: 'warrior_meshy', hp: 1000, dmg: 50, rate: 1.3, range: 2.8, speed: 7, armor: .4, skill: '회오리 베기', cd: 10, color: 0xff7a5a, atk: '1H_Melee_Attack_Chop', atkSpd: 1.6 },
  // 유료 영웅 (상점 → 관리자 승인 → 우편으로 지급). 빠른 쌍권총 연사: 낮은 1발 피해 · 높은 공격 속도 · 중간 사거리
  gunner:  { n: '총사', nm: '로즈', model: 'gunner_meshy', hp: 420, dmg: 13, rate: 4.2, range: 8.5, speed: 7.6, armor: .05, skill: '로즈 피니시', cd: 12, color: 0xff6aa8, atk: 'ShootLoop', atkSpd: 1.6, paid: true },
  // 유료 영웅 2: 메카닉 버들 — 근접 브루저(가장 높은 체력·방어). 등의 로봇 팔로 드릴(다단 히트)·해머(작은 범위 넉백)를 번갈아 사용, [Q] 변신 → 10초간 거대 로봇
  mechanic: { n: '메카닉', nm: '버들', model: 'budeul_meshy', hp: 1150, dmg: 36, rate: 1.15, range: 3.0, speed: 6.8, armor: .35, skill: '변신', cd: 26, color: 0x7aff5a, atk: 'Drill', atkSpd: 1.5, paid: true, hidden: HIDE_MECH },
};
const UPS = {
  atk: { n: '공격력', d: '+15% 피해', base: 40 }, spd: { n: '공격 속도', d: '+10% 속도', base: 40 }, rng: { n: '사거리', d: '+8% 사거리', base: 45 },
  skill: { n: '스킬 강화', d: '+25% 위력 · -8% 쿨', base: 60 }, bar: { n: '바리케이드', d: '+25% 체력', base: 35 },
};

// 영웅 표시 이름: '실바 · 궁수'
const heroLabel = c => CLASSES[c] ? (CLASSES[c].nm ? `${CLASSES[c].nm} · ${CLASSES[c].n}` : CLASSES[c].n) : '';

const shownHero = c => !!CLASSES[c] && !CLASSES[c].hidden;
export { CLASSES, UPS, heroLabel, shownHero };
