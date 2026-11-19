-- Premium weekly outfit plans, synchronized across the user's devices.
create table if not exists public.user_weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  days jsonb not null default '[]'::jsonb,
  repeat_avoidance_weeks smallint not null default 4 check (repeat_avoidance_weeks in (0, 2, 4)),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_weekly_plans_unique_week unique (user_id, week_start),
  constraint user_weekly_plans_days_array check (jsonb_typeof(days) = 'array'),
  constraint user_weekly_plans_seven_days check (jsonb_array_length(days) = 7),
  constraint user_weekly_plans_monday_start check (extract(isodow from week_start) = 1)
);

alter table public.user_weekly_plans enable row level security;

revoke all on public.user_weekly_plans from anon;
revoke all on public.user_weekly_plans from authenticated;
grant select, insert, update, delete on public.user_weekly_plans to authenticated;

drop policy if exists "Premium users can read their weekly plans" on public.user_weekly_plans;
create policy "Premium users can read their weekly plans"
on public.user_weekly_plans
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.is_premium or p.role = 'admin')
  )
);

drop policy if exists "Premium users can create their weekly plans" on public.user_weekly_plans;
create policy "Premium users can create their weekly plans"
on public.user_weekly_plans
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.is_premium or p.role = 'admin')
  )
);

drop policy if exists "Premium users can update their weekly plans" on public.user_weekly_plans;
create policy "Premium users can update their weekly plans"
on public.user_weekly_plans
for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.is_premium or p.role = 'admin')
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.is_premium or p.role = 'admin')
  )
);

drop policy if exists "Premium users can delete their weekly plans" on public.user_weekly_plans;
create policy "Premium users can delete their weekly plans"
on public.user_weekly_plans
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.is_premium or p.role = 'admin')
  )
);

-- Enable cross-device live updates where Supabase Realtime is configured.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'user_weekly_plans'
     ) then
    alter publication supabase_realtime add table public.user_weekly_plans;
  end if;
end;
$$;
