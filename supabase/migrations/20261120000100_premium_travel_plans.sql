create table if not exists public.user_travel_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_travel_plans_plan_object check (jsonb_typeof(plan) = 'object')
);
create index if not exists user_travel_plans_user_updated_idx on public.user_travel_plans(user_id, updated_at desc);
alter table public.user_travel_plans enable row level security;
revoke all on public.user_travel_plans from anon;
revoke all on public.user_travel_plans from authenticated;
grant select,insert,update,delete on public.user_travel_plans to authenticated;
drop policy if exists "Premium users manage their travel plans" on public.user_travel_plans;
create policy "Premium users manage their travel plans" on public.user_travel_plans
for all to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')))
with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_premium or p.role='admin')));
