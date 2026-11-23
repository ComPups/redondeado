-- Memberships are the source of truth for center-specific authorization.
create type public.center_role as enum ('administrator', 'member', 'limited');

create table public.centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0)
);

create table public.center_memberships (
  center_id uuid not null references public.centers(id) on delete cascade,
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  role public.center_role not null,
  primary key (center_id, user_id)
);
create index center_memberships_user_id_idx on public.center_memberships (user_id);

alter table public.centers enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.center_memberships enable row level security;

-- A signed-in user can obtain their own center and role directly from the
-- database; do not rely on user-editable JWT metadata for authorization.
create policy "Staff read their own memberships" on public.center_memberships
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Staff read their centers" on public.centers
  for select to authenticated using (
    id in (select center_id from public.center_memberships where user_id = (select auth.uid()))
  );
-- Display names are the only staff identity data exposed for booking and lists.
create policy "Read professional display names" on public.staff_profiles
  for select to anon, authenticated using (true);

revoke all on public.centers, public.staff_profiles, public.center_memberships from anon, authenticated;
grant select on public.staff_profiles to anon, authenticated;
grant select on public.centers, public.center_memberships to authenticated;
