-- The API workflow role is private to the backend login. It is deliberately
-- separate from anon/authenticated so moving orchestration into TypeScript
-- does not expose patient writes or reads through the Data API.
create role redondeado_backend nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant redondeado_backend to redondeado_api;
grant usage on schema public to redondeado_backend;
grant usage on schema auth to redondeado_backend;
grant execute on function auth.uid() to redondeado_backend;

-- Remove application workflows from the database. The remaining functions
-- are projections used by unrelated staff CRUD, permission helpers, or
-- integrity triggers and remain database-owned.
drop function if exists public.book_public_appointment_with_price(text, uuid, uuid, timestamptz, text, text, text, uuid[], integer);
drop function if exists public.book_public_appointment(text, uuid, uuid, timestamptz, text, text, text, uuid[]);
drop function if exists public.book_staff_appointment(uuid, uuid, uuid, timestamptz, text, text, text);
drop function if exists public.public_availability(text, uuid, uuid);
drop function if exists public.public_center_profile(text);
drop function if exists private.center_profile(text);
drop function if exists public.manage_booking_terms(uuid, uuid, text);
drop function if exists public.staff_booking_terms(uuid);
drop function if exists public.public_booking_terms(text, uuid, uuid);

grant select on public.centers, public.services, public.staff_profiles, public.center_memberships,
  public.professional_services, public.booking_terms_versions, public.booking_terms_current,
  public.platform_administrators to redondeado_backend;
grant select (id, professional_user_id, starts_at, ends_at) on public.appointments to redondeado_backend;
grant insert (center_id, professional_user_id, service_id, service_name, patient_name,
  patient_email, patient_phone, starts_at, ends_at, price_clp) on public.appointments to redondeado_backend;
grant insert on public.appointment_terms_acceptances to redondeado_backend;
grant insert on public.booking_terms_versions, public.booking_terms_current to redondeado_backend;
grant delete on public.booking_terms_current to redondeado_backend;

create policy "Backend workflow reads center catalog" on public.centers
  for select to redondeado_backend using (current_setting('request.redondeado.context', true) in ('public', 'staff'));
create policy "Backend workflow reads services" on public.services
  for select to redondeado_backend using (current_setting('request.redondeado.context', true) in ('public', 'staff'));
create policy "Backend workflow reads profiles" on public.staff_profiles
  for select to redondeado_backend using (current_setting('request.redondeado.context', true) in ('public', 'staff'));
create policy "Backend workflow reads memberships" on public.center_memberships
  for select to redondeado_backend using (current_setting('request.redondeado.context', true) in ('public', 'staff'));
create policy "Backend workflow reads platform roles" on public.platform_administrators
  for select to redondeado_backend using (current_setting('request.redondeado.context', true) = 'staff');
create policy "Backend workflow reads offerings" on public.professional_services
  for select to redondeado_backend using (current_setting('request.redondeado.context', true) in ('public', 'staff'));
create policy "Backend workflow reads appointments" on public.appointments
  for select to redondeado_backend using (current_setting('request.redondeado.context', true) in ('public', 'staff'));
create policy "Backend workflow inserts appointments" on public.appointments
  for insert to redondeado_backend with check (
    current_setting('request.redondeado.context', true) = 'public'
    or (
      current_setting('request.redondeado.context', true) = 'staff'
      and (
        exists (select 1 from public.center_memberships m where m.center_id = appointments.center_id and m.user_id = appointments.professional_user_id and m.user_id = (select auth.uid()) and m.role in ('administrator', 'member'))
        or exists (select 1 from public.center_memberships m where m.center_id = appointments.center_id and m.user_id = (select auth.uid()) and m.role = 'administrator')
        or exists (select 1 from public.platform_administrators p where p.user_id = (select auth.uid()))
      )
    )
  );
create policy "Backend workflow reads terms versions" on public.booking_terms_versions
  for select to redondeado_backend using (current_setting('request.redondeado.context', true) in ('public', 'staff'));
create policy "Backend workflow reads current terms" on public.booking_terms_current
  for select to redondeado_backend using (current_setting('request.redondeado.context', true) in ('public', 'staff'));
create policy "Backend workflow writes terms versions" on public.booking_terms_versions
  for insert to redondeado_backend with check (current_setting('request.redondeado.context', true) = 'staff');
create policy "Backend workflow writes current terms" on public.booking_terms_current
  for insert to redondeado_backend with check (current_setting('request.redondeado.context', true) = 'staff');
create policy "Backend workflow withdraws current terms" on public.booking_terms_current
  for delete to redondeado_backend using (current_setting('request.redondeado.context', true) = 'staff');
create policy "Backend workflow accepts terms" on public.appointment_terms_acceptances
  for insert to redondeado_backend with check (current_setting('request.redondeado.context', true) = 'public');
