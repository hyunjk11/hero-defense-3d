
const TOWERS = {
  arrow:  { n: '화살탑', cost: 60, up: [55, 95], dmg: [16, 26, 42], rate: [2.0, 2.4, 2.9], range: [8, 8.8, 9.6], air: true, d: '빠른 단일 공격' },
  cannon: { n: '대포탑', cost: 90, up: [80, 130], dmg: [45, 75, 120], rate: [.55, .62, .7], range: [7, 7.5, 8], splash: [2.2, 2.5, 2.9], air: false, d: '광역 포격 (지상)' },
  magic:  { n: '마법탑', cost: 100, up: [90, 150], dmg: [20, 32, 50], rate: [.9, 1.0, 1.15], range: [7.5, 8, 8.8], chain: [3, 4, 6], slow: [.35, .42, .5], air: true, d: '연쇄 번개 + 둔화' },
};

export { TOWERS };
