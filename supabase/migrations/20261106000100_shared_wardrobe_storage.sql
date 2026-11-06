insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'wardrobe-photos',
  'wardrobe-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own wardrobe photos"
on storage.objects;

create policy "Users read own wardrobe photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users upload own wardrobe photos"
on storage.objects;

create policy "Users upload own wardrobe photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users update own wardrobe photos"
on storage.objects;

create policy "Users update own wardrobe photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users delete own wardrobe photos"
on storage.objects;

create policy "Users delete own wardrobe photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_style_data'
  ) then
    alter publication supabase_realtime
    add table public.user_style_data;
  end if;
end
$$;
