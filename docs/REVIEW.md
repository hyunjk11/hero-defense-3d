# 코드 리뷰 · 보안 점검 · 개선 제안 (2026-10-20)

> 작업 중 중단에 대비해 진행하면서 계속 갱신합니다. 범위: `src/`, `index.html`, `supabase/schema.sql`, `models/`, `tests/`.
> 원칙: 이번 작업에서 **코드 변경은 동작 불변 정리 + 명확한 보안 버그 수정만**. 나머지는 아래 "제안"으로만 남깁니다 (안정성 > 게임플레이 > 그래픽 순).

## 적용 현황 (리뷰 구현 작업, 2026-10-20 시작 — 중단 후 재개 시 여기부터)
- [x] 0. S-1 equip.py 2개 FAIL 수정 + `tests/run_all.sh` — 코드 버그 아님(테스트 흐름 문제): ① 강화 1초 연출 뒤 저장인데 고정 1.4초 대기 → 느린 swiftshader에서 놓침 → `lastEnh()` 대기 ② 결과 팝업 문구가 '획득 장비'→'획득 보상 상자 N개'로 바뀜 + 상자 화면 대기 10→40초. equip 31/31
- [x] 1. P-1 태블릿 성능 모드 — `src/render/quality.js`(설정 localStorage `hd3d_gfx`, 기기별) + `src/ui/gfx.js`(메뉴 설정·게임 소리 패널에 자동/고품질/성능). 자동 = 터치 기기·저사양(메모리/코어 ≤ 4)은 성능, 그 외 판 안 4초 평균 FPS < 36 이 두 번이면 성능으로 전환·기억. 성능 모드: 일반 몬스터 그림자 끔(영웅·보스·타워·지형 유지), 작은(h < 2.4)/먼 몬스터 외곽선 끔(보스 유지), 픽셀비 1.25, 그림자 맵 1024. 같은 종류 몬스터 몸 머티리얼 공유(피격 플래시는 (머티리얼, 색)별 플래시 복제본으로 메시 material 교체 → 맞은 개체만 번쩍). stress.py 100마리: draw calls **4,083 → 1,768**(성능) / 삼각형 4.55M → 3.52M / 그림자 캐스터 1,353 → 138 / 몬스터 머티리얼 923 → 264(고품질에서도). swiftshader FPS 0.4 → 1.1~1.5(CPU 렌더·다른 작업과 CPU 공유라 참고용). 측정 `shots/improve/p1_stress.json`, 스크린샷 `shots/improve/p1_{high,perf}{,_close}.png`·`p1_tablet_auto.png`. `tests/gfx.py` 17/17
- [x] 2. S-2/S-3/S-4 — ① 저장 낙관적 동시성: 마지막으로 본 서버 `updated_at`(localStorage `hd3d_cloud_ts_<uid>`)일 때만 `update … where updated_at = 기준` (행 없으면 `insert`, 동시 insert 23505), 0행이면 서버 행을 읽어 `P.merge(로컬, 서버)` 후 재시도(최대 4회). 시작 시 dirty + 서버 시각 변경도 병합. 저장 직렬화(저장 중 저장 → 끝나고 한 번 더). ② 우편 보상 장부: RPC 전에 '받는 중'(`hd3d_mailpend_<uid>`) 기록 → 응답 유실 시 다음 refresh 때 자동 재시도, 세이브 `mailLog`(받은 우편 id, 병합 시 합집합)로 두 번 지급 방지, '받는 중'이 아니던 already 는 지급 안 함. ③ `visibilitychange(hidden)`·`pagehide` 즉시 저장 + 떠나는 중 쓰기 요청 fetch keepalive. **`supabase/schema.sql` 변경**: `hd3d_claim_mail` 이 already 일 때도 `reward` 반환 (create or replace, search_path='' 유지, 멱등) → **Supabase SQL Editor 에서 schema.sql 다시 실행 필요** (안 해도 동작은 하지만 응답 유실 복구만 안 됨). `tests/sync.py` 16/16, schema_pg 56/56 (CAS·already reward 6개 추가)
- [x] 3. P-2 지연 로딩 + budeul_gear.glb 압축 — `characters.js` 모델 키별 1회 로드(promise 캐시) `loadModel/ensureModels/whenModels/loadBackground`, 경로는 여전히 `models/${k}.glb` 한 곳(.glb 를 바꿔 끼워도 그대로 동작). `main.js bootPlan`: 스테이지 출정 = 몬스터 모델 + 저장 영웅(유료면 대체 마법사, 버들이면 장비·변신 로봇)만, 백그라운드 없음 / 인트로·마을 = 저장 영웅만 먼저 → 백그라운드로 몬스터 → 무료 영웅 → 유료 영웅·로봇(버들 저장이면 로봇 먼저) / `?test`·`?skipintro` = 전부(회귀 테스트 불변, `?lazy` 로 지연). 필요한 순간 대기: `choose()`(판 시작 전 몬스터+영웅+로봇 받기, 로딩 표시), 마을 영웅·상점 미리보기·영웅 단상은 도착하면 표시. 변신 로봇 안전장치: `mechInit` 이 로봇 모델이 없으면 받는 즉시 붙이고, 그 전 Q(변신)는 쿨다운 소모 없이 '변신 로봇 준비 중…'. `budeul_gear.glb` gltfpack(meshopt, 위치·UV float 유지, 노드 이름·extras.tip·텍스처 동일) **1.27 MB → 0.54 MB**. 첫 로딩(`tests/lazy.py`, 페이지 전체/모델): 이전 모든 경우 **13.97 / 10.61 MB** → 첫 방문 인트로 **4.56 / 1.20**, 스테이지 마법사 **6.50 / 3.14**, 스테이지 버들 **9.47 / 6.10**, 마을(총사 저장) **5.95 / 2.58** (`shots/improve/p3_firstload{,_before}.json`). 버들 비교 `tests/gearcmp.py` 4자세 평균 픽셀 차 0.01~0.02, 24 초과 픽셀 ≤ 0.005% (가장자리 음영 반올림, 눈으로 동일 — `shots/improve/p3_gear_{orig,new,diff}_*.png`). lazy 16/16, budeul 51/51, shop 38/38, regress 4 known, node 8/8
- [x] 3b. 버들(메카닉) 임시 숨김 (사용자 요청, 리디자인 중 — `/workspace/budeul_study`) — 플래그 하나 `src/data/heroes.js` `CLASSES.mechanic.hidden: true` → `HIDDEN_HEROES`/`VISIBLE_HEROES`/`isHidden`/`DEFAULT_HERO`(보이는 첫 무료 영웅 = 실바 · 궁수). 따라가는 곳: 영웅 선택 카드·단상(`select.js`, `choose(숨긴 영웅)` → 기본 영웅), 마을 영웅 카드(`flow.js`), 상점 목록·관리자 지급 목록(`ui/shop.js PKEYS`), 구매 신청 거부(`account/shop.js onSale`, `heroOwned` false → `usableHero` = 기본 영웅), 모델 로딩 제외(`characters.js` `ASSETS = ALL_ASSETS - HIDDEN_ASSETS`, budeul_meshy·budeul_gear·mech_robot_meshy, `loadModel` 도 거부), 새 드롭/상자/제작 무기(`equip.randomItem` → 기본 영웅 무기), 저장 영웅 이전(`progress.clean` + `account.load` 가 즉시 저장, 클라우드는 hero 가 다르면 다시 저장). **유지**: 서버 hd3d_owned·대기 중 주문·버들 아이템/장착/강화 Lv·코드·schema 상품·`config/shop.js` 상품 정의 → `hidden` 을 지우면 그대로 복구 (단, 숨김 중 이전된 저장 영웅은 실바로 남음). 테스트: heroes.test(숨김 플래그 일관성·선택 불가·상점 미판매·구매 거부·저장 이전·아이템 유지·드롭 없음), equip.test 숨김 반영, budeul.py 는 숨김 중 SKIP(삭제 안 함), lazy.py 숨김 분기(버들 모델 요청 0, 저장 이전, 상점/마을 카드 없음, `shots/improve/p3b_firstload_hidden.json`: 버들 저장 스테이지 출정 9.47 → 6.53 MB). 결과: node 8/8, lazy 21/21, shop 38/38, rose 14/14, equip 31/31, regress 4 known, budeul SKIP
- [ ] 4. 다음 웨이브 미리보기
- [ ] 5. ×2 배속 / 일시정지
- [ ] 마무리: 전체 직렬 테스트, CHANGELOG/README, Pages 빌드 확인

