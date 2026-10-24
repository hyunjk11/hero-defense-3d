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
  select case p_item when 'hero_gunner' then '{"hero":"gunner"}'::jsonb when 'hero_mechanic' then '{"hero":"mechanic"}'::jsonb when 'hero_fighter' then '{"hero":"fighter"}'::jsonb else null end;
$$;
create or replace function public.hd3d_item_name(p_item text) returns text
language sql immutable set search_path = '' as $$
  select case p_item when 'hero_gunner' then '유료 영웅 · 총사 로즈' when 'hero_mechanic' then '유료 영웅 · 메카닉 버들' when 'hero_fighter' then '유료 영웅 · 격투가 서윤' else p_item end;
$$;

-- ---------- hd3d_owned: 서버가 기록하는 소유권 (사용자는 읽기만) ----------
create table if not exists public.hd3d_owned (
  user_id uuid not null references auth.users (id) on delete cascade,
  item text not null check (item in ('hero_gunner', 'hero_mechanic', 'hero_fighter')),
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
  item text not null check (item in ('hero_gunner', 'hero_mechanic', 'hero_fighter')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
-- 판매 상품 목록 갱신 (이미 만들어진 테이블의 check 제약도 교체 → 이 파일을 다시 실행하면 새 상품이 반영됨. 2026-10-19: hero_mechanic 추가, 2026-10-22: hero_fighter(격투가 서윤) 추가)
alter table public.hd3d_owned drop constraint if exists hd3d_owned_item_check;
alter table public.hd3d_owned add constraint hd3d_owned_item_check check (item in ('hero_gunner', 'hero_mechanic', 'hero_fighter'));
alter table public.hd3d_orders drop constraint if exists hd3d_orders_item_check;
alter table public.hd3d_orders add constraint hd3d_orders_item_check check (item in ('hero_gunner', 'hero_mechanic', 'hero_fighter'));
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

-- 보상 아이템 1개 검증 (2026-10-22 아이템 지급). 장비 { k:'gear', s, h(무기만, 영웅 키), g 0~4, c? 챕터 세트 1~4 } 또는 고유 { k:'uq', u: 고유 키 }
-- 고유 키 목록은 src/data/items.js 의 UQ 와 같아야 함 (tests/admin.test.mjs 가 비교). 고유는 계정당 1개: 이미 있으면 받을 때 고유 정수 등으로 변환(클라이언트 grantUnique)
create or replace function public.hd3d_valid_item(x jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(x) = 'object' and case x ->> 'k'
    when 'gear' then not exists (select 1 from jsonb_object_keys(x) k where k not in ('k', 's', 'h', 'g', 'c'))
      and x ->> 's' in ('weapon', 'armor', 'acc')
      and jsonb_typeof(x -> 'g') = 'number' and x ->> 'g' in ('0', '1', '2', '3', '4')
      and case when x ->> 's' = 'weapon' then x ->> 'h' in ('archer', 'mage', 'warrior', 'gunner', 'mechanic', 'fighter') else not (x ? 'h') end
      and (not (x ? 'c') or (jsonb_typeof(x -> 'c') = 'number' and x ->> 'c' in ('1', '2', '3', '4')))
    when 'uq' then not exists (select 1 from jsonb_object_keys(x) k where k not in ('k', 'u'))
      and x ->> 'u' in ('f_bow', 'f_acc', 'f_arm', 's_staff', 's_arm', 's_acc', 'v_sword', 'v_acc', 'v_arm', 'r_guns', 'r_acc', 'r_arm', 'c_acc', 'c_arm', 'c_ring', 'd_fist')
    else false end, false);
$$;
-- 보상 검증: souls/steel/crystal 0~1,000,000 정수, essence(고유 정수 = 조각) 0~10,000, medals(던전 메달, 2026-10-23 — 받을 때 서버 지갑 hd3d_dungeon_wallet 에 더함) 0~10,000, hero 는 판매 영웅만, items 는 1~10개 (위 hd3d_valid_item)
create or replace function public.hd3d_valid_reward(r jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select r is null or (
    jsonb_typeof(r) = 'object'
    and not exists (select 1 from jsonb_object_keys(r) k where k not in ('souls', 'steel', 'crystal', 'hero', 'essence', 'items', 'medals'))
    and (not (r ? 'essence') or coalesce(case when (r ->> 'essence') ~ '^[0-9]{1,5}$' then (r ->> 'essence')::int <= 10000 else false end, false))
    and (not (r ? 'medals') or coalesce(case when jsonb_typeof(r -> 'medals') = 'number' and (r ->> 'medals') ~ '^[0-9]{1,5}$' then (r ->> 'medals')::int <= 10000 else false end, false))
    and (not (r ? 'items') or (jsonb_typeof(r -> 'items') = 'array' and jsonb_array_length(r -> 'items') between 1 and 10
         and not exists (select 1 from jsonb_array_elements(r -> 'items') x where not public.hd3d_valid_item(x))))
    and coalesce((r ->> 'souls') ~ '^[0-9]{1,7}$', true) and coalesce((r ->> 'souls')::bigint <= 1000000, true)
    and coalesce((r ->> 'steel') ~ '^[0-9]{1,7}$', true) and coalesce((r ->> 'steel')::bigint <= 1000000, true)
    and coalesce((r ->> 'crystal') ~ '^[0-9]{1,7}$', true) and coalesce((r ->> 'crystal')::bigint <= 1000000, true)
    and coalesce(r ->> 'hero' in ('gunner', 'mechanic', 'fighter'), true));
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
  -- 던전 메달(2026-10-23): 세이브가 아니라 서버 지갑에 (이 분기는 우편당 한 번만 실행됨)
  if coalesce((m.reward ->> 'medals')::int, 0) > 0 then
    insert into public.hd3d_dungeon_wallet (user_id, medals, earned) values (m.user_id, (m.reward ->> 'medals')::int, (m.reward ->> 'medals')::int)
      on conflict (user_id) do update set medals = least(1000000, public.hd3d_dungeon_wallet.medals + excluded.medals), earned = public.hd3d_dungeon_wallet.earned + excluded.earned, updated_at = now();
  end if;
  -- 고유 장비(2026-10-23): 받은 고유 키를 서버 지갑 uniques 에 기록 → 던전 고유(d_fist)는 계정당 1개 (드롭 중단 · 상점 '보유 중'). 지갑 테이블이 아직 없으면(첫 실행 중) 건너뜀
  if m.reward ? 'items' and to_regclass('public.hd3d_dungeon_wallet') is not null then
    insert into public.hd3d_dungeon_wallet (user_id, uniques)
      select m.user_id, coalesce(array_agg(distinct x ->> 'u'), '{}') from jsonb_array_elements(m.reward -> 'items') x where x ->> 'k' = 'uq'
      having count(*) > 0
      on conflict (user_id) do update set uniques = (select array(select distinct u from unnest(public.hd3d_dungeon_wallet.uniques || excluded.uniques) u order by u)), updated_at = now();
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
    'log', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (select * from public.hd3d_admin_log where target_user = p_user order by created_at desc limit 20) l), '[]'::jsonb),
    'dungeon', jsonb_build_object( -- 2026-10-23 던전 5단계: 메달 · 오늘(KST) 입장 수 · 전체 판 수
      'medals', coalesce((select w.medals from public.hd3d_dungeon_wallet w where w.user_id = p_user), 0),
      'earned', coalesce((select w.earned from public.hd3d_dungeon_wallet w where w.user_id = p_user), 0),
      'spent', coalesce((select w.spent from public.hd3d_dungeon_wallet w where w.user_id = p_user), 0),
      'today', (select count(*) from public.hd3d_dungeon_runs r where r.user_id = p_user and r.day = (now() at time zone 'Asia/Seoul')::date),
      'runs', (select count(*) from public.hd3d_dungeon_runs r where r.user_id = p_user),
      'uniques', coalesce((select to_jsonb(w.uniques) from public.hd3d_dungeon_wallet w where w.user_id = p_user), '[]'::jsonb),
      'uq_pity', coalesce((select w.uq_pity from public.hd3d_dungeon_wallet w where w.user_id = p_user), 0)),
    'spire', public.hd3d_admin_spire_card(p_user)); -- 2026-10-24 무한의 탑 T-9 (탑 절 실행 전이면 null)
