-- 히어로 디펜스 3D (hero-defense-3d) — Supabase schema. Idempotent: 여러 번 실행해도 안전.
-- Supabase Dashboard > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run.
-- public 스키마에 hd3d_ 접두사 객체만 새로 만듭니다. 기존 cart_ 테이블이나 auth.users 트리거는 건드리지 않습니다.

create or replace function public.hd3d_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- hd3d_bans: 계정 정지 (2026-10-22). 정지된 계정은 진행 저장·닉네임·구매 신청·우편 받기가 서버에서 거부됨 ----------
-- 아래 진행/프로필 RLS 정책이 hd3d_is_banned() 를 쓰므로 먼저 만듭니다. 쓰기는 관리자 RPC(hd3d_admin_ban/unban)로만.
create table if not exists public.hd3d_bans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 200),
  banned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.hd3d_bans enable row level security;
drop policy if exists hd3d_bans_select_own on public.hd3d_bans;
create policy hd3d_bans_select_own on public.hd3d_bans for select to authenticated using ((select auth.uid()) = user_id); -- 본인 정지 사유만 읽기
create or replace function public.hd3d_is_banned() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hd3d_bans b where b.user_id = auth.uid());
$$;
revoke all on public.hd3d_bans from anon, authenticated;
grant select on public.hd3d_bans to authenticated;
revoke all on function public.hd3d_is_banned() from public, anon;
grant execute on function public.hd3d_is_banned() to authenticated; -- RLS 정책에서 호출

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
create policy hd3d_profiles_insert_own on public.hd3d_profiles for insert to authenticated with check ((select auth.uid()) = id and not (select public.hd3d_is_banned()));
drop policy if exists hd3d_profiles_update_own on public.hd3d_profiles;
create policy hd3d_profiles_update_own on public.hd3d_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id and not (select public.hd3d_is_banned()));
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
create policy hd3d_progress_insert_own on public.hd3d_progress for insert to authenticated with check ((select auth.uid()) = user_id and not (select public.hd3d_is_banned()));
drop policy if exists hd3d_progress_update_own on public.hd3d_progress;
create policy hd3d_progress_update_own on public.hd3d_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and not (select public.hd3d_is_banned()));
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
-- 2026-10-22: owner(최고 관리자) 플래그 + 하위 관리자. owner 는 이 SQL 로만 지정(hyunjk11@daum.net), 하위 관리자는 owner 가 hd3d_owner_add_admin 으로 추가
alter table public.hd3d_admins add column if not exists owner boolean not null default false;
alter table public.hd3d_admins add column if not exists added_by uuid references auth.users (id) on delete set null;
insert into public.hd3d_admins (user_id, owner) select id, true from auth.users where lower(email) = 'hyunjk11@daum.net'
  on conflict (user_id) do update set owner = true;

-- 관리자 = hd3d_admins 에 등록된 id. owner 행은 JWT 이메일도 hyunjk11@daum.net 이어야 함 (예전과 같은 이중 확인)
create or replace function public.hd3d_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hd3d_admins a where a.user_id = auth.uid()
    and (not a.owner or coalesce(lower(auth.jwt() ->> 'email'), '') = 'hyunjk11@daum.net'));
$$;
create or replace function public.hd3d_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hd3d_admins a where a.user_id = auth.uid() and a.owner
    and coalesce(lower(auth.jwt() ->> 'email'), '') = 'hyunjk11@daum.net');
$$;