## 0. 진행 상황 (리뷰 작성)
- [x] Part A-1 사용하지 않는 import 14개 · export 7개 제거 (`cd84132`)
- [x] Part A-2 영웅 목록 단일 기준 + 완전성 테스트 `tests/heroes.test.mjs` (`b6ff421`)
- [x] Part A-3 안 쓰는 모델 4개 · 루트 스크린샷 3개 삭제 (5.7 MB)
- [x] Part A-4 장비 id HTML 이스케이프 (낮음, 방어적) + equip.py `item_id_name_escaped` (수정 전 FAIL → 수정 후 OK 확인)
- [x] Part B 보안 · 안정성 · 게임플레이 리뷰 (이 문서)

---

## 1. Part A — 정리 결과 (동작 불변)

| 커밋 | 내용 |
|---|---|
| 정리 1 | 안 쓰는 import 14개: `waves.js QS` · `ai.js GW, rand, rnd` · `flow.js mk, toon, glow, smithOpen, stageOpen, labOpen, openMail` · `input.js S, SPAWN` · `towers.js later`. 안 쓰는 export 7개: `showScreen`, `shopOpen/mailOpen/adminOpen`, `branchOpen`, `equip.MATS`, `stages.chapterOf` |
| 정리 2 | `data/heroes.js`의 `CLASSES`를 영웅 목록의 단일 기준으로: 각 영웅에 `icon` 필드, `HERO_KEYS` export. `progress.HEROES = HERO_KEYS`, 가방 아이콘 표(`gear.js ICON`)와 영웅 선택 줄(`select.js`)이 여기서 생성 → 영웅을 추가할 때 아이콘 표를 빠뜨리는 일(총사 아이콘 'undefined' 버그의 원인)이 구조적으로 불가능. `tests/heroes.test.mjs`: 5개 영웅 모두 ① 수치/이름/아이콘 ② 로딩 목록(ASSETS)·모델 파일 존재 ③ 등급별 무기 이름 ④ 전설 스킬 풀 2개(영웅 일치) ⑤ 한국어 직업 별칭 ⑥ 세이브 기본값/정리 ⑦ 유료 영웅 ↔ 상점 상품 ↔ `schema.sql`(보상·check 제약·valid_reward) 일치 검사 |
| 정리 3 | 어디서도 로드하지 않는 모델 삭제: `models/archer.glb`(261 KB), `mage.glb`(269 KB), `warrior.glb`(757 KB) — KayKit 구버전, Meshy 모델로 교체됨 · `mechanic_meshy.glb`(1.75 MB) — 버들 이전 버전(현재 `budeul_meshy`). 합계 **3.04 MB**. README/테스트 어디에도 안 쓰이는 루트 스크린샷 `login.png`·`mage_ingame.png`·`menu.png` **2.69 MB**. `characters.js`의 죽은 분기 `GL.warrior ||` 제거 (GL.warrior는 로드된 적 없음). 동적 경로 확인: 모델은 `characters.js`의 `ASSETS` 배열 → `models/${k}.glb` 한 곳에서만 로드 |

