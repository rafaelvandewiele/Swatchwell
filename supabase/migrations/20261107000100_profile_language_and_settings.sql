alter table public.profiles
  add column if not exists language text not null default 'en';

alter table public.profiles
  drop constraint if exists profiles_language_supported;

alter table public.profiles
  add constraint profiles_language_supported
  check (language in ('en', 'nl', 'fr', 'de'));

update public.profiles as profile
set language = case
  when lower(users.raw_user_meta_data ->> 'preferred_language')
    in ('en', 'nl', 'fr', 'de')
  then lower(users.raw_user_meta_data ->> 'preferred_language')
  else 'en'
end
from auth.users as users
where users.id = profile.id;

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
  user_language text;
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

  user_language := lower(
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'en')
  );

  if user_language not in ('en', 'nl', 'fr', 'de') then
    user_language := 'en';
  end if;

  select exists (
    select 1
    from private.admin_allowlist
    where email = normalized_email
  )
  into account_is_admin;

  insert into public.profiles (
    id, email, first_name, last_name, language, role, premium_source
  )
  values (
    new.id,
    normalized_email,
    user_first_name,
    user_last_name,
    user_language,
    case when account_is_admin then 'admin' else 'user' end,
    case when account_is_admin then 'admin' else 'none' end
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    language = case
      when lower(coalesce(new.raw_user_meta_data ->> 'preferred_language', ''))
        in ('en', 'nl', 'fr', 'de')
      then excluded.language
      else public.profiles.language
    end,
    role = case
      when account_is_admin then 'admin'
      else public.profiles.role
    end,
    premium_source = case
      when account_is_admin then 'admin'
      else public.profiles.premium_source
    end,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.update_my_profile(
  p_first_name text,
  p_last_name text,
  p_language text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  normalized_language text;
  normalized_first_name text;
  normalized_last_name text;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  normalized_language := lower(trim(coalesce(p_language, '')));

  if normalized_language not in ('en', 'nl', 'fr', 'de') then
    raise exception 'Unsupported language.';
  end if;

  normalized_first_name := nullif(trim(coalesce(p_first_name, '')), '');
  normalized_last_name := nullif(trim(coalesce(p_last_name, '')), '');

  if length(coalesce(normalized_first_name, '')) > 80
    or length(coalesce(normalized_last_name, '')) > 80 then
    raise exception 'Name is too long.';
  end if;

  update public.profiles
  set
    first_name = normalized_first_name,
    last_name = normalized_last_name,
    language = normalized_language,
    updated_at = now()
  where id = current_user_id;

  if not found then
    raise exception 'Profile not found.';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text, text)
from public, anon;

grant execute on function public.update_my_profile(text, text, text)
to authenticated;
