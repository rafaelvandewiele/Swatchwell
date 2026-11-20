-- Explicit garment wear records used by Premium Wardrobe Insights.
-- A garment can be logged at most once per calendar day; all dates are supplied by the user.
create table if not exists public.user_garment_wear_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  worn_on date not null,
  created_at timestamptz not null default now(),
  constraint user_garment_wear_events_unique_day unique (user_id, item_id, worn_on)
);

create index if not exists user_garment_wear_events_user_date_idx
  on public.user_garment_wear_events (user_id, worn_on desc);

alter table public.user_garment_wear_events enable row level security;
revoke all on public.user_garment_wear_events from anon;
revoke all on public.user_garment_wear_events from authenticated;
grant select, insert, delete on public.user_garment_wear_events to authenticated;

drop policy if exists "Premium users read their own garment wear events" on public.user_garment_wear_events;
create policy "Premium users read their own garment wear events"
on public.user_garment_wear_events for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_premium or p.role = 'admin'))
);

drop policy if exists "Premium users add their own garment wear events" on public.user_garment_wear_events;
create policy "Premium users add their own garment wear events"
on public.user_garment_wear_events for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_premium or p.role = 'admin'))
);

drop policy if exists "Premium users delete their own garment wear events" on public.user_garment_wear_events;
create policy "Premium users delete their own garment wear events"
on public.user_garment_wear_events for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_premium or p.role = 'admin'))
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'user_garment_wear_events'
     ) then
    alter publication supabase_realtime add table public.user_garment_wear_events;
  end if;
end;
$$;
