# 진서윤 고유 무기 (2026-10-23) — 진행 체크리스트

브랜치 `uqfighter` · 워크트리 `/workspace/hd3d_uq_fighter` · 테스트 큐 `/workspace/queue_uqf.sh` (로그 `/workspace/uqf.log`)

## 설계 (확정)
- 키 `d_fist` (id `u_d_fist`), 무기 · 영웅 `fighter`, `ch: 'dg'`(던전), `src: { dungeon: 'dg_lich' }`
- 이름 **묘신 너클 호랑냥이** · 고정 옵션 공격력 +24% / 치명타 +8% / 치명 피해 +18% / 공격 속도 +10% (전투력 680 — 기존 최고 v_sword 670)
- [E] `catpaw` **묘신 냥발 장풍**: 거대한 고양이 발 기파 직선 14 · 폭 2.4 관통(비행 포함) 360% + 밀쳐내기 + 3초간 받는 피해 +20% · 재사용 11초
- ★3: 끝에서 냥발 도장 폭발 (반경 3.5 · 200% · 기절 1초, 보스 0.3초)
- 획득 ① 모르비아 처치(메달 원정, 완주) 시 서버 판정 5% · 천장 40회 (40번째 처치에 확정) — `hd3d_dungeon_finish` 안에서 굴림, 우편(items uq)으로 배달
- 획득 ② 던전 상점 🏅450 (판당 최대 15·하루 45 → 완주만 10일, 평균 ~12/판이면 ~12.5일), 계정당 1개 서버 강제
- 서버 지갑 `hd3d_dungeon_wallet.uniques text[]` · `uq_pity int` — 한 번 얻으면(드롭·구매·관리자 우편 받기) 더 안 떨어지고 상점은 '보유 중'
- 연습 원정(게스트·오프라인·schema 미실행)은 드롭·천장 없음

## 체크리스트
- [x] 데이터: items.js UQ.d_fist + UQ_DG 상수, LSK.catpaw
- [x] 스킬 구현 fighter.js catpaw + legend.js 연결
- [x] 도감/카드 출처 텍스트 (gear.js)
- [x] 던전 데이터: DG_SHOP 고유 상품, shopState 보유, DG_REASON
- [x] account/dungeon.js: uniques/uqPity, finish 드롭 결과, buy
- [x] UI: 상점 보유/품절, 입장 화면 안내, 결과 화면 드롭 표시
- [x] schema.sql: 지갑 열, valid_item d_fist, uq_roll, finish/buy/status/claim_mail
- [x] sbmock.js 흉내
- [x] node 테스트 (items/dungeon/admin/unique)
- [x] schema_pg 추가
- [ ] 브라우저 tests/uqfighter.py + 스크린샷 shots/seoyun/
- [ ] 스위트 단독 실행: node, dungeon, seoyun, unique, items_ui, shop, schema_pg, regress, uqfighter
- [ ] main 병합 · push · Pages 확인

## 진행 기록
- schema_pg 227/227 OK (U4/U5 auth.users insert 충돌 → on conflict do nothing 로 수정)
- node 테스트 전부 OK (items 16개·admin catalog 16·dungeon 상점 고유 가격/롤 상수 = schema.sql)
- 목 sbmock: 기본은 드롭 안 함(천장 40만), `__mockflags.dgUqRoll=true` 면 드롭
