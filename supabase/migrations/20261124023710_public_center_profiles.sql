create schema if not exists private;

-- Read the public projection without granting access to staff memberships.
create function private.center_profile(center_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', center.name,
    'description', center.description,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', service.id,
        'name', service.name,
        'price_clp', service.price_clp,
        'duration_minutes', service.duration_minutes
      ) order by service.name, service.id)
      from public.services as service
      where service.center_id = center.id and service.active
    ), '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', profile.professional_id,
        'name', profile.display_name
      ) order by profile.display_name, profile.professional_id)
      from public.center_memberships as membership
      join public.staff_profiles as profile on profile.user_id = membership.user_id
      where membership.center_id = center.id
    ), '[]'::jsonb)
  )
  from public.centers as center
  where center.slug = center_slug;
$$;

revoke all on function private.center_profile(text) from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.center_profile(text) to anon, authenticated;

create function public.public_center_profile(center_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.center_profile(center_slug);
$$;

revoke all on function public.public_center_profile(text) from public, anon, authenticated;
grant execute on function public.public_center_profile(text) to anon, authenticated;
