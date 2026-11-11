-- Stripe-backed subscriptions. The Stripe webhook is the only writer for subscription state.
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  failed_at timestamptz,
  last_dunning_email_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
revoke all on public.billing_customers from anon, authenticated;
revoke all on public.billing_subscriptions from anon, authenticated;
grant select on public.billing_subscriptions to authenticated;

drop policy if exists "Users can view their billing subscription" on public.billing_subscriptions;
create policy "Users can view their billing subscription"
on public.billing_subscriptions for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.admin_set_premium(
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required.';
  end if;

  update public.profiles
  set premium_source = case
    when p_enabled then 'admin'
    when premium_source = 'admin' then
      case when exists (
        select 1 from public.billing_subscriptions s
        where s.user_id = p_user_id
          and s.status in ('active', 'trialing', 'past_due', 'unpaid')
          and (s.failed_at is null or s.failed_at > now() - interval '5 days')
      ) then 'subscription' else 'none' end
    else premium_source
  end,
  updated_at = now()
  where id = p_user_id and role <> 'admin';

  if not found then
    raise exception 'User not found or cannot be modified.';
  end if;
end;
$$;

revoke all on function public.admin_set_premium(uuid, boolean) from public, anon;
grant execute on function public.admin_set_premium(uuid, boolean) to authenticated;
