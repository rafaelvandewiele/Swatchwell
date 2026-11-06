alter table public.user_style_data
add column if not exists color_profile jsonb;

alter table public.user_style_data
drop constraint if exists color_profile_is_object;

alter table public.user_style_data
add constraint color_profile_is_object
check (
  color_profile is null
  or jsonb_typeof(color_profile) = 'object'
);

comment on column public.user_style_data.color_profile is
'Account-scoped Swatchwell seasonal colour profile and analysis.';
