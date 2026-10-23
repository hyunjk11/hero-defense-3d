# 진서윤(격투가) 전직: 🐯 백호권성 / 🐉 천기권사 (2026-10-23 기획 → 2026-10-24 구현)

기획서: /workspace/plans/SEOYUN_ADV_2026-10-23.md · 브랜치 `seoyun-adv` (worktree /workspace/hd3d_sadv)
원칙: 안정성 > 게임성 > 그래픽 · 작은 단계마다 커밋 · 전직 안 한 서윤은 기존과 완전히 동일 · 새 모델 없음(기존 서윤 모델 + 이펙트)

## 체크리스트 (중단되면 여기서 이어서)
- [x] SA-0 worktree · 체크리스트 문서
- [ ] SA-1 데이터/밸런스: ADV.fighter.tiger/dragon (advance.js) · data/fighter.js 전직 옵션 함수(ftOpt·jpLevel/jpMul 옵션 인자, 기본값 불변) · node 테스트
- [ ] SA-2 🐯 백호권성: 3타 완성 후 다음 유효 근접 타격 +35% (빗나가면 유지) · 콤보 피해 2% 회복(상한 최대 체력 2%/콤보) · Q 백호난무(돌진 → 6연타 75% → 250% 회전 발차기·넉백(보스 넉백 없음), 시전 중 받는 피해 -30%) · 붉은 백호 실루엣
- [ ] SA-3 🐉 천기권사: 완전 충전 0.8초 · 300% · 판정 폭 ×1.2 · 장풍 맞은 적 1초 20% 둔화 · Q 천룡파(직선 16 · 폭 3.0(중심선 ±1.5) · 500% 관통 1회 · 일반 1초 기절 / 보스 2초 25% 둔화) · 푸른 용 실루엣
- [ ] SA-4 여신탑 UI/아이콘/설명 확인 (공용 전직 탭 자동 표시, '준비 중' 문구 제거 확인) · G_REGISTRY · CHANGELOG
- [ ] SA-5 테스트: advance.test.mjs · seoyun.test.mjs · advance.py(서윤 두 분기) → 스위트 node regress advance dungeon stats clicks stages (하나씩)
- [ ] 병합 · push · Pages · 스크린샷 /workspace/report_shots/sadv_*.png

## 진행 기록
- SA-0: origin/main dcb34c6 에서 시작.