-- 판매 상품 → 우편 보상 (서버가 결정, 클라이언트 값 사용 안 함)
create or replace function public.hd3d_item_reward(p_item text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_item when 'hero_gunner' then '{"hero":"gunner"}'::jsonb when 'hero_mechanic' then '{"hero":"mechanic"}'::jsonb else null end;
$$;
create or replace function public.hd3d_item_name(p_item text) returns text
language sql immutable set search_path = '' as $$
  select case p_item when 'hero_gunner' then '유료 영웅 · 총사 로즈' when 'hero_mechanic' then '유료 영웅 · 메카닉 버들' else p_item end;
$$;

-- ---------- hd3d_owned: 서버가 기록하는 소유권 (사용자는 읽기만) ----------
create table if not exists public.hd3d_owned (
  user_id uuid not null references auth.users (id) on delete cascade,
  item text not null check (item in ('hero_gunner', 'hero_mechanic')),
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
  item text not null check (item in ('hero_gunner', 'hero_mechanic')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
-- 판매 상품 목록 갱신 (이미 만들어진 테이블의 check 제약도 교체 → 이 파일을 다시 실행하면 새 상품이 반영됨. 2026-10-19: hero_mechanic 추가)
alter table public.hd3d_owned drop constraint if exists hd3d_owned_item_check;
alter table public.hd3d_owned add constraint hd3d_owned_item_check check (item in ('hero_gunner', 'hero_mechanic'));
alter table public.hd3d_orders drop constraint if exists hd3d_orders_item_check;
alter table public.hd3d_orders add constraint hd3d_orders_item_check check (item in ('hero_gunner', 'hero_mechanic'));
-- 2026-10-22: 환불(refunded) 상태 + 환불 시각/사유
alter table public.hd3d_orders drop constraint if exists hd3d_orders_status_check;
alter table public.hd3d_orders add constraint hd3d_orders_status_check check (status in ('pending', 'approved', 'rejected', 'refunded'));
alter table public.hd3d_orders add column if not exists refunded_at timestamptz;
alter table public.hd3d_orders add column if not exists refund_note text check (refund_note is null or char_length(refund_note) <= 200);
-- 같은 상품에 대기 중 신청은 1개만
create unique index if not exists hd3d_orders_one_pending on public.hd3d_orders (user_id, item) where status = 'pending';
create index if not exists hd3d_orders_created on public.hd3d_orders (created_at desc);
alter table public.hd3d_orders enable row level security;
drop policy if exists hd3d_orders_select on public.hd3d_orders;
create policy hd3d_orders_select on public.hd3d_orders for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));
drop policy if exists hd3d_orders_insert_own on public.hd3d_orders;
create policy hd3d_orders_insert_own on public.hd3d_orders for insert to authenticated with check ((select auth.uid()) = user_id and status = 'pending' and decided_at is null and not (select public.hd3d_is_banned()));
-- 2026-10-22: 관리자의 테이블 직접 수정 경로 제거 → 상태 변경은 기록이 남는 RPC(승인/거절/환불)로만
drop policy if exists hd3d_orders_update_admin on public.hd3d_orders;
-- 삽입 시 서버가 값 강제: 본인 id·JWT 이메일·프로필 닉네임·pending·현재 시각. 이미 보유한 상품은 신청 불가
create or replace function public.hd3d_orders_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if public.hd3d_is_banned() then raise exception 'banned' using errcode = '42501', hint = 'banned'; end if;
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
alter table public.hd3d_mail add column if not exists revoked boolean not null default false; -- 2026-10-22: 환불/회수된 미수령 우편 (받기 불가)
alter table public.hd3d_mail add column if not exists broadcast_id bigint;                   -- 2026-10-22: 전체 우편으로 만든 행
alter table public.hd3d_mail enable row level security;
drop policy if exists hd3d_mail_select on public.hd3d_mail;
create policy hd3d_mail_select on public.hd3d_mail for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));
drop policy if exists hd3d_mail_insert_admin on public.hd3d_mail; -- 2026-10-22: 직접 insert 경로 제거 → 우편은 기록이 남는 관리자 RPC 로만
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
    and coalesce(r ->> 'hero' in ('gunner', 'mechanic'), true));
$$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hd3d_mail_reward_valid') then
    alter table public.hd3d_mail add constraint hd3d_mail_reward_valid check (public.hd3d_valid_reward(reward));
  end if;
end $$;

