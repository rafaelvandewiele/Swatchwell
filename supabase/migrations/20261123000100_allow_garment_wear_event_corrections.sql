-- Allow Premium users to correct the date of their own garment wear events.
-- OutfitHistory updates these rows when a wear-history date is corrected.
grant update on public.user_garment_wear_events to authenticated;

drop policy if exists "Premium users update their own garment wear events"
  on public.user_garment_wear_events;

create policy "Premium users update their own garment wear events"
on public.user_garment_wear_events
for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (p.is_premium or p.role = 'admin')
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (p.is_premium or p.role = 'admin')
  )
);