end $$;

-- ---------- 2) 유료 영웅 지급 / 회수 (사유 필수) ----------
create or replace function public.hd3d_admin_grant_hero(p_user uuid, p_item text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := public.hd3d_reason(p_reason);
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_item is null or p_item not in ('hero_gunner', 'hero_mechanic', 'hero_fighter') then return jsonb_build_object('ok', false, 'reason', 'bad_item'); end if;
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
  if p_item is null or p_item not in ('hero_gunner', 'hero_mechanic', 'hero_fighter') then return jsonb_build_object('ok', false, 'reason', 'bad_item'); end if;
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

-- =====================================================================================================
-- 던전 메달 · 던전 상점 · 하루 3회 입장 (2026-10-23, 던전 5단계). 이 아래도 idempotent.
-- 저장 데이터(클라이언트 jsonb)는 믿지 않음: 메달 잔액은 hd3d_dungeon_wallet(사용자 쓰기 불가), 입장·완료·구매는 아래 SECURITY DEFINER 함수로만.
--   hd3d_dungeon_status()                      → 오늘(Asia/Seoul) 입장 수 · 남은 횟수 · 메달 · 칭호
--   hd3d_dungeon_start()                       → 하루 3회 확인 후 1회용 token (진행 중이던 이전 판은 포기 처리 = 그 입장은 소모)
--   hd3d_dungeon_finish(token, floors, win)    → token 당 한 번 · 층 0~5 · 시작 후 경과 시간(층당 20초)으로 층 수 상한 · 메달 = 층 × 2 + 완주 5 (서버 상수)
--   hd3d_dungeon_buy(item)                     → 서버 가격표(hd3d_dungeon_item)로 메달 차감 → 재료는 우편(hd3d_mail)으로, 칭호는 지갑에 기록
-- 관리자는 우편 보상 { "medals": n } (0~10,000)으로 메달 지급 → 받기(hd3d_claim_mail) 때 서버 지갑에 더해짐.
-- =====================================================================================================
create table if not exists public.hd3d_dungeon_wallet (
  user_id uuid primary key references auth.users (id) on delete cascade,
  medals int not null default 0 check (medals between 0 and 1000000),
  earned int not null default 0 check (earned >= 0),
  spent int not null default 0 check (spent >= 0),
  titles text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.hd3d_dungeon_wallet enable row level security;
drop policy if exists hd3d_dungeon_wallet_select on public.hd3d_dungeon_wallet;
create policy hd3d_dungeon_wallet_select on public.hd3d_dungeon_wallet for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));

create table if not exists public.hd3d_dungeon_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,                                     -- 입장한 날 (Asia/Seoul)
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'done', 'abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  floors int check (floors is null or floors between 0 and 5),
  win boolean,
  medals int not null default 0 check (medals between 0 and 100)
);
-- 2026-10-23 던전 고유(진서윤 '묘신 너클 호랑냥이' d_fist): 받은 고유 키 · 모르비아 드롭 천장 · 판별 드롭 기록
alter table public.hd3d_dungeon_wallet add column if not exists uniques text[] not null default '{}';
alter table public.hd3d_dungeon_wallet add column if not exists uq_pity int not null default 0 check (uq_pity between 0 and 1000);
alter table public.hd3d_dungeon_runs add column if not exists uq text;
create index if not exists hd3d_dungeon_runs_user_day on public.hd3d_dungeon_runs (user_id, day);
alter table public.hd3d_dungeon_runs enable row level security;
drop policy if exists hd3d_dungeon_runs_select on public.hd3d_dungeon_runs;
create policy hd3d_dungeon_runs_select on public.hd3d_dungeon_runs for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));

create table if not exists public.hd3d_dungeon_buys (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  item text not null check (char_length(item) between 1 and 40),
  price int not null check (price > 0),
  mail_id bigint,
  created_at timestamptz not null default now()
);
create index if not exists hd3d_dungeon_buys_user on public.hd3d_dungeon_buys (user_id, created_at desc);
alter table public.hd3d_dungeon_buys enable row level security;
drop policy if exists hd3d_dungeon_buys_select on public.hd3d_dungeon_buys;
create policy hd3d_dungeon_buys_select on public.hd3d_dungeon_buys for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));

