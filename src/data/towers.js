
// 타워 공격속도 전체 배율 (2026-10-20 사용자 요청: 모든 타워 20% 느리게 = 초당 공격 ×0.8, 공격 간격 ×1.25).
// 기본 수치 한 곳에만 적용 → ★/분기/연구(lab)/전직 보너스는 그 위에 곱으로 그대로. 영웅 공속·투사체 속도·×2 배속과는 무관
export const TOWER_RATE_K = .8;
const R = a => a.map(v => +(v * TOWER_RATE_K).toFixed(4));
const TOWERS = {
  arrow:  { n: '화살탑', cost: 60, up: [55, 95], dmg: [16, 26, 42], rate: R([2.0, 2.4, 2.9]), range: [8, 8.8, 9.6], air: true, hp: [260, 360, 480], d: '빠른 단일 공격' },
  cannon: { n: '대포탑', cost: 90, up: [80, 130], dmg: [45, 75, 120], rate: R([.55, .62, .7]), range: [7, 7.5, 8], splash: [2.2, 2.5, 2.9], air: false, hp: [340, 460, 620], d: '광역 포격 (지상)' },
  magic:  { n: '마법탑', cost: 100, up: [90, 150], dmg: [20, 32, 50], rate: R([.9, 1.0, 1.15]), range: [7.5, 8, 8.8], chain: [3, 4, 6], slow: [.35, .42, .5], air: true, hp: [300, 410, 550], d: '연쇄 번개 + 둔화' },
};

// 수리 비용 = 잃은 체력 비율 × 누적 투자액 × REPAIR_K (최소 5G)
const REPAIR_K = .45;

// 바리케이드: 설치 비용 · 철거 환급 (ui/input.js 건설·철거, ui/hud.js 버튼 표시, index.html 도구 버튼 가격)
const BARRICADE = Object.freeze({ cost: 30, refund: 15 });
export const barHpAt = (lv, adv = 1) => 320 * (1 + .25 * lv) * adv; // 바리케이드 체력 (world/barricades.js barMaxHp · Q-7 #ups 미리보기)

export { TOWERS, REPAIR_K, BARRICADE };