-- ---------- RPC: 우편 받기 (원자적 · 한 번만) ----------
-- 이미 받은 우편이면 already = true 와 함께 reward 도 돌려줌 (보상 장부: 서버는 받음 처리됐는데 응답이 끊긴 경우,
-- 클라이언트가 '받는 중'으로 적어 둔 우편만 다시 불러 세이브에 반영. 세이브의 mailLog 로 두 번 더하지 않음 — src/account/shop.js)
create or replace function public.hd3d_claim_mail(p_mail_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.hd3d_mail%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if public.hd3d_is_banned() then raise exception 'banned' using errcode = '42501', hint = 'banned'; end if;
  update public.hd3d_mail set claimed = true, claimed_at = now() where id = p_mail_id and user_id = auth.uid() and not claimed and not revoked returning * into m;
  if not found then
    select * into m from public.hd3d_mail where id = p_mail_id and user_id = auth.uid();
    if found and m.revoked and not m.claimed then raise exception 'mail revoked' using errcode = 'P0002', hint = 'revoked'; end if;
    if found then
      return jsonb_build_object('ok', true, 'already', true, 'id', m.id, 'reward', m.reward);
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
  perform public.hd3d_log('order_approve', o.user_id, jsonb_build_object('order', o.id, 'item', o.item));
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
  perform public.hd3d_log('order_reject', o.user_id, jsonb_build_object('order', o.id, 'item', o.item, 'reason', left(p_reason, 200)));
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
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 60 then return jsonb_build_object('ok', false, 'reason', 'bad_title'); end if;
  insert into public.hd3d_mail (user_id, title, body, reward) values (uid, trim(p_title), left(coalesce(p_body, ''), 1000), nullif(p_reward, '{}'::jsonb)) returning id into mid;
  perform public.hd3d_log('mail_send', uid, jsonb_build_object('mail', mid, 'title', trim(p_title), 'reward', nullif(p_reward, '{}'::jsonb)));
  return jsonb_build_object('ok', true, 'mail', mid);
end $$;

-- ---------- privileges ----------
revoke all on public.hd3d_admins, public.hd3d_owned, public.hd3d_orders, public.hd3d_mail from anon, authenticated;
grant select on public.hd3d_owned to authenticated;
grant select, insert (item) on public.hd3d_orders to authenticated;
grant select on public.hd3d_mail to authenticated; -- 쓰기는 SECURITY DEFINER RPC 로만 (2026-10-22: 관리자 직접 update/insert 권한 제거)
revoke all on function public.hd3d_claim_mail(bigint), public.hd3d_admin_approve(bigint), public.hd3d_admin_reject(bigint, text), public.hd3d_admin_send_mail(text, text, text, jsonb), public.hd3d_is_admin(), public.hd3d_is_owner() from public, anon;
grant execute on function public.hd3d_claim_mail(bigint), public.hd3d_admin_approve(bigint), public.hd3d_admin_reject(bigint, text), public.hd3d_admin_send_mail(text, text, text, jsonb), public.hd3d_is_admin(), public.hd3d_is_owner() to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================================================
-- 관리자 권한 확장 (2026-10-22). 이 아래도 idempotent. 모든 관리자 기능은 SECURITY DEFINER 함수 안에서 hd3d_is_admin()/hd3d_is_owner() 를 다시 검사하고
-- hd3d_admin_log 에 기록합니다. 클라이언트(공개 키)는 테이블을 직접 바꿀 수 없습니다.
--   유저 검색/상세 · 유료 영웅 지급/회수 · 전체 우편 · 공지 · 계정 정지/해제 · 주문 목록/환불 · 활동 기록 · 하위 관리자(owner 만)
-- =====================================================================================================

-- ---------- 관리자 활동 기록: 관리자만 읽기, 쓰기는 아래 함수(hd3d_log, 클라이언트 실행 불가)로만 ----------
create table if not exists public.hd3d_admin_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  admin_email text,
  action text not null check (char_length(action) between 1 and 40),
  target_user uuid, -- FK 없음: 대상 계정이 지워져도 기록은 남김
  target_email text,
  detail jsonb check (detail is null or pg_column_size(detail) < 8192),
  created_at timestamptz not null default now()
);
create index if not exists hd3d_admin_log_created on public.hd3d_admin_log (created_at desc);
create index if not exists hd3d_admin_log_target on public.hd3d_admin_log (target_user, created_at desc);
alter table public.hd3d_admin_log enable row level security;
drop policy if exists hd3d_admin_log_select_admin on public.hd3d_admin_log;
create policy hd3d_admin_log_select_admin on public.hd3d_admin_log for select to authenticated using ((select public.hd3d_is_admin()));

-- 내부용 (SECURITY INVOKER + 실행 권한 없음 → 관리자 RPC 안에서만 동작)
create or replace function public.hd3d_log(p_action text, p_target uuid, p_detail jsonb default null) returns void
language plpgsql set search_path = '' as $$
begin
  insert into public.hd3d_admin_log (admin_id, admin_email, action, target_user, target_email, detail)
    values (auth.uid(), auth.jwt() ->> 'email', p_action, p_target, (select u.email from auth.users u where u.id = p_target), p_detail);
end $$;