-- 던전 상점 가격표 (서버 상수 — 클라이언트 src/data/dungeon.js DG_SHOP 은 표시용, tests/dungeon.test.mjs 가 같은지 비교)
create or replace function public.hd3d_dungeon_item(p_item text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_item
    when 'dg_steel'   then '{"price": 5,  "name": "강철 꾸러미",   "reward": {"steel": 40}}'::jsonb
    when 'dg_souls'   then '{"price": 6,  "name": "영혼석 주머니", "reward": {"souls": 400}}'::jsonb
    when 'dg_crystal' then '{"price": 8,  "name": "마력석 꾸러미", "reward": {"crystal": 10}}'::jsonb
    when 'dg_essence' then '{"price": 15, "name": "고유 정수",     "reward": {"essence": 3}}'::jsonb
    when 'dg_title'   then '{"price": 60, "name": "칭호 · 망령 사냥꾼", "title": "lich_hunter"}'::jsonb
    when 'dg_uq_fist' then '{"price": 450, "name": "묘신 너클 호랑냥이", "uq": "d_fist"}'::jsonb
    else null end;
$$;
-- 던전 고유 드롭 판정 (서버 상수 — 클라이언트 src/data/items.js UQ_DG 는 표시용, tests/dungeon.test.mjs 가 비교)
-- p_pity = 지금까지 드롭 없이 처치한 횟수, p_r = 0~1 난수. 5% 또는 이번이 40번째 처치(천장)면 드롭
create or replace function public.hd3d_dungeon_uq_roll(p_pity int, p_r double precision) returns boolean
language sql immutable set search_path = '' as $$ select coalesce(p_pity, 0) + 1 >= 40 or coalesce(p_r, 1) < 0.05; $$;
-- 오늘 (Asia/Seoul 날짜) — 하루 입장 수 초기화 기준 = 한국 시간 0시
create or replace function public.hd3d_kst_day() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Seoul')::date; $$;

create or replace function public.hd3d_dungeon_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_day date := public.hd3d_kst_day(); v_used int; w public.hd3d_dungeon_wallet%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select count(*) into v_used from public.hd3d_dungeon_runs r where r.user_id = v_me and r.day = v_day;
  select * into w from public.hd3d_dungeon_wallet x where x.user_id = v_me;
  return jsonb_build_object('ok', true, 'day', v_day, 'limit', 3, 'used', v_used, 'left', greatest(0, 3 - v_used),
    'medals', coalesce(w.medals, 0), 'titles', to_jsonb(coalesce(w.titles, '{}'::text[])), 'banned', public.hd3d_is_banned(),
    'uniques', to_jsonb(coalesce(w.uniques, '{}'::text[])), 'uq_pity', coalesce(w.uq_pity, 0));
end $$;

create or replace function public.hd3d_dungeon_start() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_day date := public.hd3d_kst_day(); v_used int; v_tok uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if public.hd3d_is_banned() then raise exception 'banned' using errcode = '42501', hint = 'banned'; end if;
  perform pg_advisory_xact_lock(hashtext('hd3d_dungeon:' || v_me::text)); -- 같은 계정 동시 호출 직렬화
  select count(*) into v_used from public.hd3d_dungeon_runs r where r.user_id = v_me and r.day = v_day;
  if v_used >= 3 then return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'limit', 3, 'used', v_used, 'left', 0); end if;
  -- 진행 중이던 판(새로고침·창 닫기 등)은 포기 처리 → 계정당 진행 중 판은 항상 1개
  update public.hd3d_dungeon_runs set status = 'abandoned', finished_at = now(), floors = 0, win = false where user_id = v_me and status = 'active';
  insert into public.hd3d_dungeon_runs (user_id, day) values (v_me, v_day) returning token into v_tok;
  return jsonb_build_object('ok', true, 'token', v_tok, 'limit', 3, 'used', v_used + 1, 'left', 3 - v_used - 1);
end $$;

create or replace function public.hd3d_dungeon_finish(p_token uuid, p_floors int, p_win boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); r public.hd3d_dungeon_runs%rowtype; v_sec numeric; v_fl int; v_win boolean; v_m int; v_tot int;
  w public.hd3d_dungeon_wallet%rowtype; v_uq text; v_mid bigint;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if public.hd3d_is_banned() then raise exception 'banned' using errcode = '42501', hint = 'banned'; end if;
  perform pg_advisory_xact_lock(hashtext('hd3d_dungeon:' || v_me::text));
  select * into r from public.hd3d_dungeon_runs x where x.token = p_token and x.user_id = v_me for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if r.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'used', 'status', r.status, 'medals', r.medals); end if; -- token 당 한 번
  v_sec := extract(epoch from now() - r.started_at);
  if v_sec > 3 * 3600 then
    update public.hd3d_dungeon_runs set status = 'abandoned', finished_at = now(), floors = 0, win = false where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  v_fl := least(greatest(coalesce(p_floors, 0), 0), 5);
  v_fl := least(v_fl, floor(v_sec / 20)::int);            -- 층당 최소 20초 (2배속 기준으로도 넉넉함) — 비정상적으로 빠른 완료는 층 수를 깎음
  v_win := coalesce(p_win, false) and v_fl = 5;
  v_m := v_fl * 2 + case when v_win then 5 else 0 end;    -- 메달 = 층당 2 + 완주(보스) 보너스 5 → 판당 최대 15, 하루 최대 45
  update public.hd3d_dungeon_runs set status = 'done', finished_at = now(), floors = v_fl, win = v_win, medals = v_m where id = r.id;
  insert into public.hd3d_dungeon_wallet (user_id, medals, earned) values (v_me, v_m, v_m)
    on conflict (user_id) do update set medals = least(1000000, public.hd3d_dungeon_wallet.medals + excluded.medals), earned = public.hd3d_dungeon_wallet.earned + excluded.earned, updated_at = now()
    returning * into w;
  v_tot := w.medals;
  -- 던전 고유 드롭 (2026-10-23): 모르비아 처치(완주) 때만 · 아직 없는 계정만 · 5% + 천장 40회 — 서버 random() (클라이언트 값 안 믿음). 배달 = 우편 items uq
  if v_win and not ('d_fist' = any(w.uniques)) then
    if public.hd3d_dungeon_uq_roll(w.uq_pity, random()) then
      v_uq := 'd_fist';
      insert into public.hd3d_mail (user_id, title, body, reward)
        values (v_me, '🐾 망령 여왕의 전리품', '모르비아를 쓰러뜨리고 진서윤 전용 고유 무기 「묘신 너클 호랑냥이」를 얻었습니다! ''받기''를 눌러 수령하세요.', '{"items": [{"k": "uq", "u": "d_fist"}]}'::jsonb) returning id into v_mid;
      update public.hd3d_dungeon_wallet set uniques = uniques || v_uq, uq_pity = 0, updated_at = now() where user_id = v_me returning * into w;
      update public.hd3d_dungeon_runs set uq = v_uq where id = r.id;
    else
      update public.hd3d_dungeon_wallet set uq_pity = least(1000, uq_pity + 1), updated_at = now() where user_id = v_me returning * into w;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'medals', v_m, 'total', v_tot, 'floors', v_fl, 'win', v_win, 'capped', v_fl < least(greatest(coalesce(p_floors, 0), 0), 5),
    'uq', v_uq, 'mail', v_mid, 'uq_pity', w.uq_pity, 'uniques', to_jsonb(w.uniques));
end $$;

