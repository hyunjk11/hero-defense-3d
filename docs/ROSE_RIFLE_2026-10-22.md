# 로즈 2차 전직 교체: 🥀 가시 장미 포격수 → 🎯 장미 저격수 (2026-10-22)

요청: "로즈 전직을 바꿀까?? 일번전직은 그대로 하고 이번전직은 모델 다시 뽑아서 소총으로, 느리지만 강하게"

## 체크리스트
- [x] 조사: 전직 데이터(src/data/advance.js), 효과(src/heroes/advfx.js, gunner.js), 모델 파이프라인(gunner3d/nopose, budeul_study)
- [ ] Meshy: 레퍼런스 이미지(몸=총 없는 로즈, 소총 소품) → image-to-3d
- [ ] Meshy: 몸 리깅 + 소총 애니메이션(대기/달리기/조준·사격/피격/쓰러짐)
- [ ] 모델 후처리: 압축(gltf-transform), 소총을 오른손 뼈에 강체로 부착 + 왼손 쪽으로 총열 방향
- [ ] 게임: ADV.gunner.thorn 데이터 교체 (키 `thorn` 유지 → 저장 호환)
- [ ] 게임: 기본 공격 = 관통 소총 탄(3명 100/70/50%) · 치명 +15% · 보스/정예 +20% · 소총 트레이서
- [ ] 게임: Q 관통 저격 (0.6초 조준 → 직선 관통 빔)
- [ ] 게임: 소총 모델 지연 로딩 + 실패 시 쌍권총 모델로 대체
- [ ] 타워 보너스: 화살 타워 사거리 +8%
- [ ] 테스트: advance.test.mjs · icons.test.mjs · growth.test.mjs · node 전체
- [ ] 테스트: 브라우저 advance → items_ui → tablet → regress (하나씩)
- [ ] 스크린샷 shots/advance/rose_rifle_*.png (턴어라운드 · 인게임 1440x860/1024x600 · 전직 탭 카드) 직접 확인
- [ ] CHANGELOG
- [ ] push + GitHub Pages built + 라이브 200

## 저장 호환
분기 키 `thorn` 을 그대로 쓰고 내용만 바꿈 → 기존 `{adv:{gunner:{b:'thorn',n}}}` 저장은 비용 없이 자동으로 장미 저격수가 됨 (cleanAdv 는 키만 확인).
