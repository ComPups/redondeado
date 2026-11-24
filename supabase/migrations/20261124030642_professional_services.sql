-- An assignment belongs to the same center as both the service and member.
create table public.professional_services (
  center_id uuid not null,
  professional_user_id uuid not null,
  service_id uuid not null,
  primary key (center_id, professional_user_id, service_id),
  foreign key (center_id, professional_user_id) references public.center_memberships(center_id, user_id) on delete cascade,
  foreign key (center_id, service_id) references public.services(center_id, id) on delete cascade
);
create index professional_services_service_idx on public.professional_services (center_id, service_id);
alter table public.professional_services enable row level security;
revoke all on public.professional_services from anon, authenticated;
grant select, insert, delete on public.professional_services to authenticated;
create policy "Platform admins manage professional services" on public.professional_services for all to authenticated
  using (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())))
  with check (exists (select 1 from public.platform_administrators where user_id = (select auth.uid())));


create or replace function private.center_profile(center_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', c.name, 'description', c.description,
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'duration_minutes', s.duration_minutes, 'price_clp', s.price_clp) order by s.name) from public.services s where s.center_id = c.id and s.active), '[]'::jsonb),
    'professionals', coalesce((select jsonb_agg(jsonb_build_object('id', p.professional_id, 'name', p.display_name,
      'service_ids', coalesce((select jsonb_agg(ps.service_id) from public.professional_services ps join public.services s on s.id = ps.service_id and s.center_id = ps.center_id and s.active where ps.center_id = c.id and ps.professional_user_id = m.user_id), '[]'::jsonb)) order by p.display_name)
      from public.center_memberships m join public.staff_profiles p on p.user_id = m.user_id where m.center_id = c.id), '[]'::jsonb))
  from public.centers c where c.slug = center_slug;
$$;


-- Allow bookings in the current and following Santiago calendar months.
create function public.public_availability(p_slug text, p_service uuid, p_professional uuid)
returns table (starts_at timestamptz) language sql stable security definer set search_path = '' as $$
  select candidate at time zone 'America/Santiago' as starts_at
  from public.centers c
  join public.services s on s.center_id = c.id and s.id = p_service and s.active
  join public.professional_services ps on ps.center_id = c.id and ps.service_id = s.id
  join public.staff_profiles p on p.user_id = ps.professional_user_id and p.professional_id = p_professional
  cross join lateral generate_series(date_trunc('month', now() at time zone 'America/Santiago'),
    date_trunc('month', now() at time zone 'America/Santiago') + interval '2 months' - interval '1 day', interval '1 day') day
  cross join lateral generate_series(day + c.opens_at, day + c.closes_at - s.duration_minutes * interval '1 minute', interval '30 minutes') candidate
  where c.slug = p_slug and candidate at time zone 'America/Santiago' > now()
    and not exists (select 1 from public.appointments a where a.professional_user_id = ps.professional_user_id
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(candidate at time zone 'America/Santiago', (candidate + s.duration_minutes * interval '1 minute') at time zone 'America/Santiago', '[)'))
  order by 1;
$$;

create function public.book_public_appointment(p_slug text, p_service uuid, p_professional uuid, p_start timestamptz, p_name text, p_email text, p_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_center uuid; v_user uuid; v_service public.services%rowtype; v_id uuid;
begin
  if p_name is null or length(trim(p_name)) not between 2 and 120 or p_email is null or length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_phone is null or p_phone !~ '^\+?[0-9 ()-]{7,20}$' or length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 7 then
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
revoke all on function public.public_availability(text, uuid, uuid), public.book_public_appointment(text, uuid, uuid, timestamptz, text, text, text) from public;
grant execute on function public.public_availability(text, uuid, uuid), public.book_public_appointment(text, uuid, uuid, timestamptz, text, text, text) to anon, authenticated;