create or replace function public.hd3d_dungeon_buy(p_item text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_it jsonb := public.hd3d_dungeon_item(p_item); v_price int; v_title text; v_uq text; w public.hd3d_dungeon_wallet%rowtype; v_mid bigint;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if public.hd3d_is_banned() then raise exception 'banned' using errcode = '42501', hint = 'banned'; end if;
  if v_it is null then return jsonb_build_object('ok', false, 'reason', 'bad_item'); end if;
  v_price := (v_it ->> 'price')::int; v_title := v_it ->> 'title'; v_uq := v_it ->> 'uq';
  perform pg_advisory_xact_lock(hashtext('hd3d_dungeon:' || v_me::text)); -- 정산(드롭)과 직렬화
  select * into w from public.hd3d_dungeon_wallet x where x.user_id = v_me for update;
  if v_title is not null and found and v_title = any(w.titles) then return jsonb_build_object('ok', false, 'reason', 'already', 'medals', w.medals); end if;
  if v_uq is not null and found and v_uq = any(w.uniques) then return jsonb_build_object('ok', false, 'reason', 'owned', 'medals', w.medals, 'uniques', to_jsonb(w.uniques)); end if; -- 고유 = 계정당 1개
  if not found or w.medals < v_price then return jsonb_build_object('ok', false, 'reason', 'not_enough', 'medals', coalesce(w.medals, 0), 'price', v_price); end if;
  update public.hd3d_dungeon_wallet set medals = medals - v_price, spent = spent + v_price,
    titles = case when v_title is null then titles else titles || v_title end,
    uniques = case when v_uq is null then uniques else uniques || v_uq end, updated_at = now() where user_id = v_me returning * into w;
  if v_uq is not null then
    insert into public.hd3d_mail (user_id, title, body, reward)
      values (v_me, '🏪 던전 상점 구매품', (v_it ->> 'name') || ' — 던전 메달 ' || v_price || '개로 구매했습니다. ''받기''를 눌러 수령하세요.', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('k', 'uq', 'u', v_uq)))) returning id into v_mid;
  elsif v_it ? 'reward' then
    insert into public.hd3d_mail (user_id, title, body, reward)
      values (v_me, '🏪 던전 상점 구매품', (v_it ->> 'name') || ' — 던전 메달 ' || v_price || '개로 구매했습니다. ''받기''를 눌러 수령하세요.', v_it -> 'reward') returning id into v_mid;
  end if;
  insert into public.hd3d_dungeon_buys (user_id, item, price, mail_id) values (v_me, p_item, v_price, v_mid);
  return jsonb_build_object('ok', true, 'item', p_item, 'price', v_price, 'medals', w.medals, 'mail', v_mid, 'titles', to_jsonb(w.titles), 'uniques', to_jsonb(w.uniques));
end $$;

-- ---------- privileges (2026-10-23) ----------
revoke all on public.hd3d_dungeon_wallet, public.hd3d_dungeon_runs, public.hd3d_dungeon_buys from anon, authenticated;
grant select on public.hd3d_dungeon_wallet, public.hd3d_dungeon_runs, public.hd3d_dungeon_buys to authenticated; -- RLS: 본인 것만 (관리자 전체), 쓰기는 위 함수로만
revoke all on function public.hd3d_dungeon_item(text), public.hd3d_kst_day(), public.hd3d_dungeon_uq_roll(int, double precision) from public, anon, authenticated;
revoke all on function public.hd3d_dungeon_status(), public.hd3d_dungeon_start(), public.hd3d_dungeon_finish(uuid, int, boolean), public.hd3d_dungeon_buy(text) from public, anon;
grant execute on function public.hd3d_dungeon_status(), public.hd3d_dungeon_start(), public.hd3d_dungeon_finish(uuid, int, boolean), public.hd3d_dungeon_buy(text) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================================================
-- 🗼 무한의 탑 (spire T-6, 2026-10-24). 이 아래도 idempotent. 화면 공개(SP_LIVE)는 클라이언트 T-10 — 이 절만 먼저 있어도 기존 게임엔 영향 없음.
-- 전투는 클라이언트라 "이기는 척"은 못 막음 → 서버는 시작층 · 경과 시간 하한 · 1회용 token · 하루 상한 · 보상 1회만 강제, 랭킹 보상은 칭호만 (docs/SPIRE_PLAN_2026-10-24.md 6장).
--   hd3d_spire_status()                    → 최고 층 · 체크포인트(시작 가능 층) · 이번 주 기록/순위 · 오늘 시작 수
--   hd3d_spire_start(from)                 → from = 1 또는 돌파한 보스층(5k ≤ best)+1 · 하루 30회 · 진행 중 판 포기 · 1회용 token
--   hd3d_spire_ping(token, floor)          → 보스층(5의 배수) 돌파 체크포인트 · 단조 증가 · 시간 하한 → 최고 기록 · 첫 돌파 보상(우편)
--   hd3d_spire_finish(token, top, summary) → token 당 한 번 · 경과 시간으로 층 수 상한(capped) · 한 도전 최대 +30층 · summary 는 관리자 참고용
--   hd3d_spire_rank(kind, week)            → 'week' | 'all' 상위 50 (정지 계정 제외, 동률은 서버 도달 시각 순) + 내 순위
-- 상수는 src/data/spire.js SP_SERVER · firstClear 와 같음 (tests/spire.test.mjs · tests/schema_pg.py 가 비교).
-- 주간 정산 받기(claim_week) · 주간 칭호 · 관리자 화면은 T-9 (스키마 2).
-- =====================================================================================================
create table if not exists public.hd3d_spire_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  day date not null,                                     -- 시작한 날 (Asia/Seoul) — 하루 상한
  week date not null,                                    -- 시작한 주 (KST 월요일) — 주간 기록
  from_floor int not null check (from_floor between 1 and 100000),
  top_floor int not null default 0 check (top_floor >= 0), -- 서버가 인정한 최고 돌파 층 (from_floor − 1 = 하나도 못 깸)
  status text not null default 'active' check (status in ('active', 'done', 'abandoned')),
  started_at timestamptz not null default now(),
  last_ping_at timestamptz,
  last_ping_floor int,
  finished_at timestamptz,
  capped boolean not null default false,
  summary jsonb check (summary is null or (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 4096)) -- 클라이언트 요약 (검증 아님, 관리자 참고)
);
create index if not exists hd3d_spire_runs_user_day on public.hd3d_spire_runs (user_id, day);
create index if not exists hd3d_spire_runs_active on public.hd3d_spire_runs (user_id) where status = 'active';
alter table public.hd3d_spire_runs enable row level security;
drop policy if exists hd3d_spire_runs_select on public.hd3d_spire_runs;
create policy hd3d_spire_runs_select on public.hd3d_spire_runs for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));

create table if not exists public.hd3d_spire_best (
  user_id uuid primary key references auth.users (id) on delete cascade,
  best_floor int not null default 0 check (best_floor >= 0),
  best_at timestamptz,                                   -- 서버가 기록한 도달 시각 (랭킹 동률 기준)
  cleared_bosses int not null default 0 check (cleared_bosses >= 0 and cleared_bosses % 5 = 0), -- 첫 돌파 보상을 받은 최고 보스층
  updated_at timestamptz not null default now()
);
create index if not exists hd3d_spire_best_rank on public.hd3d_spire_best (best_floor desc, best_at);
alter table public.hd3d_spire_best enable row level security;
drop policy if exists hd3d_spire_best_select on public.hd3d_spire_best;
create policy hd3d_spire_best_select on public.hd3d_spire_best for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));

create table if not exists public.hd3d_spire_weeks (
  user_id uuid not null references auth.users (id) on delete cascade,
  week date not null,
  best_floor int not null default 0 check (best_floor >= 0),
  best_at timestamptz,
  claimed boolean not null default false,                -- 주간 보상 받기 (T-9)
  primary key (user_id, week)
);
create index if not exists hd3d_spire_weeks_rank on public.hd3d_spire_weeks (week, best_floor desc, best_at);
alter table public.hd3d_spire_weeks enable row level security;
drop policy if exists hd3d_spire_weeks_select on public.hd3d_spire_weeks;
create policy hd3d_spire_weeks_select on public.hd3d_spire_weeks for select to authenticated using ((select auth.uid()) = user_id or (select public.hd3d_is_admin()));

