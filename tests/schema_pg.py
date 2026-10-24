#!/usr/bin/env python3
"""supabase/schema.sql 서버 측 보안 테스트: 로컬 임시 PostgreSQL(17)에 Supabase auth 스텁(auth.users/auth.uid()/auth.jwt(), anon/authenticated 역할)을 만들고
schema.sql 을 두 번 실행(idempotent) 한 뒤, authenticated 역할 + JWT 클레임으로 RLS·트리거·RPC 를 검사.  python3 tests/schema_pg.py
PostgreSQL 바이너리가 없으면 SKIP (exit 0)."""
import os, sys, subprocess, tempfile, shutil, glob, json, time, socket
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bins = sorted(glob.glob('/usr/lib/postgresql/*/bin/initdb')) or ([os.path.join(os.environ['PG_BIN'], 'initdb')] if os.environ.get('PG_BIN') else []) # PG_BIN = 다른 위치의 PostgreSQL bin (예: npm @embedded-postgres)
if not bins: print('SKIP: postgres not found'); sys.exit(0)
B = os.path.dirname(bins[-1]); tmp = tempfile.mkdtemp(prefix='hd3dpg'); data = os.path.join(tmp, 'data')
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
subprocess.run([f'{B}/initdb', '-D', data, '-U', 'postgres', '-A', 'trust'], check=True, stdout=subprocess.DEVNULL)
subprocess.run([f'{B}/pg_ctl', '-D', data, '-o', f'-p {PORT} -k {tmp} -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
res = {}
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
def psql(sql, role=None, claims=None):
    pre = ''
    if claims is not None: pre += f"\\o /dev/null\nselect set_config('request.jwt.claims', '{json.dumps(claims)}', false);\n\\o\n"
    if role: pre += f'set role {role};\n'
    p = subprocess.run(['psql', '-h', tmp, '-p', str(PORT), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], input=pre + sql, capture_output=True, text=True, env={**os.environ, 'PGOPTIONS': '-c client_min_messages=warning'})
    return p.returncode == 0, p.stdout.strip().split('\n')[-1] if p.stdout.strip() else '', p.stderr.strip()
try:
    STUB = """
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
    -- 기존 cart_ 테이블이 있어도 건드리지 않는지 확인용
    create table public.cart_dummy (id int); insert into public.cart_dummy values (1);
    insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'hyunjk11@daum.net'), ('00000000-0000-0000-0000-000000000001', 'u1@test.kr'), ('00000000-0000-0000-0000-000000000002', 'u2@test.kr');
    """
    ok('stub', psql(STUB)[0])
    sql = open(os.path.join(ROOT, 'supabase', 'schema.sql'), encoding='utf-8').read()
    # 업그레이드 경로: 로즈만 팔던 이전 schema.sql(상품 check = hero_gunner 만)을 먼저 실행해 둔 DB 에 새 파일을 다시 실행
    OLD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'schema_v1_rose.sql')
    if os.path.exists(OLD): r0 = psql(open(OLD, encoding='utf-8').read()); ok('schema_old_v1', r0[0], r0[2][-300:])
    r1 = psql(sql); ok('schema_run1', r1[0], r1[2][-300:]); r2 = psql(sql); ok('schema_run2_idempotent', r2[0], r2[2][-300:])
    ok('cart_untouched', psql('select count(*) from public.cart_dummy')[1] == '1')
    ADM = {'sub': '00000000-0000-0000-0000-00000000000a', 'email': 'hyunjk11@daum.net', 'role': 'authenticated'}
    U1 = {'sub': '00000000-0000-0000-0000-000000000001', 'email': 'u1@test.kr', 'role': 'authenticated'}
    U2 = {'sub': '00000000-0000-0000-0000-000000000002', 'email': 'u2@test.kr', 'role': 'authenticated'}
    FAKE = {'sub': '00000000-0000-0000-0000-000000000002', 'email': 'hyunjk11@daum.net', 'role': 'authenticated'} # 이메일 클레임만 위조 (id 불일치)
    A = lambda q, c: psql(q, 'authenticated', c)
    ok('is_admin', A('select public.hd3d_is_admin()', ADM)[1] == 't' and A('select public.hd3d_is_admin()', U1)[1] == 'f' and A('select public.hd3d_is_admin()', FAKE)[1] == 'f')
    ok('anon_cannot_order', not psql("insert into public.hd3d_orders (item) values ('hero_gunner')", 'anon', {})[0])
    r = A("insert into public.hd3d_orders (item) values ('hero_gunner') returning user_id || '|' || email || '|' || status", U1); ok('u1_order', r[0] and r[1] == f"{U1['sub']}|u1@test.kr|pending", r)
    ok('dup_pending_blocked', not A("insert into public.hd3d_orders (item) values ('hero_gunner')", U1)[0])
    ok('status_forced_pending', not A("insert into public.hd3d_orders (item, status) values ('hero_gunner', 'approved')", U2)[0])  # 열 권한 없음
    ok('spoof_user_id_blocked', not A(f"insert into public.hd3d_orders (item, user_id) values ('hero_gunner', '{U2['sub']}')", U1)[0])
    ok('bad_item_blocked', not A("insert into public.hd3d_orders (item) values ('hero_free')", U2)[0])
    r = A("update public.hd3d_orders set status = 'approved' returning id", U1); ok('user_cannot_update_status', (not r[0]) or r[1] == '', r)
    ok('order_still_pending', psql("select status from public.hd3d_orders")[1] == 'pending')
    ok('u2_cannot_see_u1_orders', A('select count(*) from public.hd3d_orders', U2)[1] == '0' and A('select count(*) from public.hd3d_orders', U1)[1] == '1')
    ok('admin_sees_all', A('select count(*) from public.hd3d_orders', ADM)[1] == '1')
    ok('fake_admin_sees_none', A('select count(*) from public.hd3d_orders', FAKE)[1] == '0')
    ok('user_cannot_approve', not A('select public.hd3d_admin_approve(1)', U1)[0] and not A('select public.hd3d_admin_approve(1)', FAKE)[0])
    ok('user_cannot_insert_mail', not A(f"insert into public.hd3d_mail (user_id, title, reward) values ('{U1['sub']}', 'free', '{{\"hero\":\"gunner\"}}')", U1)[0])
    ok('user_cannot_insert_owned', not A(f"insert into public.hd3d_owned (user_id, item) values ('{U1['sub']}', 'hero_gunner')", U1)[0])
    r = A('select public.hd3d_admin_approve(1)', ADM); ok('admin_approve', r[0] and '"ok": true' in r[1], r)
    ok('approve_once', '"ok": false' in A('select public.hd3d_admin_approve(1)', ADM)[1])
    ok('order_approved', psql("select status || '|' || (decided_at is not null) from public.hd3d_orders where id = 1")[1] == 'approved|true')
    ok('mail_created', A("select count(*) from public.hd3d_mail where reward ->> 'hero' = 'gunner'", U1)[1] == '1' and A('select count(*) from public.hd3d_mail', U2)[1] == '0')
    r = A("update public.hd3d_mail set reward = '{\"souls\": 999999}' returning id", U1); ok('user_cannot_edit_reward', (not r[0]) or r[1] == '', r)
    ok('not_owned_yet', A('select count(*) from public.hd3d_owned', U1)[1] == '0')
    mid = A('select id from public.hd3d_mail limit 1', U1)[1]
    ok('u2_cannot_claim_u1_mail', not A(f'select public.hd3d_claim_mail({mid})', U2)[0])
    r = A(f'select public.hd3d_claim_mail({mid})', U1); ok('claim', r[0] and '"already": false' in r[1] and 'gunner' in r[1], r)
    r = A(f'select public.hd3d_claim_mail({mid})', U1); ok('claim_idempotent', r[0] and '"already": true' in r[1], r)
    ok('claim_already_returns_reward', '"reward": {"hero": "gunner"}' in r[1], r)  # 보상 장부 복구용 (S-3)
    ok('owned_after_claim', A('select item from public.hd3d_owned', U1)[1] == 'hero_gunner' and psql('select count(*) from public.hd3d_owned')[1] == '1')
    ok('owned_blocks_new_order', not A("insert into public.hd3d_orders (item) values ('hero_gunner')", U1)[0])
    # 거절
    A("insert into public.hd3d_orders (item) values ('hero_gunner')", U2); oid = psql("select id from public.hd3d_orders where status = 'pending'")[1]
    r = A(f"select public.hd3d_admin_reject({oid}, '입금 확인 불가')", ADM); ok('admin_reject', r[0] and '"ok": true' in r[1], r)
    ok('reject_mail', '입금 확인 불가' in A('select body from public.hd3d_mail', U2)[1] and A('select count(*) from public.hd3d_mail where reward is not null', U2)[1] == '0')
    ok('reorder_after_reject', A("insert into public.hd3d_orders (item) values ('hero_gunner')", U2)[0])
    # 두 번째 유료 영웅 버들(메카닉): 이전 스키마 위에 다시 실행한 DB 에서도 주문 → 승인 → 받기 → 소유 (멱등)
    r = A("insert into public.hd3d_orders (item) values ('hero_mechanic') returning status", U1); ok('mechanic_order', r[0] and r[1] == 'pending', r)
    oid = psql("select id from public.hd3d_orders where item = 'hero_mechanic' and status = 'pending'")[1]
    r = A(f'select public.hd3d_admin_approve({oid})', ADM); ok('mechanic_approve', r[0] and '"ok": true' in r[1], r)
    mm = A("select id || '|' || title || '|' || body from public.hd3d_mail where reward ->> 'hero' = 'mechanic'", U1)[1]; ok('mechanic_mail', '메카닉 버들' in mm, mm)
    mid2 = mm.split('|')[0]; r = A(f'select public.hd3d_claim_mail({mid2})', U1); ok('mechanic_claim', r[0] and '"already": false' in r[1] and 'mechanic' in r[1], r)
    ok('mechanic_claim_idempotent', '"already": true' in A(f'select public.hd3d_claim_mail({mid2})', U1)[1])
    ok('owned_both', A("select string_agg(item, ',' order by item) from public.hd3d_owned", U1)[1] == 'hero_gunner,hero_mechanic')
    ok('mechanic_owned_blocks_order', not A("insert into public.hd3d_orders (item) values ('hero_mechanic')", U1)[0])
    ok('reward_names', psql("select public.hd3d_item_name('hero_mechanic') || '|' || (public.hd3d_item_reward('hero_mechanic') ->> 'hero') || '|' || coalesce(public.hd3d_item_reward('hero_x')::text, 'null')")[1] == '유료 영웅 · 메카닉 버들|mechanic|null')
    VR = "select public.hd3d_valid_reward('{\"hero\":\"mechanic\"}') and public.hd3d_valid_reward('{\"hero\":\"gunner\"}') and not public.hd3d_valid_reward('{\"hero\":\"warrior\"}')"
    ok('valid_reward_heroes', psql(VR)[1] == 't')
    r = A("select public.hd3d_admin_send_mail('u2@test.kr', '선물', '버들', '{\"hero\":\"mechanic\"}')", ADM); ok('admin_send_mechanic', r[0] and '"ok": true' in r[1], r)
    # 관리자 우편 보내기
    r = A("""select public.hd3d_admin_send_mail('U2@test.kr', '선물', '영혼석 드려요', '{"souls": 500, "steel": 20}')""", ADM); ok('admin_send_mail', r[0] and '"ok": true' in r[1], r)
    ok('admin_send_bad_reward', '"bad_reward"' in A("""select public.hd3d_admin_send_mail('u2@test.kr', 'x', '', '{"gold": 5}')""", ADM)[1])
    ok('admin_send_no_user', '"no_user"' in A("""select public.hd3d_admin_send_mail('nobody@test.kr', 'x', '', null)""", ADM)[1])
    ok('user_cannot_send_mail', not A("""select public.hd3d_admin_send_mail('u1@test.kr', 'x', '', '{"hero":"gunner"}')""", U2)[0])
    # 저장 낙관적 동시성 (S-2): updated_at 이 기억한 값일 때만 update → 다른 기기가 먼저 쓰면 0행
    r = A(f"""insert into public.hd3d_progress (user_id, data, merged) values ('{U1['sub']}', '{{"souls": 1}}', true) returning updated_at""", U1); ok('progress_insert', r[0] and r[1], r); t0 = r[1]
    ok('progress_insert_dup_23505', 'duplicate key' in A(f"""insert into public.hd3d_progress (user_id, data) values ('{U1['sub']}', '{{}}')""", U1)[2])
    r = A(f"""update public.hd3d_progress set data = '{{"souls": 2}}' where user_id = '{U1['sub']}' and updated_at = '{t0}' returning updated_at""", U1); ok('progress_cas_ok', r[0] and r[1] and r[1] != t0, r); t1 = r[1]
    r = A(f"""update public.hd3d_progress set data = '{{"souls": 3}}' where user_id = '{U1['sub']}' and updated_at = '{t0}' returning updated_at""", U1); ok('progress_cas_stale_0rows', r[0] and r[1] == '', r)
    r = A(f"""update public.hd3d_progress set data = '{{"souls": 9}}' where user_id = '{U1['sub']}' and updated_at = '{t1}' returning 1""", U2); ok('progress_other_user_0rows', r[0] and r[1] == '', r)
    ok('progress_value', A("select data ->> 'souls' from public.hd3d_progress", U1)[1] == '2')
    ok('anon_no_access', not psql('select count(*) from public.hd3d_mail', 'anon', {})[0] and not psql('select count(*) from public.hd3d_orders', 'anon', {})[0])
    # ================= 관리자 권한 확장 (2026-10-22) =================
    U3 = {'sub': '00000000-0000-0000-0000-000000000003', 'email': 'sub@test.kr', 'role': 'authenticated'}
    psql("insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000003', 'sub@test.kr'), ('00000000-0000-0000-0000-000000000009', 'other-game@test.kr')")
    for c in (U2, U3, ADM): A(f"insert into public.hd3d_profiles (id, nickname) values ('{c['sub']}', '{c['email'][:6]}')", c)
    ok('owner_flag', psql("select owner from public.hd3d_admins where user_id = '00000000-0000-0000-0000-00000000000a'")[1] == 't')
    ok('is_owner', A('select public.hd3d_is_owner()', ADM)[1] == 't' and A('select public.hd3d_is_owner()', U1)[1] == 'f' and A('select public.hd3d_is_owner()', FAKE)[1] == 'f')
    ok('my_status', '"admin": true' in A('select public.hd3d_my_status()', ADM)[1] and '"banned": false' in A('select public.hd3d_my_status()', U1)[1] and '"admin": false' in A('select public.hd3d_my_status()', U1)[1])
    ok('anon_my_status_denied', not psql('select public.hd3d_my_status()', 'anon', {})[0])
    # 일반 사용자: 모든 관리자 RPC 거부
    DENY = ["public.hd3d_admin_users('', 0, 20)", f"public.hd3d_admin_user('{U2['sub']}')", f"public.hd3d_admin_grant_hero('{U1['sub']}', 'hero_gunner', 'x')",
            f"public.hd3d_admin_revoke_hero('{U1['sub']}', 'hero_gunner', 'x')", 'public.hd3d_admin_broadcast_count()', "public.hd3d_admin_broadcast('x', '', null, 3)",
            "public.hd3d_admin_notice_save(null, 'x', '', true, null, null)", 'public.hd3d_admin_notice_active(1, false)', f"public.hd3d_admin_ban('{U2['sub']}', 'x')",
            f"public.hd3d_admin_unban('{U2['sub']}', 'x')", "public.hd3d_admin_orders(null, '', 0, 50)", "public.hd3d_admin_refund(1, 'x')", 'public.hd3d_admin_log_list(null, 0, 50)',
            'public.hd3d_owner_admins()', "public.hd3d_owner_add_admin('u1@test.kr')", "public.hd3d_owner_remove_admin('sub@test.kr')"]
    bad = [f for f in DENY if A('select ' + f, U1)[0] or A('select ' + f, FAKE)[0] or psql('select ' + f, 'anon', {})[0]]; ok('user_all_admin_rpcs_denied', not bad, bad)
    INTERNAL = ["public.hd3d_log('x', null, null)", f"public.hd3d_user_card('{U1['sub']}')", 'public.hd3d_recipients()', "public.hd3d_progress_summary('{}')"]
    bad = [f for f in INTERNAL if A('select ' + f, U1)[0] or A('select ' + f, ADM)[0]]; ok('internal_funcs_not_callable', not bad, bad)
    ok('log_not_writable', not A("insert into public.hd3d_admin_log (action) values ('fake')", ADM)[0] and not A("insert into public.hd3d_admin_log (action) values ('fake')", U1)[0])
    ok('admin_no_direct_mail_insert', not A(f"insert into public.hd3d_mail (user_id, title) values ('{U1['sub']}', 'x')", ADM)[0])
    r = A("update public.hd3d_orders set status = 'refunded' returning id", ADM); ok('admin_no_direct_order_update', (not r[0]) or r[1] == '', r)
    ok('log_has_old_actions', psql("select string_agg(distinct action, ',' order by action) from public.hd3d_admin_log")[1] == 'mail_send,order_approve,order_reject', psql("select string_agg(distinct action, ',' order by action) from public.hd3d_admin_log"))
    ok('log_user_cannot_read', A('select count(*) from public.hd3d_admin_log', U1)[1] == '0' and int(A('select count(*) from public.hd3d_admin_log', ADM)[1]) >= 4)
    # 1) 유저 검색 · 요약 (위조/이상한 저장 jsonb 도 안전)
    A(f"""update public.hd3d_progress set data = '{{"souls": 1234, "mat": {{"crystal": 7, "essence": 2, "steel": "x"}}, "st": {{"1-1": 3, "1-2": 2, "bad": "zz"}}, "hst": {{"1-1": 9}}, "adv": {{"gunner": {{"b": "thorn", "n": 1}}, "mage": 5}}, "hero": "gunner", "stats": {{"runs": 4}}}}' where user_id = '{U1['sub']}'""", U1)
    r = A("select public.hd3d_admin_users('', 0, 20)", ADM); j = json.loads(r[1]) if r[0] else {}
    ok('users_list', r[0] and j.get('total') == 4 and 'other-game@test.kr' not in r[1], (j.get('total'), r[2][-200:]))
    u1 = next((x for x in j.get('rows', []) if x['email'] == 'u1@test.kr'), {}); sm = u1.get('summary') or {}
    ok('users_summary', sm.get('souls') == 1234 and sm.get('crystal') == 7 and sm.get('essence') == 2 and sm.get('steel') == 0 and sm.get('stars') == 5 and sm.get('hstars') == 3 and sm.get('adv') == {'gunner': 'thorn'} and u1.get('owned') == ['hero_gunner', 'hero_mechanic'] and u1.get('saved_at'), u1)
    ok('summary_garbage_safe', psql("""select public.hd3d_progress_summary('{"st": [1,2], "mat": 5, "adv": "x", "souls": "999", "hst": {"a": {"b":1}}}') ->> 'stars'""")[1] == '0' and psql("select public.hd3d_progress_summary('[1]') is null")[1] == 't')
    j = json.loads(A("select public.hd3d_admin_users('U2@', 0, 20)", ADM)[1]); ok('users_search_email', j['total'] == 1 and j['rows'][0]['email'] == 'u2@test.kr', j)
    j = json.loads(A("select public.hd3d_admin_users('sub@te', 0, 20)", ADM)[1]); ok('users_search_nick', j['total'] == 1, j)
    j = json.loads(A("select public.hd3d_admin_users('%', 0, 20)", ADM)[1]); ok('users_search_like_escaped', j['total'] == 0, j)
    j = json.loads(A("select public.hd3d_admin_users('', 1, 2)", ADM)[1]); ok('users_paginated', j['total'] == 4 and len(j['rows']) == 2 and j['offset'] == 1, j)
    j = json.loads(A("select public.hd3d_admin_users('', -5, 9999)", ADM)[1]); ok('users_page_clamped', j['offset'] == 0 and j['limit'] == 50, j)
    j = json.loads(A(f"select public.hd3d_admin_user('{U1['sub']}')", ADM)[1]); ok('user_detail', j['ok'] and len(j['orders']) >= 2 and len(j['mail']) >= 2, list(j))
    ok('user_detail_missing', '"no_user"' in A("select public.hd3d_admin_user('00000000-0000-0000-0000-0000000000ff')", ADM)[1])
    # 2) 영웅 지급/회수
    ok('grant_needs_reason', '"bad_reason"' in A(f"select public.hd3d_admin_grant_hero('{U2['sub']}', 'hero_gunner', '  ')", ADM)[1])
    ok('grant_bad_item', '"bad_item"' in A(f"select public.hd3d_admin_grant_hero('{U2['sub']}', 'hero_free', 'x')", ADM)[1])
    r = A(f"select public.hd3d_admin_grant_hero('{U2['sub']}', 'hero_gunner', '이벤트 당첨')", ADM); ok('grant_hero', '"ok": true' in r[1] and A("select count(*) from public.hd3d_owned where item = 'hero_gunner'", U2)[1] == '1', r)
    ok('grant_again_already', '"already"' in A(f"select public.hd3d_admin_grant_hero('{U2['sub']}', 'hero_gunner', 'x')", ADM)[1])
    # U2 는 앞에서 버들 우편(미수령)이 있음 → 회수하면 그 우편도 받기 불가
    r = A(f"select public.hd3d_admin_revoke_hero('{U2['sub']}', 'hero_gunner', '오지급')", ADM); ok('revoke_hero', '"ok": true' in r[1] and A('select count(*) from public.hd3d_owned', U2)[1] == '0', r)
    ok('revoke_not_owned', '"not_owned"' in A(f"select public.hd3d_admin_revoke_hero('{U2['sub']}', 'hero_gunner', 'x')", ADM)[1])
    A(f"select public.hd3d_admin_grant_hero('{U2['sub']}', 'hero_mechanic', '테스트')", ADM)
    mm2 = A("select id from public.hd3d_mail where reward ->> 'hero' = 'mechanic' and not claimed", U2)[1]
    r = A(f"select public.hd3d_admin_revoke_hero('{U2['sub']}', 'hero_mechanic', '회수')", ADM); ok('revoke_hero_revokes_mail', '"mail_revoked": 1' in r[1], r)
    r = A(f'select public.hd3d_claim_mail({mm2})', U2); ok('revoked_mail_unclaimable', not r[0] and 'revoked' in r[2] and A('select count(*) from public.hd3d_owned', U2)[1] == '0', r)
    # 3) 전체 우편 (확인 수 일치해야, 사용자마다 1행, 받기 한 번)
    n = json.loads(A('select public.hd3d_admin_broadcast_count()', ADM)[1])['count']; ok('broadcast_count', n == 4, n)
    ok('broadcast_bad_reward', '"bad_reward"' in A("""select public.hd3d_admin_broadcast('공지 선물', '', '{"souls": 5000000}', 4)""", ADM)[1])
    r = A("""select public.hd3d_admin_broadcast('점검 보상', '감사합니다', '{"souls": 300}', 3)""", ADM); ok('broadcast_count_mismatch', '"count_mismatch"' in r[1] and '"count": 4' in r[1], r)
    r = A("""select public.hd3d_admin_broadcast('점검 보상', '감사합니다', '{"souls": 300}', 4)""", ADM); ok('broadcast_sent', '"ok": true' in r[1] and psql("select count(*) from public.hd3d_mail where title = '점검 보상'")[1] == '4', r)
    ok('broadcast_cooldown', '"too_soon"' in A("""select public.hd3d_admin_broadcast('또', '', null, 4)""", ADM)[1])
    bm = A("select id from public.hd3d_mail where title = '점검 보상'", U1)[1]
    r1 = A(f'select public.hd3d_claim_mail({bm})', U1); r2 = A(f'select public.hd3d_claim_mail({bm})', U1); ok('broadcast_claim_once', '"already": false' in r1[1] and '"already": true' in r2[1], (r1, r2))
    ok('broadcast_other_cannot_claim', not A(f'select public.hd3d_claim_mail({bm})', U2)[0])
    # 4) 공지
    r = A("select public.hd3d_admin_notice_save(null, '서버 점검 안내', '오늘 밤 점검', true, null, null)", ADM); ok('notice_create', '"ok": true' in r[1], r); nid = json.loads(r[1])['id']
    A("select public.hd3d_admin_notice_save(null, '예약 공지', '', true, now() + interval '1 day', null)", ADM)
    A("select public.hd3d_admin_notice_save(null, '끝난 공지', '', true, now() - interval '2 day', now() - interval '1 day')", ADM)
    ok('notice_bad_range', '"bad_range"' in A("select public.hd3d_admin_notice_save(null, 'x', '', true, now(), now() - interval '1 day')", ADM)[1])
    ok('notice_user_reads_active_only', A('select string_agg(title, \',\') from public.hd3d_notices', U1)[1] == '서버 점검 안내' and A('select count(*) from public.hd3d_notices', ADM)[1] == '3')
    ok('notice_user_cannot_write', not A("insert into public.hd3d_notices (title) values ('x')", U1)[0] and not A("insert into public.hd3d_notices (title) values ('x')", ADM)[0])
    r = A(f'select public.hd3d_admin_notice_active({nid}, false)', ADM); ok('notice_deactivate', '"ok": true' in r[1] and A('select count(*) from public.hd3d_notices', U1)[1] == '0', r)
    r = A(f"select public.hd3d_admin_notice_save({nid}, '서버 점검 안내 (수정)', '내일 밤', true, null, null)", ADM); ok('notice_edit', '"ok": true' in r[1] and A('select title from public.hd3d_notices', U1)[1] == '서버 점검 안내 (수정)', r)
    ok('notice_anon_denied', not psql('select count(*) from public.hd3d_notices', 'anon', {})[0])
    # 5) 정지
    ok('ban_self_denied', '"self"' in A(f"select public.hd3d_admin_ban('{ADM['sub']}', '테스트')", ADM)[1])
    ok('ban_needs_reason', '"bad_reason"' in A(f"select public.hd3d_admin_ban('{U2['sub']}', '')", ADM)[1])
    r = A(f"select public.hd3d_admin_ban('{U2['sub']}', '부정 행위')", ADM); ok('ban', '"ok": true' in r[1], r)
    ok('banned_status', '"banned": true' in A('select public.hd3d_my_status()', U2)[1] and '부정 행위' in A('select reason from public.hd3d_bans', U2)[1] and A('select count(*) from public.hd3d_bans', U1)[1] == '0')
    ok('banned_progress_insert', not A(f"""insert into public.hd3d_progress (user_id, data) values ('{U2['sub']}', '{{}}')""", U2)[0])
    ok('banned_profile_update', not A(f"update public.hd3d_profiles set nickname = 'zz' where id = '{U2['sub']}'", U2)[0])
    r = A("insert into public.hd3d_orders (item) values ('hero_mechanic')", U2); ok('banned_order', not r[0] and 'banned' in r[2], r)
    bm2 = A("select id from public.hd3d_mail where title = '점검 보상'", U2)[1]; r = A(f'select public.hd3d_claim_mail({bm2})', U2); ok('banned_claim', not r[0] and 'banned' in r[2], r)
    ok('banned_cannot_unban_self', not A(f"select public.hd3d_admin_unban('{U2['sub']}', 'x')", U2)[0] and not A(f"delete from public.hd3d_bans where user_id = '{U2['sub']}'", U2)[2] == '' or A('select count(*) from public.hd3d_bans', U2)[1] == '1')
    r = A(f"select public.hd3d_admin_unban('{U2['sub']}', '소명 완료')", ADM); ok('unban', '"ok": true' in r[1] and A(f'select public.hd3d_claim_mail({bm2})', U2)[0], r)
    # 6) 주문 목록 · 환불
    j = json.loads(A("select public.hd3d_admin_orders('approved', '', 0, 50)", ADM)[1]); ok('orders_filter', j['ok'] and all(o['status'] == 'approved' for o in j['rows']) and j['total'] == 2 and j['counts'].get('rejected') == 1, j.get('counts'))
    j = json.loads(A("select public.hd3d_admin_orders(null, 'u2@', 0, 50)", ADM)[1]); ok('orders_by_user', j['total'] >= 1 and all(o['email'] == 'u2@test.kr' for o in j['rows']), j['total'])
    ok('orders_bad_status', '"bad_status"' in A("select public.hd3d_admin_orders('weird', '', 0, 50)", ADM)[1])
    rj = psql("select id from public.hd3d_orders where status = 'rejected' limit 1")[1]; ok('refund_needs_approved', '"not_approved"' in A(f"select public.hd3d_admin_refund({rj}, '테스트')", ADM)[1])
    r = A("select public.hd3d_admin_refund(1, '결제 취소')", ADM); ok('refund', '"ok": true' in r[1] and '"owned_removed": 1' in r[1], r)
    ok('refund_effects', psql("select status || '|' || refund_note from public.hd3d_orders where id = 1")[1] == 'refunded|결제 취소' and A('select string_agg(item, \',\') from public.hd3d_owned', U1)[1] == 'hero_mechanic' and '환불' in A("select string_agg(title, ',') from public.hd3d_mail", U1)[1])
    ok('refund_once', '"not_approved"' in A("select public.hd3d_admin_refund(1, 'x')", ADM)[1])
    ok('reorder_after_refund', A("insert into public.hd3d_orders (item) values ('hero_gunner')", U1)[0])
    # 7) 하위 관리자 (owner 만 관리)
    ok('add_admin_no_user', '"no_user"' in A("select public.hd3d_owner_add_admin('nobody@test.kr')", ADM)[1])
    r = A("select public.hd3d_owner_add_admin(' SUB@test.kr ')", ADM); ok('add_admin', '"ok": true' in r[1] and A('select public.hd3d_is_admin()', U3)[1] == 't' and A('select public.hd3d_is_owner()', U3)[1] == 'f', r)
    ok('sub_admin_powers', '"ok": true' in A("select public.hd3d_admin_users('', 0, 5)", U3)[1] and int(A('select count(*) from public.hd3d_orders', U3)[1]) >= 3)
    ok('sub_admin_cannot_manage_admins', not A("select public.hd3d_owner_add_admin('u1@test.kr')", U3)[0] and not A("select public.hd3d_owner_remove_admin('hyunjk11@daum.net')", U3)[0] and not A('select public.hd3d_owner_admins()', U3)[0])
    ok('sub_admin_cannot_ban_admins', '"target_admin"' in A(f"select public.hd3d_admin_ban('{ADM['sub']}', 'x')", U3)[1] and '"self"' in A(f"select public.hd3d_admin_ban('{U3['sub']}', 'x')", U3)[1])
    ok('owner_cannot_remove_owner', '"owner"' in A("select public.hd3d_owner_remove_admin('hyunjk11@daum.net')", ADM)[1])
    j = json.loads(A('select public.hd3d_owner_admins()', ADM)[1]); ok('admins_list', [x['email'] for x in j['rows']] == ['hyunjk11@daum.net', 'sub@test.kr'], j)
    r = A("select public.hd3d_owner_remove_admin('sub@test.kr')", ADM); ok('remove_admin', '"ok": true' in r[1] and A('select public.hd3d_is_admin()', U3)[1] == 'f', r)
    ok('removed_admin_denied', not A("select public.hd3d_admin_users('', 0, 5)", U3)[0])
    A(f"select public.hd3d_admin_ban('{U2['sub']}', '테스트')", ADM); ok('add_banned_admin_denied', '"target_banned"' in A("select public.hd3d_owner_add_admin('u2@test.kr')", ADM)[1]); A(f"select public.hd3d_admin_unban('{U2['sub']}', 'x')", ADM)
    # 8) 기록
    j = json.loads(A('select public.hd3d_admin_log_list(null, 0, 100)', ADM)[1]); acts = {x['action'] for x in j['rows']}
    need = {'hero_grant', 'hero_revoke', 'broadcast', 'notice_create', 'notice_update', 'notice_deactivate', 'ban', 'unban', 'order_refund', 'admin_add', 'admin_remove', 'mail_send', 'order_approve', 'order_reject'}
    ok('log_all_actions', need <= acts, need - acts)
    ok('log_fields', all(x['admin_email'] for x in j['rows']) and any(x['action'] == 'ban' and x['target_email'] == 'u2@test.kr' and x['detail']['reason'] == '부정 행위' for x in j['rows']))
    j = json.loads(A("select public.hd3d_admin_log_list('ban', 0, 1)", ADM)[1]); ok('log_filter_page', j['total'] == 2 and len(j['rows']) == 1, j['total'])
    # 아이템 · 조각(고유 정수) 지급 보상 검증
    VG = lambda j: psql("select public.hd3d_valid_reward('" + j + "')")[1]
    good = ['{"essence": 10}', '{"items": [{"k":"gear","s":"weapon","h":"gunner","g":4,"c":4}]}', '{"items": [{"k":"gear","s":"armor","g":0}, {"k":"uq","u":"f_bow"}], "souls": 5, "essence": 10000}']
    badr = ['{"essence": 10001}', '{"essence": "x"}', '{"items": []}', '{"items": {"k":"uq","u":"f_bow"}}', '{"items": [{"k":"uq","u":"nope"}]}', '{"items": [{"k":"gear","s":"weapon","g":4}]}',
            '{"items": [{"k":"gear","s":"armor","h":"mage","g":1}]}', '{"items": [{"k":"gear","s":"armor","g":5}]}', '{"items": [{"k":"gear","s":"armor","g":"1"}]}', '{"items": [{"k":"gear","s":"armor","g":1,"c":9}]}',
            '{"items": [{"k":"gear","s":"armor","g":1,"x":1}]}', '{"items": [{"k":"gem"}]}', '{"items": [1]}', '{"items": [' + ','.join(['{"k":"uq","u":"f_bow"}'] * 11) + ']}']
    ok('reward_items_valid', all(VG(j) == 't' for j in good), [j for j in good if VG(j) != 't'])
    ok('reward_items_invalid', all(VG(j) == 'f' for j in badr), [(j, VG(j)) for j in badr if VG(j) != 'f'])
    r = A("""select public.hd3d_admin_send_mail('u1@test.kr', '장비 선물', '', '{"essence": 7, "items": [{"k":"gear","s":"weapon","h":"mage","g":3,"c":2}, {"k":"uq","u":"c_ring"}]}')""", ADM); ok('send_items_mail', '"ok": true' in r[1], r)
    ok('send_items_logged', 'c_ring' in psql("select detail::text from public.hd3d_admin_log where action = 'mail_send' order by id desc limit 1")[1])
    ok('send_items_bad', '"bad_reward"' in A("""select public.hd3d_admin_send_mail('u1@test.kr', 'x', '', '{"items": [{"k":"uq","u":"zzz"}]}')""", ADM)[1])
    ok('send_items_user_denied', not A("""select public.hd3d_admin_send_mail('u1@test.kr', 'x', '', '{"essence": 5}')""", U1)[0])
    ok('user_cannot_insert_items_mail', not A(f"""insert into public.hd3d_mail (user_id, title, reward) values ('{U1['sub']}', 'x', '{{"essence": 5}}')""", U1)[0])
    # 9) 격투가 서윤 (2026-10-22): 주문 → 승인 → 우편 → 받기 → 소유 · 이름/보상 · 지급/회수 · 무기 보상
    r = A("insert into public.hd3d_orders (item) values ('hero_fighter') returning status", U2); ok('fighter_order', r[0] and r[1] == 'pending', r)
    oid = psql("select id from public.hd3d_orders where item = 'hero_fighter' and status = 'pending'")[1]
    r = A(f'select public.hd3d_admin_approve({oid})', ADM); ok('fighter_approve', r[0] and '"ok": true' in r[1], r)
    mm = A("select id || '|' || title || '|' || body from public.hd3d_mail where reward ->> 'hero' = 'fighter' and not claimed", U2)[1]; ok('fighter_mail', '격투가 서윤' in mm, mm)
    r = A(f"select public.hd3d_claim_mail({mm.split('|')[0]})", U2); ok('fighter_claim', r[0] and 'fighter' in r[1], r)
    ok('fighter_owned', 'hero_fighter' in A("select string_agg(item, ',') from public.hd3d_owned", U2)[1])
    ok('fighter_owned_blocks_order', not A("insert into public.hd3d_orders (item) values ('hero_fighter')", U2)[0])
    ok('fighter_user_cannot_insert_owned', not A(f"insert into public.hd3d_owned (user_id, item) values ('{U1['sub']}', 'hero_fighter')", U1)[0])
    ok('fighter_names', psql("select public.hd3d_item_name('hero_fighter') || '|' || (public.hd3d_item_reward('hero_fighter') ->> 'hero')")[1] == '유료 영웅 · 격투가 서윤|fighter')
    ok('fighter_valid_reward', VG('{"hero":"fighter"}') == 't' and VG('{"items": [{"k":"gear","s":"weapon","h":"fighter","g":4,"c":4}]}') == 't' and VG('{"hero":"seoyun"}') == 'f')
    r = A(f"select public.hd3d_admin_grant_hero('{U1['sub']}', 'hero_fighter', '이벤트')", ADM); ok('fighter_grant', '"ok": true' in r[1], r)
    r = A(f"select public.hd3d_admin_revoke_hero('{U1['sub']}', 'hero_fighter', '테스트 회수')", ADM); ok('fighter_revoke', '"ok": true' in r[1] and 'hero_fighter' not in A("select coalesce(string_agg(item, ','), '') from public.hd3d_owned", U1)[1], r)
    ok('bad_hero_item', not A("insert into public.hd3d_orders (item) values ('hero_seoyun')", U1)[0])
    # 10) 던전 5단계 (2026-10-23): 던전 메달 · 하루 3회 · 1회용 token · 경과 시간 상한 · 상점 · 관리자 메달 우편
    JS = lambda q, c: json.loads(A(q, c)[1] or 'null')
    st = JS('select public.hd3d_dungeon_status()', U1); ok('dg_status_initial', st and st['left'] == 3 and st['used'] == 0 and st['medals'] == 0 and st['limit'] == 3, st)
    ok('dg_anon_denied', not psql('select public.hd3d_dungeon_start()', 'anon', {})[0] and not psql('select public.hd3d_dungeon_status()', 'anon', {})[0])
    ok('dg_noauth_denied', not A('select public.hd3d_dungeon_start()', {'role': 'authenticated'})[0])
    s1 = JS('select public.hd3d_dungeon_start()', U1); ok('dg_start1', s1['ok'] and s1['left'] == 2 and len(s1['token']) == 36, s1)
    f = JS(f"select public.hd3d_dungeon_finish('{s1['token']}', 5, true)", U1); ok('dg_too_fast_capped', f['ok'] and f['floors'] == 0 and f['medals'] == 0 and f['capped'] and not f['win'], f)
    ok('dg_token_once', JS(f"select public.hd3d_dungeon_finish('{s1['token']}', 5, true)", U1)['reason'] == 'used')
    s2 = JS('select public.hd3d_dungeon_start()', U1); psql(f"update public.hd3d_dungeon_runs set started_at = now() - interval '30 minutes' where token = '{s2['token']}'")
    ok('dg_other_user_token', JS(f"select public.hd3d_dungeon_finish('{s2['token']}', 5, true)", U2)['reason'] == 'bad_token')
    ok('dg_bad_token', JS("select public.hd3d_dungeon_finish('00000000-0000-0000-0000-0000000000ff', 5, true)", U1)['reason'] == 'bad_token')
    f = JS(f"select public.hd3d_dungeon_finish('{s2['token']}', 5, true)", U1); ok('dg_full_clear', f['ok'] and f['medals'] == 15 and f['total'] == 15 and f['win'] and not f['capped'], f)
    ok('dg_full_clear_once', JS(f"select public.hd3d_dungeon_finish('{s2['token']}', 5, true)", U1)['reason'] == 'used' and JS('select public.hd3d_dungeon_status()', U1)['medals'] == 15)
    s3 = JS('select public.hd3d_dungeon_start()', U1); psql(f"update public.hd3d_dungeon_runs set started_at = now() - interval '70 seconds' where token = '{s3['token']}'")
    ok('dg_daily_limit', s3['ok'] and s3['left'] == 0 and JS('select public.hd3d_dungeon_start()', U1)['reason'] == 'daily_limit')
    ok('dg_limit_keeps_active', psql(f"select status from public.hd3d_dungeon_runs where token = '{s3['token']}'")[1] == 'active')
    f = JS(f"select public.hd3d_dungeon_finish('{s3['token']}', 5, true)", U1); ok('dg_time_cap_partial', f['ok'] and f['floors'] == 3 and f['medals'] == 6 and not f['win'] and f['capped'] and f['total'] == 21, f)
    psql(f"update public.hd3d_dungeon_runs set day = day - 1 where user_id = '{U1['sub']}'")  # 한국 시간 다음 날 = 초기화
    st = JS('select public.hd3d_dungeon_status()', U1); ok('dg_day_reset', st['left'] == 3 and st['used'] == 0 and st['medals'] == 21, st)
    ok('dg_kst_day', psql("select public.hd3d_kst_day() = (now() at time zone 'Asia/Seoul')::date")[1] == 't')
    s4 = JS('select public.hd3d_dungeon_start()', U1); s5 = JS('select public.hd3d_dungeon_start()', U1)
    ok('dg_restart_abandons', psql(f"select status from public.hd3d_dungeon_runs where token = '{s4['token']}'")[1] == 'abandoned' and JS(f"select public.hd3d_dungeon_finish('{s4['token']}', 1, false)", U1)['reason'] == 'used')
    psql(f"update public.hd3d_dungeon_runs set started_at = now() - interval '1 hour' where token = '{s5['token']}'")
    f = JS(f"select public.hd3d_dungeon_finish('{s5['token']}', 999, false)", U1); ok('dg_floors_clamped', f['floors'] == 5 and f['medals'] == 10 and not f['win'], f)  # 완주 표시 없이 5층 = 보너스 없음
    s6 = JS('select public.hd3d_dungeon_start()', U1); psql(f"update public.hd3d_dungeon_runs set started_at = now() - interval '4 hours' where token = '{s6['token']}'")
    ok('dg_expired', JS(f"select public.hd3d_dungeon_finish('{s6['token']}', 5, true)", U1)['reason'] == 'expired')
    f = JS(f"select public.hd3d_dungeon_finish('{s5['token']}', -3, false)", U1); ok('dg_negative_floors_used', f['reason'] == 'used')
    ok('dg_wallet_31', JS('select public.hd3d_dungeon_status()', U1)['medals'] == 31)
    # 클라이언트 직접 쓰기 불가
    ok('dg_cannot_update_wallet', (lambda r: (not r[0]) or r[1] == '')(A('update public.hd3d_dungeon_wallet set medals = 99999 returning medals', U1)) and JS('select public.hd3d_dungeon_status()', U1)['medals'] == 31)
    ok('dg_cannot_insert_wallet', not A(f"insert into public.hd3d_dungeon_wallet (user_id, medals) values ('{U2['sub']}', 999)", U2)[0])
    ok('dg_cannot_insert_run', not A(f"insert into public.hd3d_dungeon_runs (user_id, day) values ('{U1['sub']}', current_date)", U1)[0])
    ok('dg_cannot_update_run', (lambda r: (not r[0]) or r[1] == '')(A("update public.hd3d_dungeon_runs set status = 'active' returning id", U1)))
    ok('dg_wallet_rls', A('select count(*) from public.hd3d_dungeon_wallet', U2)[1] == '0' and A('select count(*) from public.hd3d_dungeon_wallet', U1)[1] == '1' and A('select count(*) from public.hd3d_dungeon_runs', U2)[1] == '0')
    ok('dg_internal_fn_denied', not A("select public.hd3d_dungeon_item('dg_steel')", U1)[0])
    # 상점
    ok('dg_buy_bad_item', JS("select public.hd3d_dungeon_buy('dg_free')", U1)['reason'] == 'bad_item')
    ok('dg_buy_not_enough_new', JS("select public.hd3d_dungeon_buy('dg_steel')", U2)['reason'] == 'not_enough')
    nm0 = int(A('select count(*) from public.hd3d_mail', U1)[1])
    b = JS("select public.hd3d_dungeon_buy('dg_essence')", U1); ok('dg_buy_essence', b['ok'] and b['price'] == 15 and b['medals'] == 16 and b['mail'], b)
    mm = A(f"select reward::text || '|' || title from public.hd3d_mail where id = {b['mail']}", U1)[1]; ok('dg_buy_mail', '"essence": 3' in mm and '던전 상점' in mm and int(A('select count(*) from public.hd3d_mail', U1)[1]) == nm0 + 1, mm)
    r = A(f"select public.hd3d_claim_mail({b['mail']})", U1); ok('dg_buy_claim', r[0] and '"essence": 3' in r[1], r)
    ok('dg_buy_title_not_enough', JS("select public.hd3d_dungeon_buy('dg_title')", U1)['reason'] == 'not_enough' and JS('select public.hd3d_dungeon_status()', U1)['medals'] == 16)
    ok('dg_buy_logged', psql("select count(*) || '|' || sum(price) from public.hd3d_dungeon_buys")[1] == '1|15')
    # 관리자 메달 우편 → 받기 때 서버 지갑에 (한 번만)
    VG = lambda j: psql("select public.hd3d_valid_reward('" + j + "')")[1]
    ok('dg_medal_reward_valid', VG('{"medals": 50}') == 't' and VG('{"medals": 10000, "souls": 5}') == 't' and VG('{"medals": 10001}') == 'f' and VG('{"medals": "5"}') == 'f' and VG('{"medals": -1}') == 'f' and VG('{"medals": 1.5}') == 'f')
    r = A("""select public.hd3d_admin_send_mail('u1@test.kr', '메달 선물', '', '{"medals": 50}')""", ADM); ok('dg_admin_medal_mail', '"ok": true' in r[1], r)
    ok('dg_user_cannot_send_medals', not A("""select public.hd3d_admin_send_mail('u1@test.kr', 'x', '', '{"medals": 50}')""", U1)[0])
    mid = A("select id from public.hd3d_mail where reward ->> 'medals' = '50'", U1)[1]
    ok('dg_medal_claim', A(f'select public.hd3d_claim_mail({mid})', U1)[0] and JS('select public.hd3d_dungeon_status()', U1)['medals'] == 66)
    ok('dg_medal_claim_once', '"already": true' in A(f'select public.hd3d_claim_mail({mid})', U1)[1] and JS('select public.hd3d_dungeon_status()', U1)['medals'] == 66)
    b = JS("select public.hd3d_dungeon_buy('dg_title')", U1); ok('dg_buy_title', b['ok'] and b['medals'] == 6 and b['mail'] is None and 'lich_hunter' in b['titles'], b)
    ok('dg_buy_title_once', JS("select public.hd3d_dungeon_buy('dg_title')", U1)['reason'] == 'already' and JS('select public.hd3d_dungeon_status()', U1)['titles'] == ['lich_hunter'])
    b = JS("select public.hd3d_dungeon_buy('dg_steel')", U1); ok('dg_buy_steel', b['ok'] and b['medals'] == 1, b)
    ok('dg_buy_until_empty', JS("select public.hd3d_dungeon_buy('dg_steel')", U1)['reason'] == 'not_enough' and JS('select public.hd3d_dungeon_status()', U1)['medals'] == 1)
    j = JS(f"select public.hd3d_admin_user('{U1['sub']}')", ADM); ok('dg_admin_user', j['dungeon']['medals'] == 1 and j['dungeon']['earned'] == 81 and j['dungeon']['spent'] == 80 and j['dungeon']['runs'] == 6 and j['dungeon']['today'] == 3, j.get('dungeon'))
    # 정지 계정: 입장·완료·구매 거부
    A(f"select public.hd3d_admin_ban('{U2['sub']}', '테스트')", ADM)
    ok('dg_banned_denied', not A('select public.hd3d_dungeon_start()', U2)[0] and not A("select public.hd3d_dungeon_buy('dg_steel')", U2)[0] and JS('select public.hd3d_dungeon_status()', U2)['banned'])
    A(f"select public.hd3d_admin_unban('{U2['sub']}', 'x')", ADM)
    # 11) 던전 고유 진서윤 '묘신 너클 호랑냥이' d_fist (2026-10-23): 모르비아 드롭(서버 random · 5% · 천장 40) · 상점 450 · 계정당 1개
    U3 = {'sub': '00000000-0000-0000-0000-000000000003', 'email': 'u3@test.kr', 'role': 'authenticated'}
    U4 = {'sub': '00000000-0000-0000-0000-000000000004', 'email': 'u4@test.kr', 'role': 'authenticated'}
    U5 = {'sub': '00000000-0000-0000-0000-000000000005', 'email': 'u5@test.kr', 'role': 'authenticated'}
    psql(f"insert into auth.users (id, email) values ('{U3['sub']}', 'u3@test.kr'), ('{U4['sub']}', 'u4@test.kr'), ('{U5['sub']}', 'u5@test.kr') on conflict (id) do nothing")
    RL = lambda p_, r_: psql(f'select public.hd3d_dungeon_uq_roll({p_}, {r_})')[1]
    ok('uq_roll_rate', RL(0, 0.049) == 't' and RL(0, 0.05) == 'f' and RL(0, 0.99) == 'f' and RL(10, 0.0) == 't', [RL(0, 0.049), RL(0, 0.05)])
    ok('uq_roll_pity', RL(38, 0.99) == 'f' and RL(39, 0.99) == 't' and RL(500, 0.99) == 't')
    ok('uq_roll_denied_to_users', not A('select public.hd3d_dungeon_uq_roll(39, 0.0)', U3)[0])
    ok('uq_shop_item', json.loads(psql("select public.hd3d_dungeon_item('dg_uq_fist')")[1]) == {'price': 450, 'name': '묘신 너클 호랑냥이', 'uq': 'd_fist'})
    ok('uq_valid_item', VG('{"items": [{"k":"uq","u":"d_fist"}]}') == 't' and VG('{"items": [{"k":"uq","u":"d_fake"}]}') == 'f')
    # 결정적 난수: setseed 후 random() 첫 값이 > 0.5 (빗나감) / < 0.05 (적중) 인 시드 찾기 (정산 함수 안의 random() 은 1번)
    def first_r(sd): return float(psql(f'select setseed({sd}); select random()')[1])
    seeds = [i / 1000 for i in range(-999, 1000, 7)]
    MISS = next(x for x in seeds if first_r(x) > 0.5); HIT = next(x for x in seeds if first_r(x) < 0.05)
    ok('uq_seeds_found', first_r(MISS) > 0.5 and first_r(HIT) < 0.05, (MISS, HIT))
    def run(U, floors, win, seed):
        s_ = JS('select public.hd3d_dungeon_start()', U)
        if not s_ or not s_.get('token'): print('START FAIL', A('select public.hd3d_dungeon_start()', U))
        psql(f"update public.hd3d_dungeon_runs set started_at = now() - interval '30 minutes' where token = '{s_['token']}'")
        f_ = json.loads(A(f"select setseed({seed}); select public.hd3d_dungeon_finish('{s_['token']}', {floors}, {str(win).lower()})", U)[1] or 'null')
        psql(f"update public.hd3d_dungeon_runs set day = day - 1 where user_id = '{U['sub']}'")  # 하루 3회 제한 우회 (다음 날)
        return f_
    st = JS('select public.hd3d_dungeon_status()', U3); ok('uq_status_initial', st['uniques'] == [] and st['uq_pity'] == 0, st)
    f = run(U3, 4, False, HIT); ok('uq_no_roll_on_loss', f['ok'] and f['uq'] is None and f['uq_pity'] == 0 and not f['win'], f)
    f = run(U3, 5, False, HIT); ok('uq_no_roll_without_boss_kill', f['ok'] and f['uq'] is None and f['uq_pity'] == 0, f)
    f = run(U3, 5, True, MISS); ok('uq_miss_adds_pity', f['ok'] and f['win'] and f['uq'] is None and f['mail'] is None and f['uq_pity'] == 1, f)
    s_ = JS('select public.hd3d_dungeon_start()', U3); f = json.loads(A(f"select setseed({HIT}); select public.hd3d_dungeon_finish('{s_['token']}', 5, true)", U3)[1])
    ok('uq_too_fast_no_roll', f['ok'] and not f['win'] and f['uq'] is None and f['uq_pity'] == 1, f); psql(f"update public.hd3d_dungeon_runs set day = day - 1 where user_id = '{U3['sub']}'")
    ok('uq_cannot_edit_pity', (lambda r: (not r[0]) or r[1] == '')(A('update public.hd3d_dungeon_wallet set uq_pity = 39, uniques = \'{d_fist}\' returning uq_pity', U3)) and JS('select public.hd3d_dungeon_status()', U3)['uq_pity'] == 1)
    psql(f"update public.hd3d_dungeon_wallet set uq_pity = 38 where user_id = '{U3['sub']}'")
    f = run(U3, 5, True, MISS); ok('uq_pity_39_no_drop', f['uq'] is None and f['uq_pity'] == 39, f)
    f = run(U3, 5, True, MISS); ok('uq_pity_guaranteed', f['uq'] == 'd_fist' and f['mail'] and f['uq_pity'] == 0 and f['uniques'] == ['d_fist'] and f['medals'] == 15, f)
    dmid = f['mail']; mrow = json.loads(psql(f"select jsonb_build_object('reward', reward, 'user', user_id) from public.hd3d_mail where id = {dmid}")[1])
    ok('uq_drop_mail', mrow['reward'] == {'items': [{'k': 'uq', 'u': 'd_fist'}]} and mrow['user'] == U3['sub'], mrow)
    ok('uq_drop_run_logged', psql(f"select count(*) from public.hd3d_dungeon_runs where user_id = '{U3['sub']}' and uq = 'd_fist'")[1] == '1')
    f = run(U3, 5, True, HIT); ok('uq_no_second_drop', f['ok'] and f['win'] and f['uq'] is None and f['mail'] is None and f['uniques'] == ['d_fist'], f)
    r = A(f'select public.hd3d_claim_mail({dmid})', U3); ok('uq_drop_claim', r[0] and '"d_fist"' in r[1] and JS('select public.hd3d_dungeon_status()', U3)['uniques'] == ['d_fist'], r)
    psql(f"update public.hd3d_dungeon_wallet set medals = 1000 where user_id = '{U3['sub']}'")
    b = JS("select public.hd3d_dungeon_buy('dg_uq_fist')", U3); ok('uq_buy_after_drop_owned', b['ok'] is False and b['reason'] == 'owned' and b['medals'] == 1000, b)
    # 상점 구매: 메달 부족 → 정확히 450 → 구매 · 우편 · 다시 구매 거부 · 이후 모르비아 드롭 없음
    ok('uq_buy_no_wallet', JS("select public.hd3d_dungeon_buy('dg_uq_fist')", U4)['reason'] == 'not_enough')
    f = run(U4, 5, True, MISS); psql(f"update public.hd3d_dungeon_wallet set medals = 449 where user_id = '{U4['sub']}'")
    b = JS("select public.hd3d_dungeon_buy('dg_uq_fist')", U4); ok('uq_buy_not_enough', b['reason'] == 'not_enough' and b['price'] == 450 and JS('select public.hd3d_dungeon_status()', U4)['uniques'] == [], b)
    psql(f"update public.hd3d_dungeon_wallet set medals = 450 where user_id = '{U4['sub']}'")
    b = JS("select public.hd3d_dungeon_buy('dg_uq_fist')", U4); ok('uq_buy_ok', b['ok'] and b['medals'] == 0 and b['mail'] and b['uniques'] == ['d_fist'] and b['price'] == 450, b)
    ok('uq_buy_mail', json.loads(psql(f"select reward from public.hd3d_mail where id = {b['mail']}")[1]) == {'items': [{'k': 'uq', 'u': 'd_fist'}]})
    psql(f"update public.hd3d_dungeon_wallet set medals = 900 where user_id = '{U4['sub']}'")
    b2 = JS("select public.hd3d_dungeon_buy('dg_uq_fist')", U4); ok('uq_buy_once', b2['reason'] == 'owned' and JS('select public.hd3d_dungeon_status()', U4)['medals'] == 900, b2)
    f = run(U4, 5, True, HIT); ok('uq_no_drop_after_buy', f['uq'] is None and f['mail'] is None, f)
    ok('uq_buy_logged', psql(f"select count(*) || '|' || sum(price) from public.hd3d_dungeon_buys where user_id = '{U4['sub']}'")[1] == '1|450')
    # 관리자 우편으로 받은 d_fist 도 서버가 기록 → 상점 '보유 중' · 드롭 없음
    r = A("""select public.hd3d_admin_send_mail('u5@test.kr', '고유 선물', '', '{"items": [{"k":"uq","u":"d_fist"}]}')""", ADM); ok('uq_admin_mail', '"ok": true' in r[1], r)
    m5 = A("select id from public.hd3d_mail where reward -> 'items' -> 0 ->> 'u' = 'd_fist'", U5)[1]
    ok('uq_admin_claim_records', A(f'select public.hd3d_claim_mail({m5})', U5)[0] and JS('select public.hd3d_dungeon_status()', U5)['uniques'] == ['d_fist'])
    psql(f"update public.hd3d_dungeon_wallet set medals = 999 where user_id = '{U5['sub']}'")
    ok('uq_admin_then_buy_owned', JS("select public.hd3d_dungeon_buy('dg_uq_fist')", U5)['reason'] == 'owned')
    ok('uq_anon_finish_denied', not psql("select public.hd3d_dungeon_finish('00000000-0000-0000-0000-0000000000ff', 5, true)", 'anon', {})[0])
    j = JS(f"select public.hd3d_admin_user('{U3['sub']}')", ADM); ok('uq_admin_user_view', j['dungeon']['uniques'] == ['d_fist'] and j['dungeon']['uq_pity'] == 0, j.get('dungeon'))
    # 12) 🗼 무한의 탑 T-6 (2026-10-24): 시작층 위조 · 시간 하한 · ping 단조 · token 1회 · 하루 상한 · 첫 돌파 보상 1회 · 정지 · 랭킹 정렬
    SPJ = json.loads(subprocess.run(['node', '-e', "import('./src/data/spire.js').then(S => console.log(JSON.stringify({ srv: S.SP_SERVER, week: S.weekKey(), first: Array.from({length: 160}, (_, i) => S.firstClear(i + 1)), ms: [[1, 5], [1, 10], [6, 30], [11, 12], [3, 2], [21, 50]].map(([a, b]) => S.minSecBetween(a, b)) })))"], cwd=ROOT, capture_output=True, text=True).stdout or 'null')
    C = json.loads(psql('select public.hd3d_spire_const()')[1])
    ok('sp_const_eq_client', SPJ and C == {'dailyCap': SPJ['srv']['dailyCap'], 'maxPerRun': SPJ['srv']['maxPerRun'], 'minNormal': SPJ['srv']['minSec']['normal'], 'minBoss': SPJ['srv']['minSec']['boss'], 'pingMinSec': SPJ['srv']['pingMinSec'], 'expireH': SPJ['srv']['expireH']}, C)
    fs = json.loads('[' + psql("select string_agg(coalesce(public.hd3d_spire_first(n)::text, 'null'), ',' order by n) from generate_series(1, 160) n")[1] + ']')
    ok('sp_first_eq_client', fs == SPJ['first'], [i + 1 for i in range(160) if fs[i] != SPJ['first'][i]][:5])
    ms = [int(psql(f'select public.hd3d_spire_minsec({a}, {b})')[1]) for a, b in [[1, 5], [1, 10], [6, 30], [11, 12], [3, 2], [21, 50]]]
    ok('sp_minsec_eq_client', ms == SPJ['ms'], (ms, SPJ['ms']))
    ok('sp_week_eq_client', psql('select public.hd3d_kst_week()')[1] == SPJ['week'], SPJ['week'])
    ok('sp_anon_denied', not psql('select public.hd3d_spire_start(1)', 'anon', {})[0] and not psql('select public.hd3d_spire_status()', 'anon', {})[0] and not psql("select public.hd3d_spire_rank('week', null)", 'anon', {})[0])
    ok('sp_noauth_denied', not A('select public.hd3d_spire_start(1)', {'role': 'authenticated'})[0])
    ok('sp_internal_denied', not A(f"select public.hd3d_spire_record('{U1['sub']}', 1, 50)", U1)[0] and not A('select public.hd3d_spire_first(5)', U1)[0])
    st = JS('select public.hd3d_spire_status()', U1); ok('sp_status_initial', st['best'] == 0 and st['checkpoints'] == [1] and st['left'] == 30 and st['limit'] == 30 and st['week_rank'] is None and not st['active'], st)
    ok('sp_bad_from', all(JS(f'select public.hd3d_spire_start({x})', U1)['reason'] == 'bad_from' for x in (0, 2, 6, 11, -4)) and JS('select public.hd3d_spire_start(null)', U1)['reason'] == 'bad_from')
    T_ = lambda tok, q: psql(f"update public.hd3d_spire_runs set {q} where token = '{tok}'")
    s1 = JS('select public.hd3d_spire_start(1)', U1); ok('sp_start1', s1['ok'] and len(s1['token']) == 36 and s1['from'] == 1 and s1['left'] == 29, s1)
    p = JS(f"select public.hd3d_spire_ping('{s1['token']}', 5)", U1); ok('sp_ping_too_fast', p['ok'] is False and p['reason'] == 'too_fast', p)
    f = JS(f"select public.hd3d_spire_finish('{s1['token']}', 10, null)", U1); ok('sp_finish_too_fast_capped', f['ok'] and f['top'] == 0 and f['capped'] and f['best'] == 0 and f['reward']['floors'] == [] and f['week_best'] == 0, f)
    ok('sp_token_once', JS(f"select public.hd3d_spire_finish('{s1['token']}', 10, null)", U1)['reason'] == 'used' and JS(f"select public.hd3d_spire_ping('{s1['token']}', 5)", U1)['reason'] == 'used')
    ok('sp_bad_token', JS("select public.hd3d_spire_ping('00000000-0000-0000-0000-0000000000ff', 5)", U1)['reason'] == 'bad_token' and JS(f"select public.hd3d_spire_finish('{s1['token']}', 10, null)", U2)['reason'] == 'bad_token')
    s2 = JS('select public.hd3d_spire_start(1)', U1); T_(s2['token'], "started_at = now() - interval '200 seconds'")
    p = JS(f"select public.hd3d_spire_ping('{s2['token']}', 4)", U1); ok('sp_ping_not_boss', p['reason'] == 'bad_floor', p)
    p = JS(f"select public.hd3d_spire_ping('{s2['token']}', 10)", U1); ok('sp_ping_skip_too_fast', p['reason'] == 'too_fast', p)  # 10층까지 280초 필요
    p = JS(f"select public.hd3d_spire_ping('{s2['token']}', 5)", U1); ok('sp_ping5', p['ok'] and p['best'] == 5 and p['new_best'] and p['reward']['floors'] == [5] and p['reward']['souls'] == 400 and p['reward']['medals'] == 0 and p['reward']['mail'], p)
    ok('sp_ping5_mail', json.loads(psql(f"select reward from public.hd3d_mail where id = {p['reward']['mail']}")[1]) == {'souls': 400})
    ok('sp_ping_monotonic', JS(f"select public.hd3d_spire_ping('{s2['token']}', 5)", U1)['reason'] == 'bad_floor')
    p = JS(f"select public.hd3d_spire_ping('{s2['token']}', 10)", U1); ok('sp_ping_interval', p['reason'] == 'too_fast', p)  # 직전 ping 뒤 125초 안 지남
    T_(s2['token'], "started_at = now() - interval '340 seconds', last_ping_at = now() - interval '130 seconds'")
    p = JS(f"select public.hd3d_spire_ping('{s2['token']}', 10)", U1); ok('sp_ping10', p['ok'] and p['best'] == 10 and p['reward']['floors'] == [10] and p['reward']['souls'] == 500 and p['reward']['medals'] == 6, p)
    mid10 = p['reward']['mail']
    f = JS(f"""select public.hd3d_spire_finish('{s2['token']}', 14, '{{"party": ["warrior", "archer", "mage"]}}')""", U1); ok('sp_finish_capped_by_time', f['ok'] and f['top'] == 12 and f['capped'] and f['best'] == 12 and f['week_best'] == 12 and f['reward']['floors'] == [], f)
    ok('sp_summary_saved', psql(f"select summary ->> 'party' from public.hd3d_spire_runs where token = '{s2['token']}'")[1] == '["warrior", "archer", "mage"]')
    md0 = JS('select public.hd3d_dungeon_status()', U1)['medals']
    ok('sp_mail_medals_to_wallet', A(f'select public.hd3d_claim_mail({mid10})', U1)[0] and JS('select public.hd3d_dungeon_status()', U1)['medals'] == md0 + 6)
    st = JS('select public.hd3d_spire_status()', U1); ok('sp_status_after', st['best'] == 12 and st['cleared'] == 10 and st['checkpoints'] == [1, 6, 11] and st['week_best'] == 12 and st['week_rank'] == 1 and st['used'] == 2, st)
    ok('sp_from_checkpoint', JS('select public.hd3d_spire_start(16)', U1)['reason'] == 'bad_from')
    s3 = JS('select public.hd3d_spire_start(11)', U1); s4 = JS('select public.hd3d_spire_start(11)', U1)
    ok('sp_one_active', s3['ok'] and s4['ok'] and JS(f"select public.hd3d_spire_finish('{s3['token']}', 12, null)", U1)['reason'] == 'used' and psql(f"select status from public.hd3d_spire_runs where token = '{s3['token']}'")[1] == 'abandoned')
    f = JS(f"select public.hd3d_spire_finish('{s4['token']}', 10, null)", U1); ok('sp_checkpoint_no_climb_no_week', f['ok'] and f['top'] == 10 and f['best'] == 12 and f['week_best'] == 12 and not f['capped'], f)
    s5 = JS('select public.hd3d_spire_start(1)', U1); T_(s5['token'], "started_at = now() - interval '4 hours'")
    ok('sp_expired', JS(f"select public.hd3d_spire_finish('{s5['token']}', 20, null)", U1)['reason'] == 'expired' and psql(f"select status from public.hd3d_spire_runs where token = '{s5['token']}'")[1] == 'abandoned')
    s6 = JS('select public.hd3d_spire_start(1)', U1); T_(s6['token'], "started_at = now() - interval '2 hours'")
    f = JS(f"select public.hd3d_spire_finish('{s6['token']}', 100, null)", U1)
    ok('sp_max_per_run', f['ok'] and f['top'] == 30 and f['capped'] and f['best'] == 30 and f['reward']['floors'] == [15, 20, 25, 30] and f['reward']['souls'] == 3000 and f['reward']['medals'] == 15 and f['reward']['titles'] == ['spire_30'], f)
    ok('sp_title_wallet', 'spire_30' in JS('select public.hd3d_dungeon_status()', U1)['titles'] and 'lich_hunter' in JS('select public.hd3d_dungeon_status()', U1)['titles'])
    s7 = JS('select public.hd3d_spire_start(1)', U1); T_(s7['token'], "started_at = now() - interval '2 hours'")
    f = JS(f"select public.hd3d_spire_finish('{s7['token']}', 30, null)", U1); ok('sp_first_clear_once', f['ok'] and f['top'] == 30 and f['reward']['floors'] == [] and f['reward']['mail'] is None and not f['new_best'], f)
    ok('sp_mail_count', psql(f"select count(*) from public.hd3d_mail where user_id = '{U1['sub']}' and title = '🗼 무한의 탑 첫 돌파'")[1] == '3')
    # 하루 상한 30
    psql(f"insert into public.hd3d_spire_runs (user_id, day, week, from_floor, status) select '{U2['sub']}', public.hd3d_kst_day(), public.hd3d_kst_week(), 1, 'done' from generate_series(1, 30)")
    ok('sp_daily_limit', JS('select public.hd3d_spire_start(1)', U2)['reason'] == 'daily_limit' and JS('select public.hd3d_spire_status()', U2)['left'] == 0)
    psql(f"delete from public.hd3d_spire_runs where user_id = '{U2['sub']}'")
    # 직접 쓰기 · 남의 기록 읽기 거부
    r = A('update public.hd3d_spire_best set best_floor = 999 returning user_id', U1); ok('sp_no_direct_write', ((not r[0]) or r[1] == '') and not A(f"insert into public.hd3d_spire_runs (user_id, day, week, from_floor) values ('{U1['sub']}', current_date, current_date, 1)", U1)[0] and not A(f"insert into public.hd3d_spire_weeks (user_id, week, best_floor) values ('{U1['sub']}', current_date, 99)", U1)[0], r)
    ok('sp_rls_own_only', A('select count(*) from public.hd3d_spire_runs', U2)[1] == '0' and A('select count(*) from public.hd3d_spire_best', U2)[1] == '0' and int(A('select count(*) from public.hd3d_spire_runs', U1)[1]) >= 7 and int(A('select count(*) from public.hd3d_spire_runs', ADM)[1]) >= 7)
    # 랭킹: U1 30층(먼저) · U3 30층(나중) · U4 12층 → 동률은 서버 도달 시각 순 · 정지 계정 제외
    def climb(U, top, ago):
        s_ = JS('select public.hd3d_spire_start(1)', U); T_(s_['token'], f"started_at = now() - interval '{ago}'"); return JS(f"select public.hd3d_spire_finish('{s_['token']}', {top}, null)", U)
    climb(U3, 30, '2 hours'); climb(U4, 12, '10 minutes')
    psql(f"insert into public.hd3d_profiles (id, nickname) values ('{U1['sub']}', '탑왕') on conflict (id) do update set nickname = excluded.nickname")
    rk = JS("select public.hd3d_spire_rank('week', null)", U4)
    ok('sp_rank_week', [(x['rank'], x['floor']) for x in rk['top']] == [(1, 30), (2, 30), (3, 12)] and rk['top'][0]['nick'] == '탑왕' and rk['top'][2]['nick'] == '용사' and rk['top'][2]['me'] and rk['me'] == {'rank': 3, 'floor': 12}, rk)
    ok('sp_rank_tie_time', JS('select public.hd3d_spire_status()', U3)['week_rank'] == 2 and JS('select public.hd3d_spire_status()', U1)['week_rank'] == 1)
    rk = JS("select public.hd3d_spire_rank('all', null)", U2); ok('sp_rank_all', [x['floor'] for x in rk['top']] == [30, 30, 12] and rk['me'] is None and rk['week'] is None, rk)
    ok('sp_rank_other_week', JS("select public.hd3d_spire_rank('week', current_date - 70)", U1)['top'] == [] and JS("select public.hd3d_spire_rank('x', null)", U1)['reason'] == 'bad_kind')
    A(f"select public.hd3d_admin_ban('{U3['sub']}', '탑 테스트')", ADM)
    rk = JS("select public.hd3d_spire_rank('week', null)", U4); ok('sp_rank_excludes_banned', [x['floor'] for x in rk['top']] == [30, 12] and rk['me']['rank'] == 2 and JS('select public.hd3d_spire_status()', U4)['week_rank'] == 2, rk)
    ok('sp_banned_denied', not A('select public.hd3d_spire_start(1)', U3)[0] and not A("select public.hd3d_spire_ping('00000000-0000-0000-0000-0000000000ff', 5)", U3)[0] and not A("select public.hd3d_spire_finish('00000000-0000-0000-0000-0000000000ff', 5, null)", U3)[0] and JS('select public.hd3d_spire_status()', U3)['banned'])
    A(f"select public.hd3d_admin_unban('{U3['sub']}', 'x')", ADM)
    r3 = psql(sql); ok('schema_run3_after_data', r3[0], r3[2][-300:])
    ok('uq_kept_after_rerun', JS('select public.hd3d_dungeon_status()', U3)['uniques'] == ['d_fist'] and JS('select public.hd3d_dungeon_status()', U4)['uniques'] == ['d_fist'])
    ok('sp_kept_after_rerun', JS('select public.hd3d_spire_status()', U1)['best'] == 30 and JS('select public.hd3d_spire_status()', U1)['cleared'] == 30)
    ok('owner_kept_after_rerun', A('select public.hd3d_is_owner()', ADM)[1] == 't' and psql('select count(*) from public.hd3d_admins')[1] == '1')
finally:
    subprocess.run([f'{B}/pg_ctl', '-D', data, '-m', 'immediate', 'stop'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); shutil.rmtree(tmp, ignore_errors=True)
fail = [k for k, v in res.items() if not v]; print(f'{len(res) - len(fail)}/{len(res)}', 'ALL OK' if not fail else 'FAIL ' + ','.join(fail)); sys.exit(1 if fail else 0)
