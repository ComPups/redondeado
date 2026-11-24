-- Platform access is assigned only by trusted operators, never by clients.
create table public.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.platform_administrators enable row level security;
revoke all on public.platform_administrators from anon, authenticated;
grant select on public.platform_administrators to authenticated;
create policy "Read own platform role" on public.platform_administrators
  for select to authenticated using (user_id = (select auth.uid()));

-- The lookup is subject to the table's own self-only RLS policy.
create policy "Platform admins read centers" on public.centers for select to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
create policy "Platform admins create centers" on public.centers for insert to authenticated
  with check (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
create policy "Platform admins update centers" on public.centers for update to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())))
  with check (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
grant insert, update on public.centers to authenticated;

create policy "Platform admins read memberships" on public.center_memberships for select to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
create policy "Platform admins update memberships" on public.center_memberships for update to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())))
  with check (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
grant update (role) on public.center_memberships to authenticated;

create policy "Platform admins read services" on public.services for select to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
create policy "Platform admins update services" on public.services for update to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())))
  with check (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
grant update (name, price_clp, duration_minutes, active) on public.services to authenticated;

create policy "Platform admins read appointments" on public.appointments for select to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
create policy "Platform admins update appointments" on public.appointments for update to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())))
  with check (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
grant update (professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at) on public.appointments to authenticated;

create policy "Platform admins update staff profiles" on public.staff_profiles for update to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())))
  with check (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));
grant update (display_name) on public.staff_profiles to authenticated;