-- 서버 상수 (src/data/spire.js SP_SERVER 와 같게 — tests/spire.test.mjs 가 이 줄을 읽어 비교)
create or replace function public.hd3d_spire_const() returns jsonb
language sql immutable set search_path = '' as $$
  select '{"dailyCap": 30, "maxPerRun": 30, "minNormal": 25, "minBoss": 40, "pingMinSec": 125, "expireH": 3}'::jsonb;
$$;
-- 이번 주 (Asia/Seoul 월요일 0시 기준)
create or replace function public.hd3d_kst_week() returns date
language sql stable set search_path = '' as $$ select date_trunc('week', (now() at time zone 'Asia/Seoul'))::date; $$;
-- from 층부터 top 층까지 돌파에 필요한 최소 시간(초) = 일반 25 · 보스층(5의 배수) 40 (클라이언트 minSecBetween 과 같음)
create or replace function public.hd3d_spire_minsec(p_from int, p_top int) returns int
language sql immutable set search_path = '' as $$
  select case when p_top < p_from then 0 else
    (public.hd3d_spire_const() ->> 'minNormal')::int * (p_top - p_from + 1)
    + ((public.hd3d_spire_const() ->> 'minBoss')::int - (public.hd3d_spire_const() ->> 'minNormal')::int) * (p_top / 5 - (p_from - 1) / 5) end;
$$;
-- 첫 돌파 보상 (클라이언트 firstClear 와 같음): 보스층 n=5k → 영혼석 300+100k (100층까지) · 10의 배수 메달 5+n/10 (100층까지, 이후 10) · 30층/50층 칭호
create or replace function public.hd3d_spire_first(p_n int) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_n < 5 or p_n % 5 <> 0 or (p_n > 100 and p_n % 10 <> 0) then null else jsonb_build_object('floor', p_n,
    'souls', case when p_n <= 100 then 300 + 100 * (p_n / 5) else 0 end,
    'medals', case when p_n % 10 <> 0 then 0 when p_n <= 100 then 5 + p_n / 10 else 10 end,
    'title', case p_n when 30 then 'spire_30' when 50 then 'spire_50' else null end) end;
$$;

-- 내부: 인정된 최고 층 p_top 을 판 · 최고 기록 · 주간 기록에 반영하고 새로 돌파한 보스층 첫 돌파 보상을 우편으로 (호출자가 잠금·검사 끝낸 뒤에만)
create or replace function public.hd3d_spire_record(p_uid uuid, p_run bigint, p_top int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.hd3d_spire_runs%rowtype; b public.hd3d_spire_best%rowtype; v_prev int; v_new boolean := false; v_wk int;
  v_souls int := 0; v_med int := 0; v_titles text[] := '{}'; v_floors int[] := '{}'; v_mid bigint; x jsonb; n int;
begin
  select * into r from public.hd3d_spire_runs where id = p_run and user_id = p_uid;
  update public.hd3d_spire_runs set top_floor = greatest(top_floor, p_top) where id = r.id;
  insert into public.hd3d_spire_best (user_id) values (p_uid) on conflict (user_id) do nothing;
  select * into b from public.hd3d_spire_best where user_id = p_uid for update;
  if p_top > b.best_floor then
    update public.hd3d_spire_best set best_floor = p_top, best_at = now(), updated_at = now() where user_id = p_uid returning * into b; v_new := true;
  end if;
  -- 주간 기록: 이 판에서 실제로 하나 이상 돌파했을 때만 (체크포인트 시작만 하고 못 깬 판은 기록 없음)
  if p_top >= r.from_floor then
    insert into public.hd3d_spire_weeks (user_id, week, best_floor, best_at) values (p_uid, r.week, p_top, now())
      on conflict (user_id, week) do update set best_floor = excluded.best_floor, best_at = excluded.best_at where public.hd3d_spire_weeks.best_floor < excluded.best_floor;
  end if;
  select best_floor into v_wk from public.hd3d_spire_weeks where user_id = p_uid and week = r.week;
  -- 첫 돌파 보상: cleared_bosses 보다 높은 보스층만 (계정당 한 번)
  v_prev := b.cleared_bosses;
  if p_top >= v_prev + 5 then
    n := v_prev + 5;
    while n <= p_top loop
      x := public.hd3d_spire_first(n);
      if x is not null then
        v_souls := v_souls + (x ->> 'souls')::int; v_med := v_med + (x ->> 'medals')::int; v_floors := v_floors || n;
        if x ->> 'title' is not null then v_titles := v_titles || (x ->> 'title'); end if;
      end if;
      n := n + 5;
    end loop;
    update public.hd3d_spire_best set cleared_bosses = (p_top / 5) * 5, updated_at = now() where user_id = p_uid;
    if v_souls > 0 or v_med > 0 then
      insert into public.hd3d_mail (user_id, title, body, reward)
        values (p_uid, '🗼 무한의 탑 첫 돌파', left('무한의 탑 ' || array_to_string(v_floors, '·') || '층을 처음 돌파했습니다! ''받기''를 눌러 보상을 받으세요.', 1000),
          jsonb_strip_nulls(jsonb_build_object('souls', nullif(v_souls, 0), 'medals', nullif(v_med, 0)))) returning id into v_mid;
    end if;
    if cardinality(v_titles) > 0 then
      insert into public.hd3d_dungeon_wallet (user_id, titles) values (p_uid, v_titles)
        on conflict (user_id) do update set titles = (select coalesce(array_agg(distinct t), '{}') from unnest(public.hd3d_dungeon_wallet.titles || excluded.titles) t), updated_at = now();
    end if;
  end if;
  return jsonb_build_object('top', greatest(r.top_floor, p_top), 'best', b.best_floor, 'new_best', v_new, 'week_best', coalesce(v_wk, 0),
    'reward', jsonb_build_object('floors', to_jsonb(v_floors), 'souls', v_souls, 'medals', v_med, 'titles', to_jsonb(v_titles), 'mail', v_mid));
end $$;

-- 주간 순위 (정지 계정 제외 · 층 ↓ · 서버 도달 시각 ↑) — 내부용
create or replace function public.hd3d_spire_week_rank(p_uid uuid, p_week date) returns int
language sql stable security definer set search_path = '' as $$
  select case when w.best_floor > 0 then 1 + (select count(*)::int from public.hd3d_spire_weeks o where o.week = p_week and o.best_floor > 0
      and not exists (select 1 from public.hd3d_bans x where x.user_id = o.user_id)
      and (o.best_floor > w.best_floor or (o.best_floor = w.best_floor and (o.best_at, o.user_id) < (w.best_at, w.user_id)))) end
  from public.hd3d_spire_weeks w where w.user_id = p_uid and w.week = p_week;
$$;

-- hd3d_spire_status() 는 아래 T-9 절 (unclaimed · titles 추가판)

create or replace function public.hd3d_spire_start(p_from int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_day date := public.hd3d_kst_day(); c jsonb := public.hd3d_spire_const(); v_used int; v_best int; v_tok uuid; v_from int := coalesce(p_from, 0);
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if public.hd3d_is_banned() then raise exception 'banned' using errcode = '42501', hint = 'banned'; end if;
  perform pg_advisory_xact_lock(hashtext('hd3d_spire:' || v_me::text)); -- 같은 계정 동시 호출 직렬화
  select coalesce((select best_floor from public.hd3d_spire_best x where x.user_id = v_me), 0) into v_best;
  -- 시작층 위조 방지: 1 또는 서버가 아는 최고 기록 안의 체크포인트(5k+1, 5k ≤ best)만
  if not (v_from = 1 or (v_from > 1 and v_from % 5 = 1 and v_from - 1 <= v_best)) then
    return jsonb_build_object('ok', false, 'reason', 'bad_from', 'best', v_best);
  end if;
  select count(*) into v_used from public.hd3d_spire_runs r where r.user_id = v_me and r.day = v_day;
  if v_used >= (c ->> 'dailyCap')::int then return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'limit', (c ->> 'dailyCap')::int, 'used', v_used, 'left', 0); end if;
  -- 진행 중이던 판은 포기 (그때까지 ping 으로 인정된 기록·보상은 이미 저장됨)
  update public.hd3d_spire_runs set status = 'abandoned', finished_at = now() where user_id = v_me and status = 'active';
  insert into public.hd3d_spire_runs (user_id, day, week, from_floor, top_floor) values (v_me, v_day, public.hd3d_kst_week(), v_from, v_from - 1) returning token into v_tok;
  return jsonb_build_object('ok', true, 'token', v_tok, 'from', v_from, 'best', v_best, 'limit', (c ->> 'dailyCap')::int, 'used', v_used + 1, 'left', (c ->> 'dailyCap')::int - v_used - 1);
end $$;

create or replace function public.hd3d_spire_ping(p_token uuid, p_floor int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); c jsonb := public.hd3d_spire_const(); r public.hd3d_spire_runs%rowtype; v_sec numeric; v_since numeric; v_last int; v_fl int := coalesce(p_floor, 0); v_rec jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if public.hd3d_is_banned() then raise exception 'banned' using errcode = '42501', hint = 'banned'; end if;
  perform pg_advisory_xact_lock(hashtext('hd3d_spire:' || v_me::text));
  select * into r from public.hd3d_spire_runs x where x.token = p_token and x.user_id = v_me for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if r.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'used', 'status', r.status); end if;
  v_sec := extract(epoch from now() - r.started_at);
  if v_sec > (c ->> 'expireH')::int * 3600 then
    update public.hd3d_spire_runs set status = 'abandoned', finished_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  v_last := coalesce(r.last_ping_floor, r.from_floor - 1);
  -- 보스층(5의 배수)만 · 단조 증가 · 한 도전 최대 +30층
  if v_fl % 5 <> 0 or v_fl <= v_last or v_fl > r.from_floor - 1 + (c ->> 'maxPerRun')::int then
    return jsonb_build_object('ok', false, 'reason', 'bad_floor', 'last', v_last);
  end if;
  -- 시간 하한: 시작부터 층 합(일반 25 · 보스 40초) · 직전 체크포인트부터 5층마다 125초
  v_since := extract(epoch from now() - coalesce(r.last_ping_at, r.started_at));
  if v_sec < public.hd3d_spire_minsec(r.from_floor, v_fl) or v_since < (c ->> 'pingMinSec')::int * ((v_fl - v_last) / 5) then
    return jsonb_build_object('ok', false, 'reason', 'too_fast', 'last', v_last);
  end if;
  update public.hd3d_spire_runs set last_ping_at = now(), last_ping_floor = v_fl where id = r.id;
  v_rec := public.hd3d_spire_record(v_me, r.id, v_fl);
  return jsonb_build_object('ok', true, 'floor', v_fl) || v_rec;
