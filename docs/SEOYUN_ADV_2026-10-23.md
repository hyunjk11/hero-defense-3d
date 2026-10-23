# 진서윤(격투가) 전직: 🐯 백호권성 / 🐉 천기권사 (2026-10-23 기획 → 2026-10-24 구현)

기획서: /workspace/plans/SEOYUN_ADV_2026-10-23.md · 브랜치 `seoyun-adv` (worktree /workspace/hd3d_sadv)
원칙: 안정성 > 게임성 > 그래픽 · 작은 단계마다 커밋 · 전직 안 한 서윤은 기존과 완전히 동일 · 새 모델 없음(기존 서윤 모델 + 이펙트)

## 체크리스트 (중단되면 여기서 이어서)
- [x] SA-0 worktree · 체크리스트 문서
- [x] SA-1 데이터/밸런스: ADV.fighter.tiger/dragon (advance.js) · data/fighter.js 전직 옵션 함수(ftOpt·jpLevel/jpMul 옵션 인자, 기본값 불변) · node 테스트
- [x] SA-2 🐯 백호권성: 3타 완성 후 다음 유효 근접 타격 +35% (빗나가면 유지) · 콤보 피해 2% 회복(상한 최대 체력 2%/콤보) · Q 백호난무(돌진 → 6연타 75% → 250% 회전 발차기·넉백(보스 넉백 없음), 시전 중 받는 피해 -30%) · 붉은 백호 실루엣
- [x] SA-3 🐉 천기권사: 완전 충전 0.8초 · 300% · 판정 폭 ×1.2 · 장풍 맞은 적 1초 20% 둔화 · Q 천룡파(직선 16 · 폭 3.0(중심선 ±1.5) · 500% 관통 1회 · 일반 1초 기절 / 보스 2초 25% 둔화) · 푸른 용 실루엣
- [ ] SA-4 여신탑 UI/아이콘/설명 확인 (공용 전직 탭 자동 표시, '준비 중' 문구 제거 확인) · G_REGISTRY · CHANGELOG
- [ ] SA-5 테스트: advance.test.mjs · seoyun.test.mjs · advance.py(서윤 두 분기) → 스위트 node regress advance dungeon stats clicks stages (하나씩)
- [ ] 병합 · push · Pages · 스크린샷 /workspace/report_shots/sadv_*.png

## 진행 기록
- SA-0: origin/main dcb34c6 에서 시작.
- SA-1: ADV.fighter(tiger/dragon) 추가 · data/fighter.js ftOpt/comboHeal/TF/DW/inLine (jpLevel·jpMul 은 옵션 인자, 기본 FT). node 전체 통과 · 새 tests/seoyun_adv.test.mjs.
- SA-2: 백호권성 — 돌려차기(3타)가 맞으면 콤보 완성 → 피니시 대기(fin) · 콤보 동안 실제로 깎은 피해 합의 2% 회복(콤보당 최대 체력 2% 상한, G.advHeal 합산). 피니시는 맞혔을 때만 소비, 콤보가 끊기면(1.4초) 사라짐. Q 백호난무 = hero.ft.leap kind 'fury' (도약과 같은 정리 경로: 사망·워프 → ftStop). 대상이 죽거나 멀어지면 가까운 지상 적으로 교체, 보스는 넉백 없음. 시전 중 피격 ×0.7 (hero.js heroDamage → ftGuard). 피니시 순간 캔버스로 그린 붉은 백호 머리 스프라이트 0.4초.
- SA-3: 천기권사 — charge/release/wave 가 hero.ft.o(ftOpt) 를 읽음: 완전 충전 0.8초 · 300% · 판정 폭 1.3→1.56 · 맞은 적 1초 20% 둔화(약 장풍 포함). 장풍 색 청록. Q 천룡파 = 0.32초 기 모으기 → 푸른 용(원뿔 머리 + 구슬 몸통, 성능 모드 6마디) 직선 16 진행, 판정은 이동 구간 기준 반폭 1.5 · 적마다 1회 · 일반 1초 기절 / 보스 2초 25% 둔화.
- 브라우저 확인: tests/advance.py --only game --br tiger,dragon → 전부 OK (tiger_guard 52.5 = 100×0.75×0.7, 끝나면 75), 콘솔 오류 0.
