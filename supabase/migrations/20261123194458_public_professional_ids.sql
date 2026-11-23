-- Public booking identifiers are independent of Supabase Auth account IDs.
alter table public.staff_profiles
  add column professional_id uuid not null default gen_random_uuid(),
  add constraint staff_profiles_professional_id_key unique (professional_id);

-- Row security controls which profiles are visible; column grants keep the
-- Auth account link private even when a profile is publicly readable.
revoke select on public.staff_profiles from anon, authenticated;
grant select (professional_id, display_name) on public.staff_profiles to anon, authenticated;
