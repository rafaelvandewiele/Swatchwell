-- An administrator role is granted by the private email allowlist.
-- If an account leaves that allowlist by changing its email, revoke the role
-- rather than preserving admin privileges indefinitely.
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
      when public.profiles.role = 'admin' then 'user'
      else public.profiles.role
    end,
    premium_source = case
      when account_is_admin then 'admin'
      when public.profiles.role = 'admin' then 'none'
      else public.profiles.premium_source
    end,
    updated_at = now();

  return new;
end;
$$;
