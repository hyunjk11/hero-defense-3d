
const ETYPES = {
  imp:   { n: '해골 도적', model: 'sk_rogue', w: 'w_blade', h: 1.75, hp: 40, spd: 4.0, gold: 2, core: 1, dps: 14, walk: 'Running_C', ws: .55, dig: '1H_Melee_Attack_Chop' },
  grunt: { n: '해골 병사', model: 'sk_minion', w: 'w_axe', h: 2.1, hp: 80, spd: 2.6, gold: 3, core: 1, dps: 20, walk: 'Walking_D_Skeletons', ws: .55, dig: '1H_Melee_Attack_Chop' },
  golem: { n: '해골 기사', model: 'sk_warrior', w: 'w_axe', sh: 'w_shield_large_a', h: 2.6, hp: 300, spd: 1.7, gold: 8, core: 3, dps: 50, walk: 'Walking_D_Skeletons', ws: .5, dig: '2H_Melee_Attack_Chop', armor: .25 },
  bat:   { n: '유령 박쥐', fly: true, h: 1.2, hp: 60, spd: 3.2, gold: 5, core: 2, dps: 0 },
  boss:  { n: '해골 군주', model: 'sk_warrior', w: 'w_axe', sh: 'w_shield_large_a', h: 5.2, hp: 3200, spd: 1.25, gold: 120, core: 10, dps: 170, walk: 'Walking_D_Skeletons', ws: .32, dig: '2H_Melee_Attack_Chop', armor: .2, boss: true },

  // ---- Stage 2 신규 몬스터 (ai: 행동 상태머신, profile: 경로 비용 프로필, from: 처음 등장 웨이브) ----
  digger:  { icon: '⛏', n: '굴착병', model: 'sk_minion', prop: 'pickaxe', tint: 0xffc890, eye: 0xffd040, h: 1.95, hp: 70, spd: 2.7, gold: 4, core: 1, dps: 14, digDps: 115, walk: 'Running_C', ws: .5, dig: '1H_Melee_Attack_Chop',
             ai: 'digger', profile: 'digger', from: 2, desc: '곡괭이로 지형을 아주 빠르게 부숴 새 터널을 엽니다. 터널은 모든 몬스터가 사용합니다.' },
  charger: { icon: '💨', n: '돌격병', model: 'sk_rogue', w: 'w_blade', prop: 'horns', tint: 0xff9a80, eye: 0xff5a20, h: 1.85, hp: 95, spd: 2.2, sprint: 6.4, gold: 4, core: 2, dps: 12, walk: 'Running_C', ws: .5, dig: '1H_Melee_Attack_Chop',
             ai: 'charger', profile: 'charger', from: 3, desc: '이미 파인 길을 강하게 선호하고, 길 위에서는 전력 질주로 코어까지 달립니다.' },
  shield:  { icon: '🛡', n: '방패병', model: 'sk_minion', w: 'w_axe', sh: 'w_shield_large_b', prop: 'plume', tint: 0xa8c4ff, eye: 0x40a0ff, h: 2.2, hp: 170, spd: 2.0, gold: 6, core: 2, dps: 22, walk: 'Walking_D_Skeletons', ws: .55, dig: '1H_Melee_Attack_Chop',
             ai: 'shield', shieldDef: { arc: 65, side: 115, front: .85, sideRed: .3, back: -.25, melee: .4 }, from: 4, desc: '정면 원거리 공격을 방패로 막습니다(최대 85%). 옆·뒤, 범위·번개 공격에 약합니다.' },
  bomber:  { icon: '💣', n: '자폭병', model: 'sk_mage', prop: 'bomb', tint: 0xd0ffb0, eye: 0x7aff3a, h: 1.7, hp: 60, spd: 3.3, gold: 5, core: 2, dps: 10, walk: 'Running_C', ws: .55, dig: 'Unarmed_Melee_Attack_Punch_A',
             ai: 'bomber', bomb: { seek: 6.5, trigger: 1.7, fuse: .75, r: 2.9, tower: 170, bar: 280, hero: 90, block: 220 }, from: 6, desc: '근처의 타워·바리케이드로 달려가 자폭합니다 (주변 지형도 무너뜨림).' },
  siege:   { icon: '🔨', n: '공성병', model: 'sk_warrior', prop: 'ram', tint: 0xffb878, eye: 0xff9a20, h: 2.55, hp: 290, spd: 1.6, gold: 9, core: 3, dps: 34, towerDps: 75, walk: 'Walking_D_Skeletons', ws: .5, dig: '2H_Melee_Attack_Chop',
             armor: .15, ai: 'siege', profile: 'siege', from: 7, desc: '공성 망치로 타워를 노립니다. 타워는 체력이 있고 파괴될 수 있습니다 — 골드로 수리하세요 (R).' },

  // ---- 챕터 몬스터 (ROSTERS 참고). proc: 절차적 모델(늑대/슬라임/정령), ab: 능력(src/monsters/abilities.js), icon: 신규 몬스터 알림 아이콘 ----
  // 1장 숲
  goblin:   { n: '고블린', icon: '👺', model: 'sk_rogue', w: 'w_blade', prop: 'ears', tint: 0x9aff7a, eye: 0xffe040, h: 1.6, hp: 50, spd: 3.3, gold: 2, core: 1, dps: 12, walk: 'Running_C', ws: .6, dig: '1H_Melee_Attack_Chop',
              ab: { panic: { at: .5, k: 1.8, dur: 2.2 } }, desc: '작고 빠른 숲의 졸개. 체력이 절반 아래로 떨어지면 겁에 질려 잠깐 전력 질주합니다.' },
  wolf:     { n: '숲늑대', icon: '🐺', proc: 'wolf', fur: 0x8a7a68, h: 1.35, hp: 55, spd: 5.0, gold: 3, core: 1, dps: 16, digDps: 9, profile: 'charger', ws: .5,
              desc: '매우 빠르지만 땅을 거의 못 팝니다. 이미 파인 길을 따라 질주하므로 길목 타워가 중요해요.' },
  slime:    { n: '숲 슬라임', icon: '🦠', proc: 'slime', col: 0x6ae06a, h: 1.3, hp: 115, spd: 2.0, gold: 3, core: 1, dps: 14, ws: 1,
              ab: { split: { type: 'slime_s', n: 2 } }, desc: '죽으면 작은 슬라임 2마리로 분열합니다. 범위 공격(대포탑)이 효과적이에요.' },
  slime_s:  { n: '꼬마 슬라임', icon: '🦠', proc: 'slime', col: 0x9aff8a, h: .75, hp: 38, spd: 2.9, gold: 1, core: 1, dps: 7, ws: 1.4, child: true, desc: '분열한 작은 슬라임.' },
  mushroom: { n: '버섯 주술사', icon: '🍄', model: 'sk_mage', prop: 'shroom', tint: 0xffd8c0, eye: 0x9aff4a, h: 1.75, hp: 95, spd: 2.2, gold: 5, core: 1, dps: 10, walk: 'Walking_D_Skeletons', ws: .6, dig: 'Unarmed_Melee_Attack_Punch_A',
              ab: { heal: { every: 4.5, windup: .7, r: 3.4, pct: .12 } }, desc: '포자를 뿌려 주변 몬스터의 체력을 회복시킵니다(4.5초마다 12%). 갓이 초록빛으로 부풀면 곧 회복 — 먼저 처치하세요.' },
  treant:   { n: '고목 정령', icon: '🌳', model: 'sk_warrior', prop: 'treant', tint: 0xb08a5a, eye: 0x7aff4a, h: 3.0, hp: 520, spd: 1.35, gold: 12, core: 3, dps: 45, walk: 'Walking_D_Skeletons', ws: .45, dig: '2H_Melee_Attack_Chop',
              armor: .15, ab: { root: { every: 8, first: 3, windup: 1.2, r: 5.5, n: 1, dur: 2.6 } }, desc: '단단한 나무 거인. 8초마다 가까운 타워를 뿌리로 묶어 2.6초 동안 공격을 막습니다 (초록 고리 = 예고).' },
  // 2장 설원
  icewolf:  { n: '서리늑대', icon: '🐺', proc: 'wolf', fur: 0xc8e8ff, eye: 0x2aa8ff, h: 1.4, hp: 70, spd: 4.3, gold: 3, core: 1, dps: 18, digDps: 12, profile: 'charger', ws: .5,
              pack: 3, ab: { pack: { r: 3.6, need: 2, spd: 1.3, red: .2 } }, desc: '3마리씩 무리 지어 다닙니다. 동료 2마리 이상과 붙어 있으면 이동속도 +30%, 받는 피해 -20% (발밑 파란 고리).' },
  yeti:     { n: '설인', icon: '❄', model: 'sk_warrior', prop: 'yeti', tint: 0xf4f8ff, eye: 0x6ac8ff, h: 2.9, hp: 360, spd: 1.6, gold: 10, core: 2, dps: 40, walk: 'Walking_D_Skeletons', ws: .5, dig: '2H_Melee_Attack_Chop',
              ab: { chill: { r: 3.6, k: .7 }, snowball: { every: 6.5, first: 2.5, windup: .8, range: 7.5, dur: 3.5, k: .5 } }, desc: '주변(반경 3.6) 타워의 공격속도를 30% 늦추고, 6.5초마다 눈덩이를 던져 타워를 3.5초간 얼립니다(공격속도 -50%).' },
  wisp:     { n: '서리 정령', icon: '✨', proc: 'wisp', fly: true, h: 1.2, hp: 75, spd: 2.6, gold: 6, core: 1, dps: 0,
              ab: { escort: { r: 12 }, shield: { every: 5, first: 1.5, r: 4.6, n: 3, pct: .3, cap: 160, dur: 8 } }, desc: '하늘을 날며 지상 몬스터를 따라다니고, 5초마다 주변 동료 3명에게 얼음 보호막(체력 30%)을 씌웁니다. 화살탑·마법탑·영웅만 맞힐 수 있어요.' },
  frostgolem: { n: '서리 골렘', icon: '⛄', model: 'sk_warrior', prop: 'ice', tint: 0x9ad8ff, eye: 0xbff4ff, h: 2.8, hp: 380, spd: 1.45, gold: 11, core: 3, dps: 48, walk: 'Walking_D_Skeletons', ws: .5, dig: '2H_Melee_Attack_Chop',
              ab: { crack: { armor: .6, at: .3, after: 0, spd: 1.25 } }, desc: '얼음 갑옷이 피해를 60% 막습니다. 체력의 30%만큼 맞으면 갑옷이 깨져 방어력이 사라지고 대신 빨라집니다.' },
  // 챕터 보스
  boss_forest: { n: '숲의 군주', icon: '👑', model: 'sk_warrior', w: 'w_axe', prop: 'treant', tint: 0xa8d07a, h: 5.4, hp: 3200, spd: 1.2, gold: 140, core: 10, dps: 170, walk: 'Walking_D_Skeletons', ws: .32, dig: '2H_Melee_Attack_Chop',
              armor: .2, boss: true, ab: { root: { every: 9, first: 4, windup: 1.5, r: 9, n: 3, dur: 3 }, heal: { every: 12, windup: 1, r: 5, pct: .08 } }, desc: '거대한 고목의 군주. 9초마다 타워 3개를 뿌리로 묶고, 주변 몬스터를 치유합니다.' },
  boss_snow:   { n: '빙결의 군주', icon: '👑', model: 'sk_warrior', w: 'w_axe', sh: 'w_shield_large_a', prop: 'ice', tint: 0x8ac8ff, h: 5.4, hp: 3200, spd: 1.2, gold: 140, core: 10, dps: 170, walk: 'Walking_D_Skeletons', ws: .32, dig: '2H_Melee_Attack_Chop',
              boss: true, ab: { crack: { armor: .5, at: .2, after: .1, spd: 1.15, regen: 14 }, snowball: { every: 10, first: 4, windup: 1.2, range: 8, dur: 3.5, k: .5, nova: 3 }, chill: { r: 4.5, k: .75 } }, desc: '얼음 갑옷(피해 -50%, 깨지면 14초 뒤 재생)과 눈보라 일제 투척(타워 3개 빙결)을 씁니다.' },
  boss_fire:   { n: '화염의 군주', icon: '👑', model: 'sk_warrior', w: 'w_axe', prop: 'ice', crystal: [0x3a2420, 0xff5a1a], tint: 0xff9a6a, eye: 0xffd040, h: 5.6, hp: 3400, spd: 1.2, gold: 160, core: 10, dps: 180, walk: 'Walking_D_Skeletons', ws: .32, dig: '2H_Melee_Attack_Chop',
              armor: .2, boss: true, ab: { lavapool: { every: 11, first: 5, windup: 1.6, range: 11, n: 2, dur: 5, dps: 16 }, meteor: { every: 13, first: 8, windup: 1.8, fall: .5, range: 16, n: 3, r: 2.4, tower: 55, hero: 60 }, enrage: { at: .5, spd: 1.25, cd: .65, extra: 2 } },
              desc: '용암 웅덩이(타워 2개를 5초간 마비 + 지속 피해)와 예고된 화염 운석 낙하를 씁니다. 체력 50% 아래에서 분노: 더 빠르고, 더 자주, 운석 +2.' },
  boss_ruins:  { n: '망국의 왕', icon: '👑', model: 'sk_warrior', w: 'w_axe', sh: 'w_shield_large_b', prop: 'ice', crystal: [0x4a3a6a, 0x8a4aff], tint: 0xb0a0d8, eye: 0x6affe8, h: 5.7, hp: 3600, spd: 1.15, gold: 180, core: 10, dps: 185, walk: 'Walking_D_Skeletons', ws: .32, dig: '2H_Melee_Attack_Chop',
              armor: .22, boss: true, ab: { summon: { every: 15, first: 6, windup: 1.4, n: 3, type: 'ruin_guard', hp: .55, r: 2.4, extra: 2 }, curse: { every: 12, first: 9, windup: 1.8, range: 12, r: 3.4, max: 4, dur: 4.5 }, dread: { at: .5, windup: 2.2, r: 8, tower: 90, hero: 70, stun: 2, shield: .12, cd: .7 } },
              desc: '해골 근위병 3마리 소환(보라 원 = 예고), 저주(보라 고리가 깜박인 타워 묶음 최대 4개를 4.5초간 봉인)를 씁니다. 체력 50%에서 어둠의 파동: 2.2초 예고 뒤 주변 타워·영웅 피해 + 어둠 보호막, 이후 더 자주·더 많이 소환.' },
  // 던전 5층 전용 보스 (일반 스테이지·로스터에는 없음). 기믹은 dungeon/boss.js (dgBoss), 모델 = mesh(Meshy, 지연 로딩) · 못 받으면 model(해골 마법사) + 보라 색조 + 왕관
  dg_lich:     { n: '망령 여왕 모르비아', icon: '💀', model: 'sk_mage', mesh: 'lich_meshy', tint: 0xc8b0ff, eye: 0x4affe0, h: 5.6, hp: 3400, spd: 1.3, gold: 200, core: 10, dps: 120, walk: 'Walking_D_Skeletons', ws: .34, dig: 'Unarmed_Melee_Attack_Punch_A',
              armor: .2, boss: true, dgBoss: true, desc: '던전 5층의 주인. 후방 영웅을 노리는 영혼의 창(세라·서윤이 앞을 막으면 대신 맞음), 발밑 망령의 원, 해골 소환, 체력 50% 분노.' },
};
// 3장 화산 · 4장 폐허 — 기존 행동을 재사용한 변형 (폐허는 석상화·실체 소멸·어둠 보호막 추가)
const VARIANTS = {
  ember_slime: ['slime', { n: '용암 슬라임', icon: '🔥', col: 0xff7a2a, hp: 125, ab: { split: { type: 'ember_s', n: 3 } }, desc: '죽으면 불씨 슬라임 3마리로 분열합니다. 범위 공격(대포탑)이 효과적이에요.' }],
  ember_s:     ['slime_s', { n: '불씨 슬라임', icon: '🔥', col: 0xffb84a, hp: 34 }],
  lavahound:   ['icewolf', { n: '용암 사냥개', icon: '🐕', fur: 0x5a2a20, eye: 0xff8a2a, ringC: 0xff8a3a, hp: 75, spd: 4.5, desc: '3마리씩 무리 지어 달립니다. 동료 2마리 이상과 붙어 있으면 이동속도 +30%, 받는 피해 -20% (발밑 주황 고리). 무리를 갈라 놓으세요.' }],
  magmagolem:  ['frostgolem', { n: '마그마 골렘', icon: '🌋', tint: 0xff9a6a, eye: 0xffd040, crystal: [0x3a2420, 0xff5a1a], shell: '용암 껍질', hp: 400, desc: '굳은 용암 껍질이 피해를 60% 막습니다. 체력의 30%만큼 맞으면 껍질이 깨져 방어력이 사라지는 대신 빨라집니다.' }],
  firebomber:  ['bomber', { n: '화염 자폭병', icon: '🧨', tint: 0xffa070, eye: 0xff6a1a, desc: '불붙은 폭탄을 안고 근처 타워·바리케이드로 달려가 자폭합니다 (주변 지형도 무너뜨림). 멀리서 먼저 처치하세요.' }],
  // 4장 폐허
  wraith:      ['wisp', { n: '폐허의 망령', icon: '👻', wisp: [0x6a5a8a, 0x7a2ad0, 0xd0a0ff, 0xb070ff], hp: 85, spd: 2.7, ab: { escort: { r: 12 }, shield: { every: 5.5, first: 2, r: 4.6, n: 3, pct: .3, cap: 170, dur: 8, dark: 1 }, phase: { every: 6.5, first: 3.5, windup: .5, dur: 1.6 } },
                 desc: '하늘을 날며 지상 동료 3명에게 어둠 보호막(체력 30%)을 씌웁니다. 6.5초마다 몸이 깜박인 뒤 1.6초 동안 실체가 사라져(반투명) 공격이 통과해요. 화살탑·마법탑·영웅만 맞힐 수 있어요.' }],
  gargoyle:    ['frostgolem', { n: '석상 가고일', icon: '🗿', tint: 0x9a96a8, eye: 0xc07aff, crystal: [0x6a6478, 0x7a4aff], shell: '돌 껍질', hp: 420, ab: { crack: { armor: .6, at: .3, after: 0, spd: 1.45 }, perch: { every: 9, first: 4, windup: .6, dur: 2.2, mend: .35 } },
                 desc: '돌 껍질이 피해를 60% 막습니다. 9초마다 멈춰 2.2초간 석상이 되어(회색 돔) 무적 + 껍질 일부 회복. 체력의 30%만큼 맞으면 껍질이 깨져 방어력이 사라지는 대신 훨씬 빨라지고 더는 석상이 되지 못해요.' }],
  ruinroot:    ['treant', { n: '폐허 덩굴', icon: '🌿', tint: 0x8a9a7a, eye: 0xc07aff, hp: 540, ab: { root: { every: 7, first: 3, windup: 1.2, r: 6, n: 2, dur: 2.8 } }, desc: '무너진 성벽을 휘감은 덩굴 거인. 7초마다 가까운 타워 2개를 뿌리로 묶어 2.8초 동안 공격을 막습니다 (초록 고리 = 예고).' }],
  ruin_guard:  ['grunt', { n: '해골 근위병', tint: 0xc0b0ff, eye: 0x6affe8, hp: 110, gold: 2, child: true }],
};
for (const [k, [b, o]] of Object.entries(VARIANTS)) ETYPES[k] = { ...ETYPES[b], ...o, base: b };

