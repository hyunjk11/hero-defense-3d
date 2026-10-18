
const CLASSES = {
  archer:  { n: '궁수', model: 'archer', hp: 380, dmg: 24, rate: 2.0, range: 11, speed: 7.5, armor: 0, skill: '화살비', cd: 12, color: 0x6aff8a, atk: '2H_Ranged_Shoot', atkSpd: 1.8 },
  mage:    { n: '마법사', model: 'mage_meshy', hp: 330, dmg: 34, rate: .95, range: 9, speed: 7, armor: 0, skill: '메테오', cd: 14, color: 0xb07aff, aoe: 2, atk: 'Spellcast_Shoot', atkSpd: 1.5 },
  warrior: { n: '전사', model: 'warrior', hp: 1000, dmg: 50, rate: 1.3, range: 2.8, speed: 7, armor: .4, skill: '회오리 베기', cd: 10, color: 0xff7a5a, atk: '1H_Melee_Attack_Chop', atkSpd: 1.6 },
};
const UPS = {
  atk: { n: '공격력', d: '+15% 피해', base: 40 }, spd: { n: '공격 속도', d: '+10% 속도', base: 40 }, rng: { n: '사거리', d: '+8% 사거리', base: 45 },
  skill: { n: '스킬 강화', d: '+25% 위력 · -8% 쿨', base: 60 }, bar: { n: '바리케이드', d: '+25% 체력', base: 35 },
};

export { CLASSES, UPS };
