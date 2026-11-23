-- Reusable, account-scoped occasion/style preferences.
create table if not exists public.user_style_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 48),
  is_default boolean not null default false,
  preferred_categories text[] not null default '{}',
  preferred_colours text[] not null default '{}',
  formality text not null default 'Casual' check (formality in ('Relaxed','Casual','Smart','Formal')),
  excluded_item_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_style_profiles_user_name_unique unique(user_id, name)
);
create index if not exists user_style_profiles_user_idx on public.user_style_profiles(user_id);
create unique index if not exists user_style_profiles_one_default_idx on public.user_style_profiles(user_id) where is_default;
alter table public.user_style_profiles enable row level security;
revoke all on public.user_style_profiles from anon, authenticated;
grant select, insert, update, delete on public.user_style_profiles to authenticated;
drop policy if exists "Premium users manage own style profiles" on public.user_style_profiles;
create policy "Premium users manage own style profiles" on public.user_style_profiles
for all to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')
))
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')
));