-- 사용자가 쓰는 저장 jsonb 에서 숫자만 안전하게 (형식이 이상하면 0)
create or replace function public.hd3d_jnum(v jsonb) returns bigint
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' and v::text ~ '^[0-9]{1,15}(\.[0-9]+)?$' then floor(v::text::numeric)::bigint else 0 end;
$$;
create or replace function public.hd3d_jstars(v jsonb) returns bigint
language sql immutable set search_path = '' as $$
  select coalesce(sum(least(3, e.value::int)), 0)::bigint
    from jsonb_each_text(case when jsonb_typeof(v) = 'object' then v else '{}'::jsonb end) e
   where e.value ~ '^[0-9]{1,3}$';
$$;
-- 진행 요약: 별(일반/하드) · 영혼석 · 강철 · 마력석 · 정수 · 최고 웨이브 · 출정 · 전직 {영웅: 분기}
create or replace function public.hd3d_progress_summary(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when d is null or jsonb_typeof(d) <> 'object' then null else jsonb_build_object(
    'stars', public.hd3d_jstars(d -> 'st'), 'hstars', public.hd3d_jstars(d -> 'hst'),
    'souls', public.hd3d_jnum(d -> 'souls'), 'steel', public.hd3d_jnum(d -> 'mat' -> 'steel'),
    'crystal', public.hd3d_jnum(d -> 'mat' -> 'crystal'), 'essence', public.hd3d_jnum(d -> 'mat' -> 'essence'),
    'bestWave', public.hd3d_jnum(d -> 'bestWave'), 'runs', public.hd3d_jnum(d -> 'stats' -> 'runs'),
    'hero', left(case when jsonb_typeof(d -> 'hero') = 'string' then d ->> 'hero' end, 20),
    'adv', (select coalesce(jsonb_object_agg(left(e.key, 20), left(e.value ->> 'b', 20)), '{}'::jsonb)
              from jsonb_each(case when jsonb_typeof(d -> 'adv') = 'object' then d -> 'adv' else '{}'::jsonb end) e
             where jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> 'b') = 'string'))
  end;
$$;
-- 사용자 카드 (내부용)
create or replace function public.hd3d_user_card(p_uid uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', u.id, 'email', u.email, 'nickname', p.nickname, 'created_at', u.created_at, 'last_seen', u.last_sign_in_at,
    'saved_at', g.updated_at, 'summary', public.hd3d_progress_summary(g.data),
    'owned', coalesce((select jsonb_agg(o.item order by o.item) from public.hd3d_owned o where o.user_id = u.id), '[]'::jsonb),
    'banned', b.user_id is not null, 'ban_reason', b.reason, 'banned_at', b.created_at,
    'admin', a.user_id is not null, 'owner', coalesce(a.owner, false))
  from auth.users u
  left join public.hd3d_profiles p on p.id = u.id left join public.hd3d_progress g on g.user_id = u.id
  left join public.hd3d_bans b on b.user_id = u.id left join public.hd3d_admins a on a.user_id = u.id
  where u.id = p_uid;
