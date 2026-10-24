# ✨ 타워 초월 (하드 전용 4번째 단계) — 작업 체크리스트 (2026-10-24)

계획: [TOWER_AWAKEN_PLAN_2026-10-24.md](TOWER_AWAKEN_PLAN_2026-10-24.md) · 브랜치 `tower-awaken` (main 576fa4f 에서)
해금 조건 (사용자 결정): **연구소 3종 연구 전부 최대** (`AWK.needLab = true`) **그리고** 지금 하드 스테이지 판에 화살·대포·마법 각 1기 이상 Lv.3 + ★★★ + 진화.

- [x] W-0 브랜치 · 계획 복사 · 이 체크리스트
- [x] W-1 data/growth.js: AWK 표 · labMaxed · awakenStatus/awakenReady · awkCost/awkBlock · towerStats(aw) · branchFor(aw) · poolHits + tests/awaken.test.mjs
- [x] W-2 world/growth.js checkAwaken/awakenTower/awkDeco · world/towers.js 호출 지점·내구도 ×1.3·꿰뚫기/일제사격/천뢰 · combat/projectiles.js 꿰뚫기·불바다(상한 8)
- [x] W-3 UI: #tAwk 체크리스트(연구소 + 판 안, 종류별) · #tUp 문구/미리보기 · input.js 클릭 · style.css · 도움말
- [x] W-4 Q.perf 분기 · endstats ✨ · G 레지스트리
- [x] W-5 tests/awaken.py (1440×860) · hard_balance 참고 — 18 검사 OK. hard_balance 는 생략: aw=false 수치 동일(awaken.test.mjs 회귀 동일성), 초월은 연구소 만렙 이후 추가 단계라 기존 하드 밸런스 수치 변경 없음
- [ ] W-6 스위트 · CHANGELOG · 병합 · Pages · 스크린샷
