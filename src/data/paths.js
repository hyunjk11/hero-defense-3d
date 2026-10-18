// 몬스터 종류별 경로 비용 프로필 (Stage 3)
// 비용 = 칸 진입 비용(base/grass/carved) + 블록 체력/blockDiv(+blockBase) + 바리케이드 체력/barDiv(+barBase)
// goal: 'core' = 코어로, 'towers' = 가장 가까운 타워 옆 칸으로 (공성병)
export const PATH_PROFILES = {
  default: { goal: 'core', grass: 1.15, carved: 1, base: 1, blockBase: 0, blockDiv: 30, barBase: 1, barDiv: 30 },
  // 굴착병: 파는 속도가 빨라서 블록 체력 부담이 작음 → 직선으로 새 터널을 뚫음
  digger: { goal: 'core', grass: 1.15, carved: 1, base: 1, blockBase: 0, blockDiv: 160, barBase: 1, barDiv: 40 },
  // 돌격병: 이미 파인 길을 강하게 선호, 파기는 매우 싫어함
  charger: { goal: 'core', grass: 1.8, carved: .5, base: 1, blockBase: 6, blockDiv: 10, barBase: 3, barDiv: 12 },
  // 공성병: 타워를 향함 (타워가 없으면 default 로 코어)
  siege: { goal: 'towers', grass: 1.15, carved: 1, base: 1, blockBase: 0, blockDiv: 30, barBase: 1, barDiv: 30 },
};