확인했지만 손대지 않은 것
- `console.log`/`debugger`/TODO/WIP 주석: src 안에 없음 (이미 깨끗).
- `esc()` 이스케이프 함수가 `shop.js`/`gear.js`/`flow.js`에 3벌 중복 → 동작은 같음(shop만 null→''). 합치려면 `core/util.js`로 옮겨야 하는데 util이 `location`을 읽어 node 테스트에서 import 불가 → 작은 `core/html.js` 신설을 제안 (S).
- `shots/`(추적 105개, 약 94 MB)는 테스트 증거용으로 의도적으로 커밋된 것 → 삭제하지 않음. 저장소/Pages 아티팩트 크기 문제 → 제안 참고.
- `tests/roster_last.json`이 추적 중인데 `.gitignore`에는 다른 `*_last.json`만 있음 → 결과 파일이므로 ignore 권장 (삭제는 보류: 비교 기준으로 쓰는지 사용자 확인 필요).
- `tests/equip.py`: `enhance_paid_and_leveled`, `results_popup_after_reveal` 2개 FAIL — **이번 정리 전 커밋 `a7963b7`에서도 동일하게 실패** (보상 상자 보관함 변경 이후 테스트 흐름이 바뀐 것으로 보임). 실제 강화 로직(`equip.test.mjs`)은 통과. 후속 확인 필요 (아래 안정성 항목 S-1).

