
const ETYPES = {
  imp:   { n: '해골 도적', model: 'sk_rogue', w: 'w_blade', h: 1.75, hp: 40, spd: 4.0, gold: 2, core: 1, dps: 14, walk: 'Running_C', ws: .55, dig: '1H_Melee_Attack_Chop' },
  grunt: { n: '해골 병사', model: 'sk_minion', w: 'w_axe', h: 2.1, hp: 80, spd: 2.6, gold: 3, core: 1, dps: 20, walk: 'Walking_D_Skeletons', ws: .55, dig: '1H_Melee_Attack_Chop' },
  golem: { n: '해골 기사', model: 'sk_warrior', w: 'w_axe', sh: 'w_shield_large_a', h: 2.6, hp: 300, spd: 1.7, gold: 8, core: 3, dps: 50, walk: 'Walking_D_Skeletons', ws: .5, dig: '2H_Melee_Attack_Chop', armor: .25 },
  bat:   { n: '유령 박쥐', fly: true, h: 1.2, hp: 60, spd: 3.2, gold: 5, core: 2, dps: 0 },
  boss:  { n: '해골 군주', model: 'sk_warrior', w: 'w_axe', sh: 'w_shield_large_a', h: 5.2, hp: 3200, spd: 1.25, gold: 120, core: 10, dps: 170, walk: 'Walking_D_Skeletons', ws: .32, dig: '2H_Melee_Attack_Chop', armor: .2, boss: true },
};

export { ETYPES };
