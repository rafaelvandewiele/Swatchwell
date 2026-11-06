-- Swatchwell: secure user profiles, admin role and future Premium support.
-- Client applications cannot create or modify profile privileges.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.admin_allowlist (
  email text primary key,
  constraint admin_allowlist_email_lowercase
    check (email = lower(email))
);

insert into private.admin_allowlist (email)
values ('hello@veyca.dev')
on conflict (email) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user'
    check (role in ('user', 'admin')),
  premium_source text not null default 'none'
    check (premium_source in ('none', 'admin', 'subscription')),
  is_premium boolean generated always as (
    premium_source <> 'none'
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

grant select on table public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_admin())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  account_is_admin boolean;
begin
  normalized_email := lower(coalesce(new.email, ''));

  select exists (
    select 1
    from private.admin_allowlist
    where email = normalized_email
  )
  into account_is_admin;

  insert into public.profiles (
    id,
    email,
    role,
    premium_source
  )
  values (
    new.id,
    normalized_email,
    case when account_is_admin then 'admin' else 'user' end,
    case when account_is_admin then 'admin' else 'none' end
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    premium_source = excluded.premium_source,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert or update of email on auth.users
for each row
execute function public.handle_new_user();

-- Backfill accounts that existed before this migration.
insert into public.profiles (
  id,
  email,
  role,
  premium_source
)
select
  users.id,
  lower(users.email),
  case
    when allowlist.email is not null then 'admin'
    else 'user'
  end,
  case
    when allowlist.email is not null then 'admin'
    else 'none'
  end
from auth.users as users
left join private.admin_allowlist as allowlist
  on allowlist.email = lower(users.email)
where users.email is not null
on conflict (id) do update set
  email = excluded.email,
  role = excluded.role,
  premium_source = excluded.premium_source,
  updated_at = now();