---

## 2. Part B-1 — 보안

### 2.1 Supabase RLS / RPC (`supabase/schema.sql`)
점검 결과 **치명적(HIGH) 취약점 없음**. 구조가 잘 잡혀 있습니다.

| 질문 | 결과 |
|---|---|
| 사용자가 스스로 영웅을 지급할 수 있나? | 불가. `hd3d_owned`는 select 정책만 있고 insert/update 권한 revoke. 기록은 `hd3d_claim_mail`(SECURITY DEFINER)만, 그 우편은 관리자만 생성(RLS + `hd3d_valid_reward` check). |
| 주문 위조(승인 상태로 넣기, 남의 id로 넣기)? | 불가. 컬럼 권한이 `insert (item)`뿐이고 BEFORE INSERT 트리거가 user_id/email/nickname/status/created_at을 서버 값으로 덮어씀. 이미 보유 시 거부, 대기 중 1개 유니크 인덱스. update는 관리자 RLS. |
| 남의 우편 읽기/받기? | 불가. select RLS `auth.uid() = user_id`(관리자 예외), claim RPC는 `user_id = auth.uid()` 조건의 원자적 update. 중복 받기 → `already`. |
| 관리자 권한 상승? | 어려움. `hd3d_is_admin()` = JWT 이메일 **그리고** `hd3d_admins`에 고정된 user id. `hd3d_admins`는 정책 없음 + revoke. |
| SECURITY DEFINER search_path | 모든 함수 `set search_path = ''` + 스키마 한정 이름 사용 ✓ |
| 입력 검증 | 닉네임 1–12자, 우편 제목 1–60 / 본문 ≤1000, 보상 키 화이트리스트·정수·상한, 저장 jsonb < 64 KB ✓ |

남은 위험 (심각도순)
- **MEDIUM — 관리자 시드 경쟁**: `insert into hd3d_admins ... where lower(email) = 'hyunjk11@daum.net'`. 이메일 인증이 꺼진 프로젝트에서 관리자가 가입하기 전에 누군가 같은 이메일로 먼저 가입하고, 그 뒤 schema.sql이 다시 실행되면 그 계정이 관리자가 됨. 현재 관리자 계정이 이미 등록돼 있으면 영향 없음. 제안: Supabase Auth에서 "Confirm email" 켜기 + 시드를 이메일 대신 **고정 UUID**로 (S).
- **LOW — `hd3d_valid_reward` 캐스트 오류**: `(r->>'souls') ~ '^[0-9]{1,7}$'`와 `::bigint`가 같은 AND 안에 있어 평가 순서가 보장되지 않음 → `{"souls":"abc"}`나 `1.5`는 false가 아니라 예외(22P02). 관리자 RPC만 해당, 데이터 오염 없음. 제안: `case when ... ~ ... then ...::bigint <= 1000000 else false end` (S, schema_pg로 검증).
- **LOW — 거절 후 재신청 스팸**: 대기 1개 제한은 있지만 거절→재신청을 반복하면 관리자 목록/우편이 늘어남. 필요 시 사용자별 시간당 신청 수 제한 (S).
- **LOW — 사용자 데이터 삭제 경로 없음**: profiles/progress에 delete 정책 없음(계정 삭제 시 cascade만). 개인정보 요청 대비 "진행 초기화/계정 삭제" RPC 고려 (M).
- 참고: 주문 테이블에 이메일 사본 저장(관리자 확인용) — 관리자 외에는 RLS로 비공개 ✓.

