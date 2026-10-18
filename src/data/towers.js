
const TOWERS = {
  arrow:  { n: '화살탑', cost: 60, up: [55, 95], dmg: [16, 26, 42], rate: [2.0, 2.4, 2.9], range: [8, 8.8, 9.6], air: true, hp: [260, 360, 480], d: '빠른 단일 공격' },
  cannon: { n: '대포탑', cost: 90, up: [80, 130], dmg: [45, 75, 120], rate: [.55, .62, .7], range: [7, 7.5, 8], splash: [2.2, 2.5, 2.9], air: false, hp: [340, 460, 620], d: '광역 포격 (지상)' },
  magic:  { n: '마법탑', cost: 100, up: [90, 150], dmg: [20, 32, 50], rate: [.9, 1.0, 1.15], range: [7.5, 8, 8.8], chain: [3, 4, 6], slow: [.35, .42, .5], air: true, hp: [300, 410, 550], d: '연쇄 번개 + 둔화' },
};

// 수리 비용 = 잃은 체력 비율 × 누적 투자액 × REPAIR_K (최소 5G)
const REPAIR_K = .45;

export { TOWERS, REPAIR_K };
