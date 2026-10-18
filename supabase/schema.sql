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
