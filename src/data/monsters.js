
const ETYPES = {
  imp:   { n: '해골 도적', model: 'sk_rogue', w: 'w_blade', h: 1.75, hp: 40, spd: 4.0, gold: 2, core: 1, dps: 14, walk: 'Running_C', ws: .55, dig: '1H_Melee_Attack_Chop' },
  grunt: { n: '해골 병사', model: 'sk_minion', w: 'w_axe', h: 2.1, hp: 80, spd: 2.6, gold: 3, core: 1, dps: 20, walk: 'Walking_D_Skeletons', ws: .55, dig: '1H_Melee_Attack_Chop' },
  golem: { n: '해골 기사', model: 'sk_warrior', w: 'w_axe', sh: 'w_shield_large_a', h: 2.6, hp: 300, spd: 1.7, gold: 8, core: 3, dps: 50, walk: 'Walking_D_Skeletons', ws: .5, dig: '2H_Melee_Attack_Chop', armor: .25 },
  bat:   { n: '유령 박쥐', fly: true, h: 1.2, hp: 60, spd: 3.2, gold: 5, core: 2, dps: 0 },
  boss:  { n: '해골 군주', model: 'sk_warrior', w: 'w_axe', sh: 'w_shield_large_a', h: 5.2, hp: 3200, spd: 1.25, gold: 120, core: 10, dps: 170, walk: 'Walking_D_Skeletons', ws: .32, dig: '2H_Melee_Attack_Chop', armor: .2, boss: true },

  // ---- Stage 2 신규 몬스터 (ai: 행동 상태머신, profile: 경로 비용 프로필, from: 처음 등장 웨이브) ----
  digger:  { n: '굴착병', model: 'sk_minion', prop: 'pickaxe', tint: 0xffc890, eye: 0xffd040, h: 1.95, hp: 70, spd: 2.7, gold: 4, core: 1, dps: 14, digDps: 115, walk: 'Running_C', ws: .5, dig: '1H_Melee_Attack_Chop',
             ai: 'digger', profile: 'digger', from: 2, desc: '곡괭이로 지형을 아주 빠르게 부숴 새 터널을 엽니다. 터널은 모든 몬스터가 사용합니다.' },
  charger: { n: '돌격병', model: 'sk_rogue', w: 'w_blade', prop: 'horns', tint: 0xff9a80, eye: 0xff5a20, h: 1.85, hp: 95, spd: 2.2, sprint: 6.4, gold: 4, core: 2, dps: 12, walk: 'Running_C', ws: .5, dig: '1H_Melee_Attack_Chop',
             ai: 'charger', profile: 'charger', from: 3, desc: '이미 파인 길을 강하게 선호하고, 길 위에서는 전력 질주로 코어까지 달립니다.' },
  shield:  { n: '방패병', model: 'sk_minion', w: 'w_axe', sh: 'w_shield_large_b', prop: 'plume', tint: 0xa8c4ff, eye: 0x40a0ff, h: 2.2, hp: 170, spd: 2.0, gold: 6, core: 2, dps: 22, walk: 'Walking_D_Skeletons', ws: .55, dig: '1H_Melee_Attack_Chop',
             ai: 'shield', shieldDef: { arc: 65, side: 115, front: .85, sideRed: .3, back: -.25, melee: .4 }, from: 4, desc: '정면 원거리 공격을 방패로 막습니다(최대 85%). 옆·뒤, 범위·번개 공격에 약합니다.' },
  bomber:  { n: '자폭병', model: 'sk_mage', prop: 'bomb', tint: 0xd0ffb0, eye: 0x7aff3a, h: 1.7, hp: 60, spd: 3.3, gold: 5, core: 2, dps: 10, walk: 'Running_C', ws: .55, dig: 'Unarmed_Melee_Attack_Punch_A',
             ai: 'bomber', bomb: { seek: 6.5, trigger: 1.7, fuse: .75, r: 2.9, tower: 170, bar: 280, hero: 90, block: 220 }, from: 6, desc: '근처의 타워·바리케이드로 달려가 자폭합니다 (주변 지형도 무너뜨림).' },
  siege:   { n: '공성병', model: 'sk_warrior', prop: 'ram', tint: 0xffb878, eye: 0xff9a20, h: 2.55, hp: 290, spd: 1.6, gold: 9, core: 3, dps: 34, towerDps: 75, walk: 'Walking_D_Skeletons', ws: .5, dig: '2H_Melee_Attack_Chop',
             armor: .15, ai: 'siege', profile: 'siege', from: 7, desc: '공성 망치로 타워를 노립니다. 타워는 체력이 있고 파괴될 수 있습니다 — 골드로 수리하세요 (R).' },};

// 웨이브 구성: 기존 무작위 추첨 후, 등장 가능한 신규 몬스터로 일부 교체 (classic 모드에서는 비활성)
const NEW_TYPES = ['digger', 'charger', 'shield', 'bomber', 'siege'];
const NEW_WEIGHT = { digger: 1.2, charger: 1.1, shield: 1, bomber: .8, siege: .7 };
const newShare = n => Math.min(.5, .14 + .045 * (n - 2));

export { ETYPES, NEW_TYPES, NEW_WEIGHT, newShare };
