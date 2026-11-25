-- Remove the old public signature so clients cannot bypass acceptance.
drop function public.book_public_appointment(text,uuid,uuid,timestamptz,text,text,text);
create function public.book_public_appointment(p_slug text, p_service uuid, p_professional uuid, p_start timestamptz, p_name text, p_email text, p_phone text, p_terms uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_center uuid; v_user uuid; v_service public.services%rowtype; v_id uuid; v_terms uuid[];
begin
  if p_name is null or length(trim(p_name)) not between 2 and 120 or p_email is null or length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_phone is null or p_phone !~ '^\+56[0-9]{8,18}$' then raise exception 'Invalid patient details' using errcode='22023'; end if;
  select c.id, m.user_id into v_center, v_user from public.centers c join public.services s on s.center_id=c.id and s.id=p_service and s.active join public.center_memberships m on m.center_id=c.id join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=p_professional where c.slug=p_slug;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  perform 1 from public.centers where id=v_center for update;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_terms from public.public_booking_terms(p_slug,p_service,p_professional);
  if p_terms is null or cardinality(p_terms) <> cardinality(v_terms) or not (p_terms @> v_terms and v_terms @> p_terms) then raise exception 'Terms changed or not accepted' using errcode='PT409'; end if;
  if not exists (select 1 from public.public_availability(p_slug,p_service,p_professional) slot where slot.starts_at=p_start) then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  select * into strict v_service from public.services where id=p_service and center_id=v_center and active;
  insert into public.appointments(center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at) values(v_center,v_user,v_service.id,v_service.name,trim(p_name),trim(p_email),trim(p_phone),p_start,p_start + v_service.duration_minutes * interval '1 minute') returning id into v_id;
  insert into public.appointment_terms_acceptances(appointment_id,version_id) select v_id, unnest(v_terms);
  return v_id;
end $$;
revoke all on function public.book_public_appointment(text,uuid,uuid,timestamptz,text,text,text,uuid[]) from public, anon, authenticated;
grant execute on function public.book_public_appointment(text,uuid,uuid,timestamptz,text,text,text,uuid[]) to service_role;

-- The API's service role calls the security-invoker profile wrapper.
grant usage on schema private to service_role;
grant execute on function private.center_profile(text) to service_role;

-- Staff-created appointments retain their existing workflow; they do not imply
-- that a patient accepted contractual terms in the public booking flow.
create or replace function public.book_staff_appointment(p_center_id uuid, p_service uuid, p_professional uuid, p_start timestamptz, p_name text, p_email text, p_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_slug text; v_user uuid; v_service public.services%rowtype; v_id uuid;
begin
  if not exists (select 1 from public.staff_booking_professionals(p_center_id) p where p.id = p_professional) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 2 and 120 or p_email is null or length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_phone is null or p_phone !~ '^\+56[0-9]{8,18}$' then
    raise exception 'Invalid patient details' using errcode = '22023';
  end if;
  select c.slug, m.user_id into v_slug, v_user from public.centers c
    join public.services s on s.center_id=c.id and s.id=p_service and s.active
    join public.center_memberships m on m.center_id=c.id
    join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=p_professional
    where c.id=p_center_id;
  if not found or not exists (select 1 from public.public_availability(v_slug,p_service,p_professional) slot where slot.starts_at=p_start) then
    raise exception 'Slot unavailable' using errcode='P0001';
  end if;
  select * into strict v_service from public.services where id=p_service and center_id=p_center_id and active;
  insert into public.appointments(center_id,professional_user_id,service_id,service_name,patient_name,patient_email,patient_phone,starts_at,ends_at)
    values(p_center_id,v_user,v_service.id,v_service.name,trim(p_name),trim(p_email),trim(p_phone),p_start,p_start + v_service.duration_minutes * interval '1 minute') returning id into v_id;
  return v_id;
end $$;