end $$;

create or replace function public.hd3d_spire_finish(p_token uuid, p_top int, p_summary jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); c jsonb := public.hd3d_spire_const(); r public.hd3d_spire_runs%rowtype; v_sec numeric; v_req int; v_want int; v_top int; v_ok int; n int; v_rec jsonb; v_sum jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if public.hd3d_is_banned() then raise exception 'banned' using errcode = '42501', hint = 'banned'; end if;
  perform pg_advisory_xact_lock(hashtext('hd3d_spire:' || v_me::text));
  select * into r from public.hd3d_spire_runs x where x.token = p_token and x.user_id = v_me for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if r.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'used', 'status', r.status, 'top', r.top_floor); end if; -- token 당 한 번
  v_sec := extract(epoch from now() - r.started_at);
  if v_sec > (c ->> 'expireH')::int * 3600 then
    update public.hd3d_spire_runs set status = 'abandoned', finished_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'expired', 'top', r.top_floor);
  end if;
  v_req := greatest(coalesce(p_top, 0), r.from_floor - 1);
  v_want := least(v_req, r.from_floor - 1 + (c ->> 'maxPerRun')::int);
  -- 경과 시간으로 인정되는 최고 층 (클라이언트 capTop 과 같음 · capped = 요청보다 깎임) — 이미 ping 으로 인정된 층 아래로는 안 내려감
  v_ok := r.from_floor - 1; n := r.from_floor;
  while n <= v_want and public.hd3d_spire_minsec(r.from_floor, n) <= v_sec loop v_ok := n; n := n + 1; end loop;
  v_top := greatest(v_ok, r.top_floor);
  v_sum := case when p_summary is not null and jsonb_typeof(p_summary) = 'object' and pg_column_size(p_summary) <= 4096 then p_summary else null end;
  update public.hd3d_spire_runs set status = 'done', finished_at = now(), capped = v_top < v_req, summary = v_sum where id = r.id;
  v_rec := public.hd3d_spire_record(v_me, r.id, v_top);
  return jsonb_build_object('ok', true, 'capped', v_top < v_req, 'from', r.from_floor) || v_rec;
end $$;

