alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  account_is_admin boolean;
  user_first_name text;
  user_last_name text;
begin
  normalized_email := lower(coalesce(new.email, ''));

  user_first_name := nullif(
    trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')),
    ''
  );

  user_last_name := nullif(
    trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')),
    ''
  );

  select exists (
    select 1
    from private.admin_allowlist
    where email = normalized_email
  )
  into account_is_admin;

  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    role,
    premium_source
  )
  values (
    new.id,
    normalized_email,
    user_first_name,
    user_last_name,
    case when account_is_admin then 'admin' else 'user' end,
    case when account_is_admin then 'admin' else 'none' end
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    premium_source = excluded.premium_source,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row
execute function public.handle_new_user();

update public.profiles as profiles
set
  first_name = nullif(
    trim(coalesce(users.raw_user_meta_data ->> 'first_name', '')),
    ''
  ),
  last_name = nullif(
    trim(coalesce(users.raw_user_meta_data ->> 'last_name', '')),
    ''
  ),
  updated_at = now()
from auth.users as users
where users.id = profiles.id;
