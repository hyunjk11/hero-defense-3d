# 진서윤 패치 (2026-10-24) — 브랜치 `seoyun-patch` (worktree /workspace/hd3d_sypatch, main b57e12e 에서)

원칙: 안정성 > 게임성 > 그래픽 · 작은 단계마다 커밋 · 스위트는 하나씩 (`WT=/workspace/hd3d_sypatch bash /workspace/queue_improve.sh <suite>`) · 진행 기록은 /workspace/improve.log (`== HH:MM seoyun-patch ...`)

## 체크리스트 (중단되면 여기서 이어서)
- [x] P-0 worktree · 이 문서
- [x] P-1 발차기 넉백 제거 (돌려차기 kickKb → 없음)
- [x] P-2 기본 공격 속도 -20% (CLASSES.fighter.rate 2.6 → 2.08)
- [x] P-3 거리별 공격 전환: 공격 사거리(기본 2.6) 안 지상 적 = 주먹·발차기 / 그 밖 ~10 = 모든 적에게 장풍 (비행은 가까워도 장풍)
- [x] P-4 천룡파: 더 큰 용(×1.6) · 유도(가까운 안 맞은 적 추적) · 판정 폭·비행 거리 증가
- [x] P-5 백호난무 삭제 → 「백호진천권」(제자리 땅 내려치기: 기 모으기 → 내려찍기 · 화면 흔들림 · 히트스톱 · 빛나는 균열 · 충격파 고리 · 바위 파편·흙먼지 · 백호 기운) · 스킬 id tigerfury → tigerquake (옛 id 별칭)
- [x] P-6 문구: 전직 탭 · 상점 · 주석 · CHANGELOG · 던전 AI(제자리 Q 는 주변에 적이 있을 때만)
- [x] P-7 테스트: node 단위(seoyun/seoyun_adv/advance) · tests/seoyun.py 새 동작 · 스위트 node regress seoyun advance dungeon spire spire_ui gfx (하나씩)
- [ ] P-8 병합 · push · Pages · 스크린샷 /workspace/report_shots/sypatch_*.png

## 진행 기록
- P-0: main b57e12e 에서 시작.
- P-1..P-5 코드 a1a669c · P-6/P-7 d7bacaf · P-4 유도 수정 b26a93f (앞쪽 ±80° · 7 rad/s).
- P-5 연출 다듬기 (Playwright 1440x860 프레임 확인: 기 모으기 / 내려찍기 / +0.3초 / +0.8초): 화이트아웃 원인 = 히트스톱 동안 길게 남은 적 하얀 피격 번쩍임 + 가산 혼합 블룸 → 번쩍임 0.03초로 · 충격파 보통 혼합 · 어두운 그을음 바닥 위 주황 균열 · 입자 수 줄임 · 백호 머리 즉시 등장·파란 외곽선. 끝나면 G.ftN.tqLive 0 · 콘솔 오류 0.
- P-7 스위트 (641d4f1+): node OK · regress diffs 0 · 콘솔 오류 0 · seoyun 80/0 · advance 65/0 · dungeon 103/2 (태블릿 전용 2건, 막지 않음) · spire 26/0 · spire_ui 19/0 · gfx 15/0
