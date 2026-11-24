-- Every professional in a center offers its active services.
create or replace function private.center_profile(center_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', c.name, 'description', c.description, 'opens_at', c.opens_at, 'closes_at', c.closes_at,
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'duration_minutes', s.duration_minutes, 'price_clp', s.price_clp) order by s.name) from public.services s where s.center_id = c.id and s.active), '[]'::jsonb),
    'professionals', coalesce((select jsonb_agg(jsonb_build_object('id', p.professional_id, 'name', p.display_name,
      'service_ids', coalesce((select jsonb_agg(s.id order by s.id) from public.services s where s.center_id = c.id and s.active), '[]'::jsonb)) order by p.display_name)
      from public.center_memberships m join public.staff_profiles p on p.user_id = m.user_id where m.center_id = c.id), '[]'::jsonb))
  from public.centers c where c.slug = center_slug;
$$;


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


-- Expose only the caller's display name, without granting access to Auth IDs.
create or replace function public.staff_display_name()
returns text language sql stable security definer set search_path = '' as $$
  select display_name from public.staff_profiles where user_id = (select auth.uid());
$$;
revoke all on function public.staff_display_name() from public, anon;
grant execute on function public.staff_display_name() to authenticated;
