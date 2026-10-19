-- 히어로 디펜스 3D (hero-defense-3d) — Supabase schema. Idempotent: 여러 번 실행해도 안전.
-- Supabase Dashboard > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run.
-- public 스키마에 hd3d_ 접두사 객체만 새로 만듭니다. 기존 cart_ 테이블이나 auth.users 트리거는 건드리지 않습니다.

create or replace function public.hd3d_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- hd3d_profiles: 사용자당 1행 (닉네임) ----------
create table if not exists public.hd3d_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '용사' check (char_length(nickname) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hd3d_profiles enable row level security;
drop policy if exists hd3d_profiles_select_own on public.hd3d_profiles;
create policy hd3d_profiles_select_own on public.hd3d_profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists hd3d_profiles_insert_own on public.hd3d_profiles;
create policy hd3d_profiles_insert_own on public.hd3d_profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists hd3d_profiles_update_own on public.hd3d_profiles;
create policy hd3d_profiles_update_own on public.hd3d_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop trigger if exists hd3d_profiles_updated_at on public.hd3d_profiles;
create trigger hd3d_profiles_updated_at before update on public.hd3d_profiles for each row execute function public.hd3d_set_updated_at();

-- ---------- hd3d_progress: 사용자당 1행, 저장 데이터 jsonb ----------
-- data = { v, hero, souls, bestWave, heroLv{cls:{hp,atk}}, stats{runs,kills,waves,souls}, settings{audio{…}}, nick }
create table if not exists public.hd3d_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 65536),
  merged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hd3d_progress enable row level security;
drop policy if exists hd3d_progress_select_own on public.hd3d_progress;
create policy hd3d_progress_select_own on public.hd3d_progress for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists hd3d_progress_insert_own on public.hd3d_progress;
create policy hd3d_progress_insert_own on public.hd3d_progress for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists hd3d_progress_update_own on public.hd3d_progress;
create policy hd3d_progress_update_own on public.hd3d_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop trigger if exists hd3d_progress_updated_at on public.hd3d_progress;
create trigger hd3d_progress_updated_at before update on public.hd3d_progress for each row execute function public.hd3d_set_updated_at();

-- ---------- privileges ----------
revoke all on public.hd3d_profiles, public.hd3d_progress from anon;
grant select, insert, update on public.hd3d_profiles, public.hd3d_progress to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================================================
-- 상점 · 우편함 · 관리자 (2026-10-19 추가). 이 아래도 idempotent, hd3d_ 객체만 생성/수정합니다 (cart_* 는 건드리지 않음).
-- 흐름: 사용자 구매 신청(hd3d_orders, 항상 pending) → 관리자 승인 RPC(hd3d_admin_approve: 주문 approved + 보상 우편 생성, 한 트랜잭션)
--       → 사용자가 우편 '받기' RPC(hd3d_claim_mail: claimed 표시 + 영웅 소유권 hd3d_owned 기록, 한 번만) → 클라이언트가 hd3d_owned 를 읽어 영웅 해금.
-- 유료 영웅 소유권은 사용자가 쓸 수 있는 저장 jsonb(hd3d_progress)가 아니라 hd3d_owned 에만 기록되며, 이 테이블은 사용자가 직접 쓸 수 없습니다.
-- 관리자 = JWT 이메일이 hyunjk11@daum.net 이고, hd3d_admins 에 등록된 사용자 id (아래에서 auth.users 로부터 자동 등록).
--   ※ hyunjk11@daum.net 계정으로 회원가입한 뒤에 이 SQL을 실행(또는 다시 실행)해야 관리자 권한이 생깁니다.
--     (이메일 인증이 꺼진 프로젝트에서 남이 같은 이메일로 먼저 가입해 관리자 행세를 하는 것을 막기 위해 id 를 고정)
-- =====================================================================================================

-- ---------- 관리자 ----------
create table if not exists public.hd3d_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.hd3d_admins enable row level security; -- 정책 없음 = 클라이언트에서 읽기/쓰기 불가 (SECURITY DEFINER 함수만 사용)
insert into public.hd3d_admins (user_id) select id from auth.users where lower(email) = 'hyunjk11@daum.net' on conflict do nothing;

create or replace function public.hd3d_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') = 'hyunjk11@daum.net'
     and exists (select 1 from public.hd3d_admins a where a.user_id = auth.uid());
$$;

