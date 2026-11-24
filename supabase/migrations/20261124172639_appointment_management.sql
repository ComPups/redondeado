-- Members manage their own appointments; center administrators manage their center.
create policy "Staff update permitted appointments" on public.appointments for update to authenticated
using (exists (select 1 from public.center_memberships m where m.center_id = appointments.center_id and m.user_id = (select auth.uid()) and (m.role = 'administrator' or (m.role = 'member' and appointments.professional_user_id = m.user_id))))
with check (exists (select 1 from public.center_memberships m where m.center_id = appointments.center_id and m.user_id = (select auth.uid()) and (m.role = 'administrator' or (m.role = 'member' and appointments.professional_user_id = m.user_id))));
create policy "Staff delete permitted appointments" on public.appointments for delete to authenticated
using (exists (select 1 from public.center_memberships m where m.center_id = appointments.center_id and m.user_id = (select auth.uid()) and (m.role = 'administrator' or (m.role = 'member' and appointments.professional_user_id = m.user_id))) or exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
grant delete on public.appointments to authenticated;

-- Return only names attached to appointments the caller can read, without exposing profile account IDs.
create function public.appointment_professional_names(p_center_id uuid)
returns table(appointment_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select a.id, p.display_name from public.appointments a
  join public.staff_profiles p on p.user_id = a.professional_user_id
  where a.center_id = p_center_id and (exists (select 1 from public.platform_administrators pa where pa.user_id = (select auth.uid()))
    or exists (select 1 from public.center_memberships m where m.center_id = a.center_id and m.user_id = (select auth.uid()) and (m.role = 'administrator' or a.professional_user_id = m.user_id)));
$$;
revoke all on function public.appointment_professional_names(uuid) from public, anon;
grant execute on function public.appointment_professional_names(uuid) to authenticated;