create or replace function public.hd3d_spire_rank(p_kind text default 'week', p_week date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_week date := coalesce(p_week, public.hd3d_kst_week()); v_top jsonb; v_mine jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('week', 'all') then return jsonb_build_object('ok', false, 'reason', 'bad_kind'); end if;
  with s as (
    select q.user_id, q.floor, q.at from (
      select w.user_id, w.best_floor as floor, w.best_at as at from public.hd3d_spire_weeks w where p_kind = 'week' and w.week = v_week and w.best_floor > 0
      union all
      select b.user_id, b.best_floor, b.best_at from public.hd3d_spire_best b where p_kind = 'all' and b.best_floor > 0) q
    where not exists (select 1 from public.hd3d_bans x where x.user_id = q.user_id)),
  o as (select s.*, row_number() over (order by s.floor desc, s.at asc nulls last, s.user_id) as rk from s)
  select coalesce(jsonb_agg(jsonb_build_object('rank', o.rk, 'nick', coalesce(p.nickname, '용사'), 'floor', o.floor, 'at', o.at, 'me', o.user_id = v_me) order by o.rk) filter (where o.rk <= 50), '[]'::jsonb),
    (select jsonb_build_object('rank', m.rk, 'floor', m.floor) from o m where m.user_id = v_me)
    into v_top, v_mine
  from o left join public.hd3d_profiles p on p.id = o.user_id;
  return jsonb_build_object('ok', true, 'kind', p_kind, 'week', case when p_kind = 'week' then v_week end, 'top', coalesce(v_top, '[]'::jsonb), 'me', v_mine);
end $$;

-- =====================================================================================================
-- 🗼 무한의 탑 T-9 ⚠ 스키마 2 (2026-10-24): 주간 정산 · 주간 칭호 · 관리자 이상 기록 화면. 이 절도 idempotent.
--   hd3d_spire_claim_week(week)      → 끝난 주(KST 월요일 키)만 · 주당 한 번 · 영혼석 min(1500, W×30) + 메달 min(25, ⌊W/5⌋×2) 우편
--                                      지난주(= 이번 주 − 7일) 정산 때만 주간 칭호 교체: 1위 spire_w1 · 2~10위 spire_w10 · 그 밖 = 주간 칭호 제거
--   hd3d_spire_status() 에 unclaimed(받지 않은 지난 주 최대 8개) · titles(지갑의 탑 칭호) 추가
--   관리자: hd3d_admin_spire(days, limit) 이상 기록 목록 · hd3d_admin_spire_reset(user, reason) 기록 초기화(첫 돌파 보상 기준 cleared 는 유지 = 보상 재수령 불가) · hd3d_admin_user 에 spire 요약
-- 주간 보상 공식은 src/data/spire.js weekReward 와 같음 (tests/schema_pg.py 가 비교).
-- =====================================================================================================
create or replace function public.hd3d_spire_week_reward(p_best int) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('souls', least(1500, greatest(0, coalesce(p_best, 0)) * 30), 'medals', least(25, (greatest(0, coalesce(p_best, 0)) / 5) * 2));
$$;
create or replace function public.hd3d_spire_week_title(p_rank int) returns text
language sql immutable set search_path = '' as $$
  select case when p_rank = 1 then 'spire_w1' when p_rank between 2 and 10 then 'spire_w10' end;
$$;

create or replace function public.hd3d_spire_claim_week(p_week date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_cur date := public.hd3d_kst_week(); v_week date := coalesce(p_week, public.hd3d_kst_week() - 7);
  w public.hd3d_spire_weeks%rowtype; v_rank int; rw jsonb; v_title text; v_mid bigint; v_last boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if public.hd3d_is_banned() then raise exception 'banned' using errcode = '42501', hint = 'banned'; end if;
  if extract(isodow from v_week) <> 1 then return jsonb_build_object('ok', false, 'reason', 'bad_week'); end if;
  if v_week >= v_cur then return jsonb_build_object('ok', false, 'reason', 'not_ended', 'week', v_week); end if;
  perform pg_advisory_xact_lock(hashtext('hd3d_spire:' || v_me::text));
  select * into w from public.hd3d_spire_weeks x where x.user_id = v_me and x.week = v_week for update;
  if not found or w.best_floor <= 0 then return jsonb_build_object('ok', false, 'reason', 'no_record', 'week', v_week); end if;
  if w.claimed then return jsonb_build_object('ok', false, 'reason', 'claimed', 'week', v_week); end if;
  v_rank := public.hd3d_spire_week_rank(v_me, v_week);
  rw := public.hd3d_spire_week_reward(w.best_floor);
  v_last := v_week = v_cur - 7;
  v_title := case when v_last then public.hd3d_spire_week_title(v_rank) end;
  update public.hd3d_spire_weeks set claimed = true where user_id = v_me and week = v_week;
  if (rw ->> 'souls')::int > 0 or (rw ->> 'medals')::int > 0 then
    insert into public.hd3d_mail (user_id, title, body, reward)
      values (v_me, '🗼 무한의 탑 주간 보상', left(to_char(v_week, 'YYYY-MM-DD') || ' 주 최고 ' || w.best_floor || '층 (주간 ' || coalesce(v_rank::text, '-') || '위) 보상입니다. ''받기''를 눌러 받으세요.', 1000),
        jsonb_strip_nulls(jsonb_build_object('souls', nullif((rw ->> 'souls')::int, 0), 'medals', nullif((rw ->> 'medals')::int, 0)))) returning id into v_mid;
  end if;
  -- 주간 칭호: 지난주 정산일 때만 교체 (더 오래된 주를 늦게 받으면 보상만)
  if v_last then
    insert into public.hd3d_dungeon_wallet (user_id, titles) values (v_me, case when v_title is null then '{}'::text[] else array[v_title] end)
      on conflict (user_id) do update set titles = (select coalesce(array_agg(distinct t order by t), '{}') from unnest(
        array_remove(array_remove(public.hd3d_dungeon_wallet.titles, 'spire_w1'), 'spire_w10') || excluded.titles) t), updated_at = now();
  end if;
  return jsonb_build_object('ok', true, 'week', v_week, 'best', w.best_floor, 'rank', v_rank, 'souls', (rw ->> 'souls')::int, 'medals', (rw ->> 'medals')::int, 'title', v_title, 'mail', v_mid);
end $$;

-- 상태 (T-6 판 + unclaimed · titles)
create or replace function public.hd3d_spire_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_day date := public.hd3d_kst_day(); v_week date := public.hd3d_kst_week(); c jsonb := public.hd3d_spire_const();
  v_used int; b public.hd3d_spire_best%rowtype; v_wk int; v_cp int[];
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select count(*) into v_used from public.hd3d_spire_runs r where r.user_id = v_me and r.day = v_day;
  select * into b from public.hd3d_spire_best x where x.user_id = v_me;
  select best_floor into v_wk from public.hd3d_spire_weeks w where w.user_id = v_me and w.week = v_week;
  select array_agg(g) into v_cp from (select 1 as g union all select k + 1 from generate_series(5, coalesce(b.best_floor, 0), 5) k) s;
  return jsonb_build_object('ok', true, 'day', v_day, 'week', v_week, 'limit', (c ->> 'dailyCap')::int, 'used', v_used, 'left', greatest(0, (c ->> 'dailyCap')::int - v_used),
    'best', coalesce(b.best_floor, 0), 'best_at', b.best_at, 'cleared', coalesce(b.cleared_bosses, 0), 'checkpoints', to_jsonb(v_cp),
    'week_best', coalesce(v_wk, 0), 'week_rank', public.hd3d_spire_week_rank(v_me, v_week), 'banned', public.hd3d_is_banned(),
    'active', exists (select 1 from public.hd3d_spire_runs r where r.user_id = v_me and r.status = 'active'),
    'unclaimed', coalesce((select jsonb_agg(jsonb_build_object('week', u.week, 'best', u.best_floor, 'rank', public.hd3d_spire_week_rank(v_me, u.week),
        'title', case when u.week = v_week - 7 then public.hd3d_spire_week_title(public.hd3d_spire_week_rank(v_me, u.week)) end) || public.hd3d_spire_week_reward(u.best_floor) order by u.week desc)
      from (select * from public.hd3d_spire_weeks w where w.user_id = v_me and w.week < v_week and not w.claimed and w.best_floor > 0 order by w.week desc limit 8) u), '[]'::jsonb),
    'titles', coalesce((select to_jsonb(array(select t from unnest(x.titles) t where t like 'spire\_%' order by t)) from public.hd3d_dungeon_wallet x where x.user_id = v_me), '[]'::jsonb));
end $$;

-- 관리자: 이상 기록 (최근 p_days 일, 깃발 있는 판만) — fast: 경과 시간이 최소 시간의 1.25배 미만 · capped: 서버가 층을 깎음 · day50: 그날 +50층 넘게
create or replace function public.hd3d_admin_spire(p_days int default 7, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb; v_days int := least(60, greatest(1, coalesce(p_days, 7))); v_lim int := least(200, greatest(1, coalesce(p_limit, 50)));
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  with r as (
    select x.*, extract(epoch from (coalesce(x.finished_at, x.last_ping_at, now()) - x.started_at))::int as sec,
      public.hd3d_spire_minsec(x.from_floor, x.top_floor) as need,
      sum(greatest(0, x.top_floor - x.from_floor + 1)) over (partition by x.user_id, x.day) as day_gain
    from public.hd3d_spire_runs x where x.started_at > now() - make_interval(days => v_days) and x.top_floor >= x.from_floor),
  f as (
    select r.*, array_remove(array[case when r.sec < r.need * 1.25 then 'fast' end, case when r.capped then 'capped' end, case when r.day_gain > 50 then 'day50' end], null) as flags from r)
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'user_id', f.user_id, 'nick', coalesce(p.nickname, '용사'), 'email', u.email,
      'from', f.from_floor, 'top', f.top_floor, 'status', f.status, 'sec', f.sec, 'need', f.need, 'day_gain', f.day_gain, 'flags', to_jsonb(f.flags),
      'best', coalesce(b.best_floor, 0), 'banned', exists (select 1 from public.hd3d_bans z where z.user_id = f.user_id),
      'at', coalesce(f.finished_at, f.started_at), 'summary', f.summary) order by coalesce(f.finished_at, f.started_at) desc), '[]'::jsonb) into v_rows
  from (select * from f where cardinality(f.flags) > 0 order by coalesce(f.finished_at, f.started_at) desc limit v_lim) f
    left join public.hd3d_profiles p on p.id = f.user_id left join auth.users u on u.id = f.user_id left join public.hd3d_spire_best b on b.user_id = f.user_id;
  return jsonb_build_object('ok', true, 'days', v_days, 'rows', v_rows);