// ---- 챕터별 몬스터 구성 (데이터) ----
// pool: [종류, 가중치, 등장 레벨]. 레벨 = 웨이브 + 스테이지 순서×2 (뒤 스테이지일수록 첫 웨이브부터 다양). pack 몬스터는 한 번 뽑히면 pack 마리 연속 출현.
// boss: 챕터 마지막 스테이지 보스. ready=false 는 아직 스테이지가 없는 챕터(미리 정의).
const ROSTERS = {
  1: { n: '숲', ready: true, boss: 'boss_forest', pool: [['goblin', 3, 1], ['grunt', 1.2, 1], ['imp', .8, 1], ['wolf', 1.6, 2], ['digger', 1.2, 2], ['slime', 1.3, 3], ['mushroom', .9, 4], ['bat', .5, 5], ['treant', .6, 6], ['golem', .35, 9]] },
  2: { n: '설원', ready: true, boss: 'boss_snow', pool: [['icewolf', .45, 1], ['grunt', 1.2, 1], ['charger', 1.2, 2], ['yeti', .8, 3], ['shield', .9, 3], ['wisp', .7, 4], ['frostgolem', .7, 5], ['bat', .4, 6], ['bomber', .5, 8]] },
  3: { n: '화산', ready: true, boss: 'boss_fire', pool: [['ember_slime', 1.3, 1], ['imp', 1, 1], ['grunt', .8, 1], ['firebomber', 1.2, 2], ['lavahound', 1.2, 2], ['siege', .8, 3], ['magmagolem', .8, 4], ['bat', .5, 5]] },
  4: { n: '폐허', ready: true, boss: 'boss_ruins', pool: [['grunt', 1.1, 1], ['shield', 1, 1], ['gargoyle', .9, 2], ['digger', .8, 3], ['wraith', .8, 3], ['ruinroot', .6, 4], ['siege', .7, 5]] },
};
// 도전 모드: 웨이브가 오를수록 챕터 구성이 섞임 (ch, 시작 웨이브, 레벨 보정)
const ENDLESS_MIX = [[1, 1, 0], [2, 6, -5], [3, 12, -10], [4, 20, -17]]; // 화산은 12웨이브부터, 폐허는 20웨이브부터
const rosterShare = n => Math.min(.55, .2 + .035 * n);
const rosterTypes = ch => ROSTERS[ch] ? [...new Set(ROSTERS[ch].pool.map(p => p[0]).concat(ROSTERS[ch].boss))] : [];

// 웨이브 구성: 기존 무작위 추첨 후, 등장 가능한 신규 몬스터로 일부 교체 (classic 모드에서는 비활성)
const NEW_TYPES = ['digger', 'charger', 'shield', 'bomber', 'siege'];
const NEW_WEIGHT = { digger: 1.2, charger: 1.1, shield: 1, bomber: .8, siege: .7 };
const newShare = n => Math.min(.5, .14 + .045 * (n - 2));

export { ETYPES, NEW_TYPES, NEW_WEIGHT, newShare, ROSTERS, ENDLESS_MIX, rosterShare, rosterTypes };
