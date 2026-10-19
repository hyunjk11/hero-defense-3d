#!/usr/bin/env python3
"""supabase/schema.sql 서버 측 보안 테스트: 로컬 임시 PostgreSQL(17)에 Supabase auth 스텁(auth.users/auth.uid()/auth.jwt(), anon/authenticated 역할)을 만들고
schema.sql 을 두 번 실행(idempotent) 한 뒤, authenticated 역할 + JWT 클레임으로 RLS·트리거·RPC 를 검사.  python3 tests/schema_pg.py
PostgreSQL 바이너리가 없으면 SKIP (exit 0)."""
import os, sys, subprocess, tempfile, shutil, glob, json, time, socket
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bins = sorted(glob.glob('/usr/lib/postgresql/*/bin/initdb'))
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
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
    -- 기존 cart_ 테이블이 있어도 건드리지 않는지 확인용
    create table public.cart_dummy (id int); insert into public.cart_dummy values (1);
    insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'hyunjk11@daum.net'), ('00000000-0000-0000-0000-000000000001', 'u1@test.kr'), ('00000000-0000-0000-0000-000000000002', 'u2@test.kr');
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
    ok('anon_no_access', not psql('select count(*) from public.hd3d_mail', 'anon', {})[0] and not psql('select count(*) from public.hd3d_orders', 'anon', {})[0])
finally:
    subprocess.run([f'{B}/pg_ctl', '-D', data, '-m', 'immediate', 'stop'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); shutil.rmtree(tmp, ignore_errors=True)
fail = [k for k, v in res.items() if not v]; print(f'{len(res) - len(fail)}/{len(res)}', 'ALL OK' if not fail else 'FAIL ' + ','.join(fail)); sys.exit(1 if fail else 0)
