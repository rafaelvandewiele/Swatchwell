-- Outfit-level wear history and user-controlled garment availability.
create table if not exists public.user_outfit_wear_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_ids text[] not null,
  outfit_name text,
  worn_on date not null,
  created_at timestamptz not null default now(),
  constraint user_outfit_wear_events_items_nonempty check (cardinality(item_ids) > 0)
);
create index if not exists user_outfit_wear_events_user_date_idx
  on public.user_outfit_wear_events(user_id, worn_on desc);
alter table public.user_outfit_wear_events enable row level security;
revoke all on public.user_outfit_wear_events from anon, authenticated;
grant select, insert, update, delete on public.user_outfit_wear_events to authenticated;
drop policy if exists "Premium users manage own outfit wear history" on public.user_outfit_wear_events;
create policy "Premium users manage own outfit wear history" on public.user_outfit_wear_events
for all to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')))
with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')));
create table if not exists public.user_garment_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  status text not null default 'available' check (status in ('available','laundry','unavailable','repair')),
  updated_at timestamptz not null default now(),
  constraint user_garment_statuses_user_item_unique unique(user_id,item_id)
);
create index if not exists user_garment_statuses_user_idx on public.user_garment_statuses(user_id);
alter table public.user_garment_statuses enable row level security;
revoke all on public.user_garment_statuses from anon, authenticated;
grant select, insert, update, delete on public.user_garment_statuses to authenticated;
drop policy if exists "Premium users manage own garment statuses" on public.user_garment_statuses;
create policy "Premium users manage own garment statuses" on public.user_garment_statuses
for all to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')))
with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')));
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_outfit_wear_events') then alter publication supabase_realtime add table public.user_outfit_wear_events; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_garment_statuses') then alter publication supabase_realtime add table public.user_garment_statuses; end if;
 end if;
end $$;

create table if not exists public.user_outfit_rotation_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 repeat_days integer not null default 7 check (repeat_days in (0,7,14,30)),
 updated_at timestamptz not null default now()
);
alter table public.user_outfit_rotation_settings enable row level security;
revoke all on public.user_outfit_rotation_settings from anon, authenticated;
grant select, insert, update on public.user_outfit_rotation_settings to authenticated;
drop policy if exists "Premium users manage own rotation settings" on public.user_outfit_rotation_settings;
create policy "Premium users manage own rotation settings" on public.user_outfit_rotation_settings for all to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')))
with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')));
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_outfit_rotation_settings') then alter publication supabase_realtime add table public.user_outfit_rotation_settings; end if;
end $$;

-- Idempotent migration: safe to apply once through the Supabase SQL Editor.
