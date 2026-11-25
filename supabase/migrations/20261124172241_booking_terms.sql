-- Immutable versions and current pointers preserve what each patient accepted.
create table public.booking_terms_versions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id),
  professional_user_id uuid,
  service_id uuid,
  body text not null check (length(trim(body)) between 1 and 30000),
  created_at timestamptz not null default now(),
  check ((professional_user_id is null and service_id is null) or (professional_user_id is not null and service_id is not null)),
  foreign key (center_id, professional_user_id) references public.center_memberships(center_id, user_id),
  foreign key (center_id, service_id) references public.services(center_id, id)
);
create table public.booking_terms_current (
  center_id uuid not null references public.centers(id),
  professional_user_id uuid,
  service_id uuid,
  version_id uuid not null references public.booking_terms_versions(id),
  check ((professional_user_id is null and service_id is null) or (professional_user_id is not null and service_id is not null)),
  unique nulls not distinct (center_id, professional_user_id, service_id)
);
create table public.appointment_terms_acceptances (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  version_id uuid not null references public.booking_terms_versions(id),
  accepted_at timestamptz not null default now(),
  primary key (appointment_id, version_id)
);
alter table public.booking_terms_versions enable row level security;
alter table public.booking_terms_current enable row level security;
alter table public.appointment_terms_acceptances enable row level security;
revoke all on public.booking_terms_versions, public.booking_terms_current, public.appointment_terms_acceptances from public, anon, authenticated;

-- All writes and bookings lock the center row, serializing version changes.
create function public.manage_booking_terms(p_center uuid, p_service uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_version uuid;
begin
  if v_user is null or not exists (select 1 from public.center_memberships m where m.center_id=p_center and m.user_id=v_user and (m.role='administrator' or (m.role='member' and p_service is not null))) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_service is not null and not exists (select 1 from public.services s where s.id=p_service and s.center_id=p_center and s.active) then
    raise exception 'Invalid service' using errcode='22023';
  end if;
  if p_body is not null and length(trim(p_body)) not between 1 and 30000 then raise exception 'Invalid terms' using errcode='22023'; end if;
  perform 1 from public.centers where id=p_center for update;
  delete from public.booking_terms_current where center_id=p_center and professional_user_id is not distinct from (case when p_service is null then null else v_user end) and service_id is not distinct from p_service;
  if p_body is not null then
    insert into public.booking_terms_versions(center_id,professional_user_id,service_id,body) values (p_center,case when p_service is null then null else v_user end,p_service,p_body) returning id into v_version;
    insert into public.booking_terms_current(center_id,professional_user_id,service_id,version_id) values (p_center,case when p_service is null then null else v_user end,p_service,v_version);
  end if;
  return v_version;
end $$;

create function public.staff_booking_terms(p_center uuid)
returns table(service_id uuid, body text) language sql stable security definer set search_path = '' as $$
  select t.service_id, v.body from public.booking_terms_current t join public.booking_terms_versions v on v.id=t.version_id
  join public.center_memberships m on m.center_id=t.center_id and m.user_id=(select auth.uid())
  where t.center_id=p_center and ((t.professional_user_id=m.user_id) or (t.professional_user_id is null and m.role='administrator'));
$$;
create function public.public_booking_terms(p_slug text, p_service uuid, p_professional uuid)
returns table(id uuid, kind text, body text) language sql stable security definer set search_path = '' as $$
  select v.id, case when t.professional_user_id is null then 'center' else 'professional' end, v.body
  from public.centers c join public.services s on s.center_id=c.id and s.id=p_service and s.active
  join public.center_memberships m on m.center_id=c.id join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=p_professional
  join public.booking_terms_current t on t.center_id=c.id and (t.professional_user_id is null or (t.professional_user_id=m.user_id and t.service_id=s.id))
  join public.booking_terms_versions v on v.id=t.version_id where c.slug=p_slug order by t.professional_user_id nulls first;
$$;
revoke all on function public.manage_booking_terms(uuid,uuid,text), public.staff_booking_terms(uuid), public.public_booking_terms(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.manage_booking_terms(uuid,uuid,text), public.staff_booking_terms(uuid) to authenticated;
grant execute on function public.public_booking_terms(text,uuid,uuid) to service_role;