-- 판매 상품 → 우편 보상 (서버가 결정, 클라이언트 값 사용 안 함)
create or replace function public.hd3d_item_reward(p_item text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_item when 'hero_gunner' then '{"hero":"gunner"}'::jsonb else null end;
$$;
create or replace function public.hd3d_item_name(p_item text) returns text
language sql immutable set search_path = '' as $$
  select case p_item when 'hero_gunner' then '유료 영웅 · 총사 로즈' else p_item end;
$$;

-- ---------- hd3d_owned: 서버가 기록하는 소유권 (사용자는 읽기만) ----------
create table if not exists public.hd3d_owned (
  user_id uuid not null references auth.users (id) on delete cascade,
  item text not null check (item in ('hero_gunner')),
  source_mail bigint,
  created_at timestamptz not null default now(),
  primary key (user_id, item)
);
alter table public.hd3d_owned enable row level security;
drop policy if exists hd3d_owned_select_own on public.hd3d_owned;
create policy hd3d_owned_select_own on public.hd3d_owned for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));

-- ---------- hd3d_orders: 구매 신청 ----------
create table if not exists public.hd3d_orders (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text,
  nickname text,
  item text not null check (item in ('hero_gunner')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
-- 같은 상품에 대기 중 신청은 1개만
create unique index if not exists hd3d_orders_one_pending on public.hd3d_orders (user_id, item) where status = 'pending';
create index if not exists hd3d_orders_created on public.hd3d_orders (created_at desc);
alter table public.hd3d_orders enable row level security;
drop policy if exists hd3d_orders_select on public.hd3d_orders;
create policy hd3d_orders_select on public.hd3d_orders for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));
drop policy if exists hd3d_orders_insert_own on public.hd3d_orders;
create policy hd3d_orders_insert_own on public.hd3d_orders for insert to authenticated with check ((select auth.uid()) = user_id and status = 'pending' and decided_at is null);
drop policy if exists hd3d_orders_update_admin on public.hd3d_orders;
create policy hd3d_orders_update_admin on public.hd3d_orders for update to authenticated using ((select public.hd3d_is_admin())) with check ((select public.hd3d_is_admin()));
-- 삽입 시 서버가 값 강제: 본인 id·JWT 이메일·프로필 닉네임·pending·현재 시각. 이미 보유한 상품은 신청 불가
create or replace function public.hd3d_orders_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  new.user_id := auth.uid(); new.email := auth.jwt() ->> 'email'; new.status := 'pending'; new.decided_at := null; new.created_at := now();
  select p.nickname into new.nickname from public.hd3d_profiles p where p.id = new.user_id;
  if exists (select 1 from public.hd3d_owned o where o.user_id = new.user_id and o.item = new.item) then
    raise exception 'already owned' using errcode = '23505', hint = 'hd3d_owned';
  end if;
  return new;
end $$;
drop trigger if exists hd3d_orders_before_insert on public.hd3d_orders;
create trigger hd3d_orders_before_insert before insert on public.hd3d_orders for each row execute function public.hd3d_orders_before_insert();

-- ---------- hd3d_mail: 우편함 ----------
create table if not exists public.hd3d_mail (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  body text not null default '' check (char_length(body) <= 1000),
  reward jsonb check (reward is null or (jsonb_typeof(reward) = 'object' and pg_column_size(reward) < 2048)),
  order_id bigint references public.hd3d_orders (id) on delete set null,
  claimed boolean not null default false,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists hd3d_mail_user on public.hd3d_mail (user_id, created_at desc);
alter table public.hd3d_mail enable row level security;
drop policy if exists hd3d_mail_select on public.hd3d_mail;
create policy hd3d_mail_select on public.hd3d_mail for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));
drop policy if exists hd3d_mail_insert_admin on public.hd3d_mail;
create policy hd3d_mail_insert_admin on public.hd3d_mail for insert to authenticated with check ((select public.hd3d_is_admin()));
-- 사용자 update/delete 정책 없음: '받기'는 hd3d_claim_mail RPC 로만 (보상 수정 불가)