end $$;

-- 관리자: 탑 기록 초기화 (최고 층 0 · 이번 주 기록 삭제 · 진행 중 판 포기). cleared_bosses 는 그대로 → 첫 돌파 보상 다시 못 받음
create or replace function public.hd3d_admin_spire_reset(p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := public.hd3d_reason(p_reason); v_prev int; v_wk int;
begin
  if not public.hd3d_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if r is null then return jsonb_build_object('ok', false, 'reason', 'bad_reason'); end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  perform pg_advisory_xact_lock(hashtext('hd3d_spire:' || p_user::text));
  select best_floor into v_prev from public.hd3d_spire_best where user_id = p_user;
  select best_floor into v_wk from public.hd3d_spire_weeks where user_id = p_user and week = public.hd3d_kst_week();
  update public.hd3d_spire_best set best_floor = 0, best_at = null, updated_at = now() where user_id = p_user;
  delete from public.hd3d_spire_weeks where user_id = p_user and week = public.hd3d_kst_week();
  update public.hd3d_spire_runs set status = 'abandoned', finished_at = now() where user_id = p_user and status = 'active';
  perform public.hd3d_log('spire_reset', p_user, jsonb_build_object('reason', r, 'best', coalesce(v_prev, 0), 'week_best', coalesce(v_wk, 0)));
  return jsonb_build_object('ok', true, 'prev', coalesce(v_prev, 0), 'week_prev', coalesce(v_wk, 0));
end $$;

-- 관리자 유저 상세용 탑 요약 (hd3d_admin_user 가 부름 · 탑 테이블이 없으면 null)
create or replace function public.hd3d_admin_spire_card(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if to_regclass('public.hd3d_spire_runs') is null then return null; end if;
  return jsonb_build_object(
    'best', coalesce((select b.best_floor from public.hd3d_spire_best b where b.user_id = p_user), 0),
    'cleared', coalesce((select b.cleared_bosses from public.hd3d_spire_best b where b.user_id = p_user), 0),
    'week_best', coalesce((select w.best_floor from public.hd3d_spire_weeks w where w.user_id = p_user and w.week = public.hd3d_kst_week()), 0),
    'today', (select count(*) from public.hd3d_spire_runs r where r.user_id = p_user and r.day = public.hd3d_kst_day()),
    'runs', (select count(*) from public.hd3d_spire_runs r where r.user_id = p_user),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('from', r.from_floor, 'top', r.top_floor, 'status', r.status, 'capped', r.capped,
        'sec', extract(epoch from (coalesce(r.finished_at, r.last_ping_at, now()) - r.started_at))::int, 'need', public.hd3d_spire_minsec(r.from_floor, r.top_floor), 'at', r.started_at) order by r.started_at desc)
      from (select * from public.hd3d_spire_runs x where x.user_id = p_user order by x.started_at desc limit 10) r), '[]'::jsonb));
end $$;

-- ---------- privileges (spire T-6) ----------
revoke all on public.hd3d_spire_runs, public.hd3d_spire_best, public.hd3d_spire_weeks from anon, authenticated;
grant select on public.hd3d_spire_runs, public.hd3d_spire_best, public.hd3d_spire_weeks to authenticated; -- RLS: 본인 것만 (관리자 전체), 쓰기는 위 함수로만
revoke all on function public.hd3d_spire_const(), public.hd3d_kst_week(), public.hd3d_spire_minsec(int, int), public.hd3d_spire_first(int),
  public.hd3d_spire_record(uuid, bigint, int), public.hd3d_spire_week_rank(uuid, date) from public, anon, authenticated;
revoke all on function public.hd3d_spire_status(), public.hd3d_spire_start(int), public.hd3d_spire_ping(uuid, int), public.hd3d_spire_finish(uuid, int, jsonb), public.hd3d_spire_rank(text, date) from public, anon;
grant execute on function public.hd3d_spire_status(), public.hd3d_spire_start(int), public.hd3d_spire_ping(uuid, int), public.hd3d_spire_finish(uuid, int, jsonb), public.hd3d_spire_rank(text, date) to authenticated;

-- ---------- privileges (spire T-9) ----------
revoke all on function public.hd3d_spire_week_reward(int), public.hd3d_spire_week_title(int), public.hd3d_admin_spire_card(uuid) from public, anon, authenticated;
revoke all on function public.hd3d_spire_claim_week(date), public.hd3d_admin_spire(int, int), public.hd3d_admin_spire_reset(uuid, text) from public, anon;
grant execute on function public.hd3d_spire_claim_week(date), public.hd3d_admin_spire(int, int), public.hd3d_admin_spire_reset(uuid, text) to authenticated; -- 관리자 함수는 안에서 hd3d_is_admin 확인

notify pgrst, 'reload schema';
