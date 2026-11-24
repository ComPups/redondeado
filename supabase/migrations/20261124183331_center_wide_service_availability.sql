-- Keep the public profile shape for existing clients while sharing the center catalog.
create or replace function private.center_profile(center_slug text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', center.name,
    'description', center.description,
    'image_url', center.image_url,
    'opens_at', center.opens_at,
    'closes_at', center.closes_at,
    'services', coalesce(catalog.services, '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', profile.professional_id,
        'name', profile.display_name,
        'description', profile.description,
        'service_ids', coalesce(catalog.service_ids, '[]'::jsonb)
      ) order by profile.display_name, profile.professional_id)
      from public.center_memberships as membership
      join public.staff_profiles as profile on profile.user_id = membership.user_id
      where membership.center_id = center.id
    ), '[]'::jsonb)
  )
  from public.centers as center
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', service.id,
      'name', service.name,
      'description', service.description,
      'duration_minutes', service.duration_minutes,
      'price_clp', service.price_clp
    ) order by service.name, service.id) as services,
    jsonb_agg(service.id order by service.id) as service_ids
    from public.services as service
    where service.center_id = center.id and service.active
  ) as catalog
  where center.slug = center_slug;
$$;

-- The booking RPC uses this availability check before it inserts the appointment.
create or replace function public.public_availability(p_slug text, p_service uuid, p_professional uuid)
returns table (starts_at timestamptz) language sql stable security definer set search_path = '' as $$
  select candidate at time zone 'America/Santiago' as starts_at
  from public.centers c
  join public.services s on s.center_id = c.id and s.id = p_service and s.active
  join public.center_memberships m on m.center_id = c.id
  join public.staff_profiles p on p.user_id = m.user_id and p.professional_id = p_professional
  cross join lateral generate_series(date_trunc('month', now() at time zone 'America/Santiago'),
    date_trunc('month', now() at time zone 'America/Santiago') + interval '2 months' - interval '1 day', interval '1 day') day
  cross join lateral generate_series(day + c.opens_at, day + c.closes_at - s.duration_minutes * interval '1 minute', interval '30 minutes') candidate
  where c.slug = p_slug and candidate at time zone 'America/Santiago' > now()
    and not exists (select 1 from public.appointments a where a.professional_user_id = m.user_id
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(candidate at time zone 'America/Santiago', (candidate + s.duration_minutes * interval '1 minute') at time zone 'America/Santiago', '[)'))
  order by 1;
$$;
