-- Apply the Chilean phone format to new public bookings.
create or replace function public.book_public_appointment(p_slug text, p_service uuid, p_professional uuid, p_start timestamptz, p_name text, p_email text, p_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_center uuid; v_user uuid; v_service public.services%rowtype; v_id uuid;
begin
  if p_name is null or length(trim(p_name)) not between 2 and 120 or p_email is null or length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_phone is null or p_phone !~ '^\+56[0-9]{8,18}$' then
    raise exception 'Invalid patient details' using errcode = '22023';
  end if;
  select c.id, m.user_id into v_center, v_user from public.centers c
    join public.services s on s.center_id = c.id and s.id = p_service and s.active
    join public.center_memberships m on m.center_id = c.id
    join public.staff_profiles p on p.user_id = m.user_id and p.professional_id = p_professional
    where c.slug = p_slug;
  if not found or not exists (select 1 from public.public_availability(p_slug, p_service, p_professional) slot where slot.starts_at = p_start) then
    raise exception 'Slot unavailable' using errcode = 'P0001';
  end if;
  select * into strict v_service from public.services where id = p_service and center_id = v_center and active;
  insert into public.appointments(center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at)
  values (v_center, v_user, v_service.id, v_service.name, trim(p_name), trim(p_email), trim(p_phone), p_start, p_start + v_service.duration_minutes * interval '1 minute') returning id into v_id;
  return v_id;
end;
$$;