### 2.2 클라이언트 신뢰 (치트)
- `hd3d_progress.data`는 본인이 쓸 수 있는 jsonb → 영혼석·강철·마력석·장비(등급/강화)·별·연구·최고 웨이브는 **모두 조작 가능** (개발자 도구로 localStorage 또는 upsert). `P.clean()`은 형식/범위만 정리할 뿐 "정당하게 얻었는지"는 모름.
- **유료 영웅도 클라이언트 측에서는 우회 가능**: 소유권 자체는 서버(`hd3d_owned`)라 위조 불가지만, 게임 로직이 모두 브라우저에서 돌기 때문에 JS를 고치면 잠긴 영웅으로 플레이할 수는 있음. 서버 소유권 기록·결제 흐름은 안전하므로 "정직한 사용자 기준 판매"로는 충분. 완전 차단은 서버 권위 게임이 필요해 비현실적.
- 판단: **싱글 플레이 게임으로서는 허용 가능** (본인만 손해). 단, **리더보드/랭킹/PvP/거래**를 붙이는 순간 문제가 됨 → 제안: ① 기록 제출은 별도 RPC로만(`hd3d_submit_run(stage, wave, seed, duration, inputs_hash)`), ② 서버에서 상한·시간 대비 타당성 검사, ③ 가능하면 시드+입력 기록 재생 검증(이미 `?seed`/`?rng` 결정성 인프라가 있어 유리), ④ 리더보드는 progress jsonb가 아닌 별도 테이블 (L).

### 2.3 XSS (innerHTML)
- 서버/사용자 문자열 전수 확인: 닉네임(`flow.js twAcct`, 관리자 주문 목록), 이메일, 우편 제목·본문, 보상 문구, 주문 상품명, 오류 메시지(`r.msg`, `error.message`) → **모두 `esc()` 적용** 또는 `textContent` 사용 ✓. 장비 이름 `it.n` → `esc()` ✓ (게다가 `cleanItem`이 24자로 자름).
- **LOW (수정함)**: 장비 id(`data-id="${it.id}"`, 분해 목록 `data-id="${id}"`)는 이스케이프 없음. 출처가 본인 세이브뿐이라 self-XSS 수준이지만(16자 제한), 방어적으로 `esc()` 적용.
- 서버 id(`m.id`, `o.id`)는 bigint identity, 날짜는 `fmtD`가 숫자로 재구성 → 안전.
- 제안: CSP `<meta http-equiv="Content-Security-Policy">` (`default-src 'self'; connect-src 'self' https://tlfnyxtsftamjkrftpoz.supabase.co wss://...; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'`) — 인라인 style 속성이 많아 style은 unsafe-inline 필요. 스크립트는 전부 모듈 파일이라 `script-src 'self'` 가능 (importmap 인라인 → 해시 필요) (S–M, 전체 테스트 필수).

### 2.4 비밀 정보 · 의존성
- 저장소/히스토리 검색(`service_role`, `sb_secret`, JWT `eyJhbGci`, 개인키): **없음** ✓. `sb_publishable_...` 키는 공개용으로 문제없음.
- 의존성은 모두 `lib/`에 벤더링(three r186, supabase-js 2.109.0) → 런타임 CDN 공급망 위험 없음 ✓. 대신 보안 업데이트를 수동으로 따라가야 함 → 분기마다 버전 확인 제안 (S). `tools/bundle.py`로 만든 번들임이 헤더에 기록돼 있어 재현 가능.
- Playwright/psql은 테스트 전용, 배포물 아님.

---

## 3. Part B-2 — 안정성 / 성능