$$;
-- ilike 패턴 (%, _ 이스케이프)
create or replace function public.hd3d_like(q text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;
-- 사유 정리: 앞뒤 공백 제거, 1~200자 아니면 null
create or replace function public.hd3d_reason(r text) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(trim(coalesce(r, ''))) between 1 and 200 then trim(r) end;
$$;

-- ---------- 내 상태 (모든 로그인 사용자): 관리자/owner/정지 여부 ----------
create or replace function public.hd3d_my_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('admin', public.hd3d_is_admin(), 'owner', public.hd3d_is_owner(),
    'banned', b.user_id is not null, 'ban_reason', b.reason, 'banned_at', b.created_at)
  from (select auth.uid() as id) me left join public.hd3d_bans b on b.user_id = me.id;
$$;

-- ---------- 1) 유저 검색 (이 게임 사용자 = hd3d_profiles 또는 hd3d_progress 행이 있는 계정. 같은 프로젝트의 다른 게임 계정은 제외) ----------
create or replace function public.hd3d_admin_users(p_query text default '', p_offset int default 0, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := left(trim(coalesce(p_query, '')), 100); pat text; tot bigint; rws jsonb;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  pat := public.hd3d_like(q);
  p_limit := least(greatest(coalesce(p_limit, 20), 1), 50); p_offset := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  with f as (
    select u.id, greatest(u.created_at, u.last_sign_in_at, g.updated_at) as act
      from auth.users u left join public.hd3d_profiles p on p.id = u.id left join public.hd3d_progress g on g.user_id = u.id
     where (p.id is not null or g.user_id is not null)
       and (q = '' or u.email ilike pat or p.nickname ilike pat or u.id::text = q)
  ), pg as (select f.id, f.act from f order by f.act desc nulls last, f.id limit p_limit offset p_offset)
  select (select count(*) from f), coalesce((select jsonb_agg(public.hd3d_user_card(pg.id) order by pg.act desc nulls last, pg.id) from pg), '[]'::jsonb) into tot, rws;
  return jsonb_build_object('ok', true, 'total', tot, 'offset', p_offset, 'limit', p_limit, 'rows', rws);
end $$;

-- ---------- 2) 유저 상세: 카드 + 최근 주문/우편/관리 기록 ----------
create or replace function public.hd3d_admin_user(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  c := public.hd3d_user_card(p_user);
  if c is null then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  return jsonb_build_object('ok', true, 'user', c,
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (select * from public.hd3d_orders where user_id = p_user order by created_at desc limit 30) o), '[]'::jsonb),
    'mail', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'reward', m.reward, 'claimed', m.claimed, 'revoked', m.revoked, 'created_at', m.created_at) order by m.created_at desc)
                        from (select * from public.hd3d_mail where user_id = p_user order by created_at desc limit 30) m), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (select * from public.hd3d_admin_log where target_user = p_user order by created_at desc limit 20) l), '[]'::jsonb));
end $$;

