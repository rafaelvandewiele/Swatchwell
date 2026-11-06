create table if not exists public.user_style_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wardrobe jsonb not null default '[]'::jsonb,
  saved_outfits jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint wardrobe_is_array check (jsonb_typeof(wardrobe) = 'array'),
  constraint saved_outfits_is_array check (jsonb_typeof(saved_outfits) = 'array')
);

alter table public.user_style_data enable row level security;

revoke all on public.user_style_data from anon;
grant select, insert, update, delete
on public.user_style_data to authenticated;

create policy "Users manage their own style data"
on public.user_style_data
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
