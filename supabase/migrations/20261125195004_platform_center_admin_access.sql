create policy "Platform administrators create center services" on public.services
  for insert to authenticated
  with check (
    exists(select 1 from public.platform_administrators where user_id=(select auth.uid()))
  );