-- ---------- 2) 유료 영웅 지급 / 회수 (사유 필수) ----------
create or replace function public.hd3d_admin_grant_hero(p_user uuid, p_item text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := public.hd3d_reason(p_reason);
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_item is null or p_item not in ('hero_gunner', 'hero_mechanic') then return jsonb_build_object('ok', false, 'reason', 'bad_item'); end if;
  if r is null then return jsonb_build_object('ok', false, 'reason', 'bad_reason'); end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  insert into public.hd3d_owned (user_id, item) values (p_user, p_item) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  perform public.hd3d_log('hero_grant', p_user, jsonb_build_object('item', p_item, 'reason', r));
  return jsonb_build_object('ok', true);
end $$;
-- 회수: 소유권 삭제 + 같은 영웅을 주는 미수령 우편도 회수(받기 불가). 세이브의 영웅 레벨·장비는 그대로 (영웅만 잠김)
create or replace function public.hd3d_admin_revoke_hero(p_user uuid, p_item text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := public.hd3d_reason(p_reason); n int;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_item is null or p_item not in ('hero_gunner', 'hero_mechanic') then return jsonb_build_object('ok', false, 'reason', 'bad_item'); end if;
  if r is null then return jsonb_build_object('ok', false, 'reason', 'bad_reason'); end if;
  delete from public.hd3d_owned where user_id = p_user and item = p_item;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_owned'); end if;
  update public.hd3d_mail set revoked = true where user_id = p_user and not claimed and not revoked and reward ->> 'hero' = substr(p_item, 6);
  get diagnostics n = row_count;
  perform public.hd3d_log('hero_revoke', p_user, jsonb_build_object('item', p_item, 'reason', r, 'mail_revoked', n));
  return jsonb_build_object('ok', true, 'mail_revoked', n);
end $$;

-- ---------- 3) 전체 우편: 이 게임 사용자마다 hd3d_mail 1행 (받기는 기존 hd3d_claim_mail → 서버에서 한 번만) ----------
-- 발송 후 가입한 사용자는 받지 않음. p_expected = 확인 창에 보여 준 받는 사람 수 (서버의 현재 수와 다르면 발송하지 않음)
create table if not exists public.hd3d_broadcasts (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 60),
  body text not null default '' check (char_length(body) <= 1000),
  reward jsonb check (public.hd3d_valid_reward(reward)),
  recipients int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.hd3d_broadcasts enable row level security; -- 정책 없음: 관리자 RPC 로만
create or replace function public.hd3d_recipients() returns setof uuid
language sql stable set search_path = '' as $$
  select p.id from public.hd3d_profiles p union select g.user_id from public.hd3d_progress g;
$$;
create or replace function public.hd3d_admin_broadcast_count() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'count', (select count(*) from public.hd3d_recipients()));
end $$;
create or replace function public.hd3d_admin_broadcast(p_title text, p_body text, p_reward jsonb, p_expected int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t text := trim(coalesce(p_title, '')); rw jsonb := nullif(p_reward, '{}'::jsonb); n int; bid bigint;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(t) not between 1 and 60 then return jsonb_build_object('ok', false, 'reason', 'bad_title'); end if;
  if char_length(coalesce(p_body, '')) > 1000 then return jsonb_build_object('ok', false, 'reason', 'bad_body'); end if;
  if not public.hd3d_valid_reward(rw) then return jsonb_build_object('ok', false, 'reason', 'bad_reward'); end if;
  perform pg_advisory_xact_lock(hashtext('hd3d_broadcast'));
  if exists (select 1 from public.hd3d_broadcasts b where b.created_at > now() - interval '30 seconds') then return jsonb_build_object('ok', false, 'reason', 'too_soon'); end if;
  select count(*) into n from public.hd3d_recipients();
  if p_expected is distinct from n then return jsonb_build_object('ok', false, 'reason', 'count_mismatch', 'count', n); end if;
  insert into public.hd3d_broadcasts (title, body, reward, recipients, created_by) values (t, coalesce(p_body, ''), rw, n, auth.uid()) returning id into bid;
  insert into public.hd3d_mail (user_id, title, body, reward, broadcast_id) select r.id, t, coalesce(p_body, ''), rw, bid from public.hd3d_recipients() r(id);
  perform public.hd3d_log('broadcast', null, jsonb_build_object('broadcast', bid, 'title', t, 'reward', rw, 'recipients', n));
  return jsonb_build_object('ok', true, 'broadcast', bid, 'count', n);
end $$;

-- ---------- 4) 공지: 로그인 사용자는 게시 중인 공지만 읽기, 쓰기는 관리자 RPC 로만 ----------
create table if not exists public.hd3d_notices (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 2000),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hd3d_notices_range check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists hd3d_notices_created on public.hd3d_notices (created_at desc);
alter table public.hd3d_notices enable row level security;
drop policy if exists hd3d_notices_select on public.hd3d_notices;
create policy hd3d_notices_select on public.hd3d_notices for select to authenticated using (
  (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or (select public.hd3d_is_admin()));
drop trigger if exists hd3d_notices_updated_at on public.hd3d_notices;
create trigger hd3d_notices_updated_at before update on public.hd3d_notices for each row execute function public.hd3d_set_updated_at();
-- p_id 가 null 이면 새 공지, 아니면 수정. 비활성화 = p_active false
create or replace function public.hd3d_admin_notice_save(p_id bigint, p_title text, p_body text, p_active boolean, p_starts timestamptz default null, p_ends timestamptz default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t text := trim(coalesce(p_title, '')); nid bigint;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(t) not between 1 and 80 then return jsonb_build_object('ok', false, 'reason', 'bad_title'); end if;
  if char_length(coalesce(p_body, '')) > 2000 then return jsonb_build_object('ok', false, 'reason', 'bad_body'); end if;
  if p_starts is not null and p_ends is not null and p_ends <= p_starts then return jsonb_build_object('ok', false, 'reason', 'bad_range'); end if;
  if p_id is null then
    insert into public.hd3d_notices (title, body, active, starts_at, ends_at, created_by) values (t, coalesce(p_body, ''), coalesce(p_active, true), p_starts, p_ends, auth.uid()) returning id into nid;
    perform public.hd3d_log('notice_create', null, jsonb_build_object('notice', nid, 'title', t, 'active', coalesce(p_active, true)));
  else
    update public.hd3d_notices set title = t, body = coalesce(p_body, ''), active = coalesce(p_active, active), starts_at = p_starts, ends_at = p_ends where id = p_id returning id into nid;
    if nid is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    perform public.hd3d_log('notice_update', null, jsonb_build_object('notice', nid, 'title', t, 'active', p_active));
  end if;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;
create or replace function public.hd3d_admin_notice_active(p_id bigint, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare nid bigint;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.hd3d_notices set active = coalesce(p_active, false) where id = p_id returning id into nid;
  if nid is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform public.hd3d_log(case when p_active then 'notice_activate' else 'notice_deactivate' end, null, jsonb_build_object('notice', nid));
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

-- ---------- 5) 계정 정지 / 해제 (사유 필수). 자기 자신·관리자는 정지 불가 ----------
create or replace function public.hd3d_admin_ban(p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := public.hd3d_reason(p_reason);
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if r is null then return jsonb_build_object('ok', false, 'reason', 'bad_reason'); end if;
  if p_user is null or p_user = auth.uid() then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if exists (select 1 from public.hd3d_admins a where a.user_id = p_user) then return jsonb_build_object('ok', false, 'reason', 'target_admin'); end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  insert into public.hd3d_bans (user_id, reason, banned_by) values (p_user, r, auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();
  perform public.hd3d_log('ban', p_user, jsonb_build_object('reason', r));
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.hd3d_admin_unban(p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := public.hd3d_reason(p_reason);
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if r is null then return jsonb_build_object('ok', false, 'reason', 'bad_reason'); end if;
  delete from public.hd3d_bans where user_id = p_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_banned'); end if;
  perform public.hd3d_log('unban', p_user, jsonb_build_object('reason', r));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 6) 주문 관리: 필터(상태 · 이메일/닉네임) + 페이지, 환불(소유권 회수 · 미수령 우편 회수 · 안내 우편) ----------
create or replace function public.hd3d_admin_orders(p_status text default null, p_query text default '', p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := left(trim(coalesce(p_query, '')), 100); st text := nullif(trim(coalesce(p_status, '')), ''); pat text; tot bigint; rws jsonb; cnt jsonb;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if st is not null and st not in ('pending', 'approved', 'rejected', 'refunded') then return jsonb_build_object('ok', false, 'reason', 'bad_status'); end if;
  pat := public.hd3d_like(q);
  p_limit := least(greatest(coalesce(p_limit, 50), 1), 100); p_offset := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  with f as (
    select o.* from public.hd3d_orders o
     where (st is null or o.status = st) and (q = '' or o.email ilike pat or o.nickname ilike pat or o.user_id::text = q)
  ), pg as (select * from f order by f.created_at desc, f.id desc limit p_limit offset p_offset)
  select (select count(*) from f), coalesce((select jsonb_agg(to_jsonb(pg) order by pg.created_at desc, pg.id desc) from pg), '[]'::jsonb) into tot, rws;
  select jsonb_object_agg(s.status, s.n) into cnt from (select o.status, count(*) as n from public.hd3d_orders o group by o.status) s;
  return jsonb_build_object('ok', true, 'total', tot, 'offset', p_offset, 'limit', p_limit, 'rows', rws, 'counts', coalesce(cnt, '{}'::jsonb));
end $$;
create or replace function public.hd3d_admin_refund(p_order_id bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := public.hd3d_reason(p_reason); o public.hd3d_orders%rowtype; n int; owned_n int;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if r is null then return jsonb_build_object('ok', false, 'reason', 'bad_reason'); end if;
  update public.hd3d_orders set status = 'refunded', refunded_at = now(), refund_note = r where id = p_order_id and status = 'approved' returning * into o;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_approved'); end if;
  delete from public.hd3d_owned where user_id = o.user_id and item = o.item; get diagnostics owned_n = row_count;
  update public.hd3d_mail set revoked = true where order_id = o.id and not claimed and not revoked; get diagnostics n = row_count;
  insert into public.hd3d_mail (user_id, title, body, reward, order_id)
    values (o.user_id, '환불 처리 안내', public.hd3d_item_name(o.item) || ' 구매가 환불 처리되어 영웅이 회수되었습니다. 사유: ' || r, null, o.id);
  perform public.hd3d_log('order_refund', o.user_id, jsonb_build_object('order', o.id, 'item', o.item, 'reason', r, 'owned_removed', owned_n, 'mail_revoked', n));
  return jsonb_build_object('ok', true, 'order', o.id, 'owned_removed', owned_n, 'mail_revoked', n);
end $$;

-- ---------- 7) 활동 기록 목록 ----------
create or replace function public.hd3d_admin_log_list(p_action text default null, p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a text := nullif(left(trim(coalesce(p_action, '')), 40), ''); tot bigint; rws jsonb;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  p_limit := least(greatest(coalesce(p_limit, 50), 1), 100); p_offset := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  select count(*) into tot from public.hd3d_admin_log l where a is null or l.action = a;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]'::jsonb) into rws
    from (select * from public.hd3d_admin_log l where a is null or l.action = a order by l.id desc limit p_limit offset p_offset) x;
  return jsonb_build_object('ok', true, 'total', tot, 'offset', p_offset, 'limit', p_limit, 'rows', rws);
end $$;

-- ---------- 8) 하위 관리자 (owner 만): 목록 · 추가 · 삭제. 하위 관리자는 관리자 관리만 못 함 ----------
create or replace function public.hd3d_owner_admins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.hd3d_is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'nickname', p.nickname, 'owner', a.owner, 'created_at', a.created_at) order by a.owner desc, a.created_at)
    from public.hd3d_admins a join auth.users u on u.id = a.user_id left join public.hd3d_profiles p on p.id = a.user_id), '[]'::jsonb));