| # | 항목 | 관찰 | 제안 | 노력 |
|---|---|---|---|---|
| S-1 | 테스트 신뢰도 | `equip.py` 2개가 이전 커밋부터 FAIL. 무거운 Playwright 테스트를 병렬 실행하면 `tower.py`가 타임아웃(단독 실행 27/27) | equip.py 흐름을 상자 보관함 UI에 맞게 갱신, 테스트 러너(`tests/run_all.sh`)로 직렬 실행·요약 | S |
| S-2 | 기기 간 저장 충돌 | 저장은 "마지막에 쓴 쪽이 이김". 두 기기가 모두 오프라인에서 진행(dirty)하면 늦게 올린 쪽이 다른 기기의 장비·상자를 덮어씀. 첫 로그인 병합(`P.merge`)만 있음 | `data.rev`(또는 `updated_at`) 낙관적 동시성: upsert 전에 서버 rev 비교 → 다르면 `P.merge(local, cloud)` 후 저장. 장비는 id 기준 합집합이라 merge가 이미 있음 | M |
| S-3 | 우편 보상 유실 | `claim` RPC가 성공(claimed=true)했는데 응답이 끊기면 영혼석/재료가 로컬에 안 더해지고 다음엔 `already` → 유실 (영웅은 서버 기록이라 안전) | 세이브에 `claimedMail: [id]` 장부 → `already`인데 장부에 없으면 RPC가 돌려준 reward를 적용 (RPC가 already일 때도 reward 반환하도록) | S–M |
| S-4 | 종료 시 저장 | `beforeunload`에서 async `save()` → 브라우저가 기다려 주지 않아 자주 누락(로컬엔 남고 dirty라 다음 실행 때 올라가므로 치명적이진 않음) | `visibilitychange(hidden)` 시 즉시 flush, fetch `keepalive` | S |
| S-5 | Supabase 다운 | 로그인/테이블 확인 실패 → 'error' 상태 + 15초 후 재시도, 저장은 백오프 재시도, 상점은 '서버 연결 실패' 표시 ✓. supabase-js도 벤더링이라 CDN 장애 무관 ✓ | 오프라인 배너에 "다시 시도" 버튼 정도 | S |
| P-1 | 드로 콜 | `stress.py` 기준 몬스터 100마리에서 **약 4,100 draw calls / 450만 삼각형** (스키닝 캐릭터 메시마다 외곽선 메시 추가, 그림자 패스 포함). 태블릿에서 가장 큰 병목 | ① 원거리/작은 몬스터 외곽선 끄기 또는 LOD, ② 그림자 캐스터를 영웅·보스·타워로 제한, ③ 같은 종류 몬스터 머티리얼 공유(현재 `material.clone()` 개체마다) — 피격 플래시는 instance color/uniform으로 | M |
| P-2 | 첫 로딩 | 시작 시 15개 모델 약 **10 MB**를 전부 로드 (보유하지 않은 유료 영웅·변신 로봇 포함). 각 Meshy 영웅 ~25k 삼각형 | 선택 영웅 + 현재 챕터 몬스터만 먼저, 나머지는 지연 로드. `budeul_gear.glb`(1.27 MB)는 meshopt 미압축 → 다른 모델처럼 `gltfpack -cc` 하면 ~0.5 MB 예상 | S–M |
| P-3 | 메모리 누수 | 마을↔스테이지 전환이 `location.replace`(페이지 새로고침)라 장면 누적 누수는 구조적으로 없음 ✓. 판 안에서는 투사체/전리품/HP바 dispose 확인 ✓ | 긴 '끝없는 도전'에서 `renderer.info.memory` 추이를 stress 테스트에 추가 | S |
| P-4 | 저장소 크기 | `shots/` 94 MB가 main에 있어 Pages 아티팩트·clone이 무거움 (플레이어는 다운로드 안 함) | 스크린샷은 Actions artifact 또는 별도 브랜치로 | S |

---

## 4. Part B-3 — 게임플레이 / 콘텐츠 제안 (우선순위순)

| 순위 | 제안 | 이유 | 노력 |
|---|---|---|---|
| 1 | **태블릿 성능 모드** (외곽선/그림자/픽셀비 자동 하향, 설정 토글) | 안정성 최우선 — 프레임 저하는 모든 콘텐츠의 체감을 깎음 (P-1) | M |
| 2 | **기기 간 저장 충돌 해결 + 보상 장부** (S-2, S-3) | 유료/보상 아이템 유실은 신뢰 문제 | M |
| 3 | 웨이브 미리보기 (다음 웨이브 몬스터 아이콘·특성) | 신규 몬스터가 많아져 건설 단계 판단 근거 필요. `stageWave()`가 순수 함수라 쉬움 | S |
| 4 | 배속(×2) / 일시정지 버튼 | 반복 플레이 피로 감소, `G.sim(dt)` 구조라 안전하게 구현 가능 | S |
| 5 | 일일 도전 (고정 시드 맵 + 같은 몬스터 구성) | `?seed`/`?rng` 결정성 인프라 재활용, 리더보드 전 단계로 적합 | M |
| 6 | 영웅 간 시너지 / 2인 출정(보조 영웅 AI) | 5명 영웅 수집 동기 강화 | L |
| 7 | 5장(새 테마) + 업적 시스템 | 콘텐츠 볼륨 | L |
| 8 | 튜토리얼 정리 (첫 판 바리케이드·개간 안내) | 지형 파괴 시스템이 독특해서 초반 이탈 위험 | S |
