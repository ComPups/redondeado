alter table public.centers
  add column image_url text check (
    char_length(image_url) <= 2048 and image_url ~ '^https://[^[:space:]]+$'
  );

alter table public.services
  add column description text not null default '' check (char_length(description) <= 400);

alter table public.staff_profiles
  add column description text not null default '' check (char_length(description) <= 400);

grant update (description) on public.services to authenticated;
grant select (description), update (description) on public.staff_profiles to authenticated;

-- Extend the existing projection without broadening anonymous table access.
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
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', service.id,
        'name', service.name,
        'description', service.description,
        'duration_minutes', service.duration_minutes,
        'price_clp', service.price_clp
      ) order by service.name, service.id)
      from public.services as service
      where service.center_id = center.id and service.active
    ), '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', profile.professional_id,
        'name', profile.display_name,
        'description', profile.description,
        'service_ids', coalesce((
          select jsonb_agg(assignment.service_id order by assignment.service_id)
          from public.professional_services as assignment
          join public.services as service
            on service.id = assignment.service_id and service.center_id = assignment.center_id
          where assignment.center_id = center.id
            and assignment.professional_user_id = membership.user_id
            and service.active
        ), '[]'::jsonb)
      ) order by profile.display_name, profile.professional_id)
      from public.center_memberships as membership
      join public.staff_profiles as profile on profile.user_id = membership.user_id
      where membership.center_id = center.id
    ), '[]'::jsonb)
  )
  from public.centers as center
  where center.slug = center_slug;
$$;