end $$;
create or replace function public.hd3d_owner_add_admin(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; e text := lower(trim(coalesce(p_email, '')));
begin
  if not public.hd3d_is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(e) not between 3 and 254 then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  select u.id into uid from auth.users u where lower(u.email) = e limit 1;
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  if exists (select 1 from public.hd3d_bans b where b.user_id = uid) then return jsonb_build_object('ok', false, 'reason', 'target_banned'); end if;
  insert into public.hd3d_admins (user_id, owner, added_by) values (uid, false, auth.uid()) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  perform public.hd3d_log('admin_add', uid, null);
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.hd3d_owner_remove_admin(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; e text := lower(trim(coalesce(p_email, '')));
begin
  if not public.hd3d_is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select u.id into uid from auth.users u where lower(u.email) = e limit 1;
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  if exists (select 1 from public.hd3d_admins a where a.user_id = uid and a.owner) then return jsonb_build_object('ok', false, 'reason', 'owner'); end if;
  delete from public.hd3d_admins where user_id = uid and not owner;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  perform public.hd3d_log('admin_remove', uid, null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- privileges (2026-10-22) ----------
revoke all on public.hd3d_admin_log, public.hd3d_broadcasts, public.hd3d_notices from anon, authenticated;
grant select on public.hd3d_admin_log, public.hd3d_notices to authenticated; -- RLS: 기록은 관리자만, 공지는 게시 중인 것만(관리자는 전체)
-- 내부 함수: 클라이언트 실행 불가
revoke all on function public.hd3d_log(text, uuid, jsonb), public.hd3d_user_card(uuid), public.hd3d_recipients(), public.hd3d_progress_summary(jsonb), public.hd3d_jnum(jsonb), public.hd3d_jstars(jsonb), public.hd3d_like(text), public.hd3d_reason(text) from public, anon, authenticated;
-- RPC: 로그인 사용자만 호출 가능, 함수 안에서 관리자/owner 다시 검사
revoke all on function public.hd3d_my_status(), public.hd3d_admin_users(text, int, int), public.hd3d_admin_user(uuid), public.hd3d_admin_grant_hero(uuid, text, text), public.hd3d_admin_revoke_hero(uuid, text, text),
  public.hd3d_admin_broadcast_count(), public.hd3d_admin_broadcast(text, text, jsonb, int), public.hd3d_admin_notice_save(bigint, text, text, boolean, timestamptz, timestamptz), public.hd3d_admin_notice_active(bigint, boolean),
  public.hd3d_admin_ban(uuid, text), public.hd3d_admin_unban(uuid, text), public.hd3d_admin_orders(text, text, int, int), public.hd3d_admin_refund(bigint, text), public.hd3d_admin_log_list(text, int, int),
  public.hd3d_owner_admins(), public.hd3d_owner_add_admin(text), public.hd3d_owner_remove_admin(text) from public, anon;
grant execute on function public.hd3d_my_status(), public.hd3d_admin_users(text, int, int), public.hd3d_admin_user(uuid), public.hd3d_admin_grant_hero(uuid, text, text), public.hd3d_admin_revoke_hero(uuid, text, text),
  public.hd3d_admin_broadcast_count(), public.hd3d_admin_broadcast(text, text, jsonb, int), public.hd3d_admin_notice_save(bigint, text, text, boolean, timestamptz, timestamptz), public.hd3d_admin_notice_active(bigint, boolean),
  public.hd3d_admin_ban(uuid, text), public.hd3d_admin_unban(uuid, text), public.hd3d_admin_orders(text, text, int, int), public.hd3d_admin_refund(bigint, text), public.hd3d_admin_log_list(text, int, int),
  public.hd3d_owner_admins(), public.hd3d_owner_add_admin(text), public.hd3d_owner_remove_admin(text) to authenticated;

notify pgrst, 'reload schema';
