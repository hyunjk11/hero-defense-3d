# CHANGELOG

## 2026-10-18 — 구조 개편 + 신규 몬스터 5종 + 타워 체력

### 구조 (Stage 1)
- 단일 main.js → `src/` 역할별 모듈: `data/`(terrain, heroes, monsters, towers, paths — 스탯 데이터 주도), `core/`(grid, state, util, waves), `world/`(terrain, pathfinding, towers, barricades), `monsters/`(enemy, ai), `heroes/`(hero, skills), `combat/`(projectiles), `render/`(scene, toon, vfx, hpbars, characters, route), `audio/`, `ui/`(hud, input, select). main.js는 68줄 부트/루프만 남음.

### 경로 탐색 (Stage 3)
- 몬스터 타입별 비용 프로필(default / digger: 굴착 선호 / charger: 파인 길 강선호 / siege: 타워 목표) 별 다익스트라 흐름장 캐시. 지형 변경 시 dirty 플래그 + 0.35s 스로틀 재계산, 필요한 프로필만 계산.
- 굴착병이 판 터널은 일반 지형(CARVED)이라 모든 몬스터가 이용.
- 겹침 밀어내기: 64마리 초과 시 공간 해시(O(n)), 이하는 기존과 동일 순서. 100마리 초과 시 애니메이션 격프레임, 140마리 초과 시 적 그림자/외곽선 끔.

### 신규 몬스터 (Stage 2)
- 굴착병: 지형을 ~5.7배 빠르게 파서 새 터널 개척 (흙 1.25s vs 기존 7s)
- 돌격병: 파인 길 선호(경로의 94%가 참호), 참호 위 전력 질주(최고 6.4)
- 방패병: 정면 원거리 피해 85% 감소, 근접 40% 감소, 옆 30%, 뒤 +25%; 방향 없는 범위 피해는 그대로
- 자폭병: 근처 타워/바리케이드로 돌진 → 점화 → 폭발(타워 170 피해, 주변 지형 파괴)
- 공성병: 타워를 목표로 이동, 공성 망치로 타워 공격·파괴 후 코어로
- 타워 체력/파괴/수리(UI 버튼, R 키, 골드 비용), 업그레이드 시 최대 체력 증가
- 웨이브 소개 배너/설명. `?classic=1` 은 기존 웨이브 구성 유지

### 테스트 (Stage 0/4)
- `tests/regress.py` (?test 시드 RNG + 수동 시계) — 기준 대비 MATCH (영웅·타워·사운드 트리거·지형 굴착·밸런스)
- `tests/monsters.py` — 신규 몬스터 행동, 타워 파괴·수리 ALL OK
- `tests/stress.py` — 100/200/300마리: 로직 스텝 평균 2.0/2.5/3.7ms, 경로 재계산 0.14ms/회(최대 1.6ms)