-- 보상 검증: souls/steel/crystal 0~1,000,000 정수, hero 는 판매 영웅만
create or replace function public.hd3d_valid_reward(r jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select r is null or (
    jsonb_typeof(r) = 'object'
    and not exists (select 1 from jsonb_object_keys(r) k where k not in ('souls', 'steel', 'crystal', 'hero'))
    and coalesce((r ->> 'souls') ~ '^[0-9]{1,7}$', true) and coalesce((r ->> 'souls')::bigint <= 1000000, true)
    and coalesce((r ->> 'steel') ~ '^[0-9]{1,7}$', true) and coalesce((r ->> 'steel')::bigint <= 1000000, true)
    and coalesce((r ->> 'crystal') ~ '^[0-9]{1,7}$', true) and coalesce((r ->> 'crystal')::bigint <= 1000000, true)
    and coalesce(r ->> 'hero' in ('gunner'), true));
$$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hd3d_mail_reward_valid') then
    alter table public.hd3d_mail add constraint hd3d_mail_reward_valid check (public.hd3d_valid_reward(reward));
  end if;
end $$;

-- ---------- RPC: 우편 받기 (원자적 · 한 번만) ----------
create or replace function public.hd3d_claim_mail(p_mail_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.hd3d_mail%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  update public.hd3d_mail set claimed = true, claimed_at = now() where id = p_mail_id and user_id = auth.uid() and not claimed returning * into m;
  if not found then
    if exists (select 1 from public.hd3d_mail where id = p_mail_id and user_id = auth.uid()) then
      return jsonb_build_object('ok', true, 'already', true, 'id', p_mail_id);
    end if;
    raise exception 'mail not found' using errcode = 'P0002';
  end if;
  if m.reward ? 'hero' then
    insert into public.hd3d_owned (user_id, item, source_mail) values (m.user_id, 'hero_' || (m.reward ->> 'hero'), m.id) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'already', false, 'id', m.id, 'reward', m.reward);
end $$;

-- ---------- RPC: 관리자 승인 / 거절 / 우편 보내기 ----------
create or replace function public.hd3d_admin_approve(p_order_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.hd3d_orders%rowtype; mid bigint;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.hd3d_orders set status = 'approved', decided_at = now() where id = p_order_id and status = 'pending' returning * into o;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;
  insert into public.hd3d_mail (user_id, title, body, reward, order_id)
    values (o.user_id, '🎁 구매하신 상품이 도착했습니다', public.hd3d_item_name(o.item) || ' 구매가 승인되었습니다. 감사합니다! ''받기''를 눌러 수령하세요.', public.hd3d_item_reward(o.item), o.id)
    returning id into mid;
  return jsonb_build_object('ok', true, 'order', o.id, 'mail', mid);
end $$;

create or replace function public.hd3d_admin_reject(p_order_id bigint, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.hd3d_orders%rowtype; mid bigint;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.hd3d_orders set status = 'rejected', decided_at = now(), note = left(p_reason, 200) where id = p_order_id and status = 'pending' returning * into o;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;
  insert into public.hd3d_mail (user_id, title, body, reward, order_id)
    values (o.user_id, '구매 신청이 거절되었습니다', public.hd3d_item_name(o.item) || ' 구매 신청이 거절되었습니다.' || coalesce(' 사유: ' || nullif(left(p_reason, 200), ''), '') || ' 문의는 관리자에게 해 주세요.', null, o.id)
    returning id into mid;
  return jsonb_build_object('ok', true, 'order', o.id, 'mail', mid);
end $$;

create or replace function public.hd3d_admin_send_mail(p_email text, p_title text, p_body text, p_reward jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; mid bigint;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  if not public.hd3d_valid_reward(p_reward) then return jsonb_build_object('ok', false, 'reason', 'bad_reward'); end if;
  insert into public.hd3d_mail (user_id, title, body, reward) values (uid, left(p_title, 60), left(coalesce(p_body, ''), 1000), nullif(p_reward, '{}'::jsonb)) returning id into mid;
  return jsonb_build_object('ok', true, 'mail', mid);
end $$;

-- ---------- privileges ----------
revoke all on public.hd3d_admins, public.hd3d_owned, public.hd3d_orders, public.hd3d_mail from anon, authenticated;
grant select on public.hd3d_owned to authenticated;
grant select, insert (item) on public.hd3d_orders to authenticated;
grant update (status, decided_at, note) on public.hd3d_orders to authenticated; -- RLS 로 관리자만
grant select, insert on public.hd3d_mail to authenticated; -- insert 는 RLS 로 관리자만
revoke all on function public.hd3d_claim_mail(bigint), public.hd3d_admin_approve(bigint), public.hd3d_admin_reject(bigint, text), public.hd3d_admin_send_mail(text, text, text, jsonb), public.hd3d_is_admin() from public, anon;
grant execute on function public.hd3d_claim_mail(bigint), public.hd3d_admin_approve(bigint), public.hd3d_admin_reject(bigint, text), public.hd3d_admin_send_mail(text, text, text, jsonb), public.hd3d_is_admin() to authenticated;

notify pgrst, 'reload schema';
