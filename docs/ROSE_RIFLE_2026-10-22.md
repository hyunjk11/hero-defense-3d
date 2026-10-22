# 로즈 2차 전직 교체: 🥀 가시 장미 포격수 → 🎯 장미 저격수 (2026-10-22)

요청: "로즈 전직을 바꿀까?? 일번전직은 그대로 하고 이번전직은 모델 다시 뽑아서 소총으로, 느리지만 강하게"

## 체크리스트
- [x] 조사: 전직 데이터(src/data/advance.js), 효과(src/heroes/advfx.js, gunner.js), 모델 파이프라인(gunner3d/nopose, budeul_study)
- [x] Meshy: 레퍼런스 이미지(몸=총 없는 로즈, 소총 소품) → image-to-3d (/workspace/rose_rifle/body, rifle)
- [x] Meshy: 몸 리깅 + 소총 애니메이션(대기/달리기/조준·사격/피격/쓰러짐) — 대기는 IdleBase+Ready 팔 graft, AimRun = 달리기 다리+견착 팔
- [x] 모델 후처리: 압축(gltf-transform) 몸 1,118,524 B(1.07MB) · 소총 263,644 B(0.25MB). 소총은 강체 별도 모델 — 매 프레임 손잡이=오른손 손바닥, 총열=왼손 손바닥 방향으로 배치(rifleRig, 손바닥-총열 거리 실측 ≤0.03)
- [x] 게임: ADV.gunner.thorn 데이터 교체 (키 `thorn` 유지 → 저장 호환)
- [x] 게임: 기본 공격 = 관통 소총 탄(3명 100/70/50%) · 치명 +15% · 보스/정예 +20% · 소총 트레이서 (rifleShot, 즉발 직선 폭 0.75)
- [x] 게임: Q 관통 저격 (0.6초 조준 → 길이 32 직선 위 전원 600% 관통 빔)
- [x] 게임: 소총 모델 지연 로딩(저격수 분기일 때만, 배경 로딩 목록에 없음) + 실패 시 쌍권총 모델로 대체 (tests/rose_rifle.py fallback_pistols: 404 → gunner_meshy, 관통·수치 그대로)
- [x] 타워 보너스: 화살 타워 사거리 +8% (growth.test.mjs)
- [x] 테스트: advance.test.mjs · icons.test.mjs · growth.test.mjs · node 전체 (13/13)
- [x] 테스트: 브라우저 rose_rifle(14 ok) → advance(54 ok) → items_ui(55/55) → tablet(198 ok) → regress(DIFF 1 = boot.models 에 rose_rifle_* 추가, 예상된 차이 · 허용 4 이내, 콘솔 오류 0) (하나씩)
- [x] 스크린샷 shots/advance/rose_rifle_*.png (턴어라운드 · 인게임 1440x860/1024x600 · 전직 탭 카드) 직접 확인
- [x] CHANGELOG
- [x] push + GitHub Pages built + 라이브 200 (models/rose_rifle_meshy.glb · rose_rifle_gun.glb 200)

## 저장 호환
분기 키 `thorn` 을 그대로 쓰고 내용만 바꿈 → 기존 `{adv:{gunner:{b:'thorn',n}}}` 저장은 비용 없이 자동으로 장미 저격수가 됨 (cleanAdv 는 키만 확인).

## 수치 (기본 피해 13 · 공속 4.2, 강화 없음)
| | 단일 DPS(이론) | 단일 실측 20초 | 부채꼴 9마리 실측 | 일렬 3마리 실측 |
|---|---|---|---|---|
| 🌹 장미 결투가 | 65.5 | 65.0 | 81.6 | 75.7 |
| 🥀 옛 가시 장미 포격수 | 65.5 (13×2 × 4.2×0.6) | — | — | — |
| 🎯 장미 저격수 | 66.0 (보스 79.2) | 62.6 | 64.2 | 143.0 |
이론 무리 6마리(advSwarmDps): 결투가 81.9 > 저격수 ≈73.9. 실측은 치명타 난수 때문에 실행마다 ±3 정도 흔들림.
