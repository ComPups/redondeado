grant select on public.appointments to authenticated;
create policy "Staff read permitted appointments" on public.appointments
  for select to authenticated using (
    exists (
      select 1 from public.center_memberships m
      where m.center_id = appointments.center_id
        and m.user_id = (select auth.uid())
        and (m.role = 'administrator' or appointments.professional_user_id = (select auth.uid()))
    )
  );
