-- Forward correction for already-applied Equipo migrations.
-- Keep membership mutations column-scoped; center_id/user_id are immutable
-- through the authenticated runtime role.
revoke update on public.center_memberships from authenticated;
grant update (role,active) on public.center_memberships to authenticated;
alter policy "Team managers update memberships" on public.center_memberships
  using (private.can_manage_team(center_memberships.center_id))
  with check (private.can_manage_team(center_memberships.center_id) and role in ('administrator','member','limited'));

-- The API needs member user IDs only for centers the actor administers. Keep
-- the public display-name policy anonymous-only and scope authenticated IDs.
create or replace function private.can_view_team_profile(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.platform_administrators where user_id=(select auth.uid()))
    or exists (select 1 from public.center_memberships target join public.center_memberships actor on actor.center_id=target.center_id where target.user_id=p_user and actor.user_id=(select auth.uid()) and actor.active and actor.role='administrator')
  );
$$;
revoke all on function private.can_view_team_profile(uuid) from public, anon, authenticated;
grant execute on function private.can_view_team_profile(uuid) to authenticated;
drop policy if exists "Read professional display names" on public.staff_profiles;
drop policy if exists "Anonymous read professional display names" on public.staff_profiles;
drop policy if exists "Team managers read member IDs" on public.staff_profiles;
create policy "Anonymous read professional display names" on public.staff_profiles for select to anon using (true);
create policy "Team managers read member IDs" on public.staff_profiles for select to authenticated using (private.can_view_team_profile(user_id));
grant select (user_id,display_name) on public.staff_profiles to authenticated;

alter table public.team_provisioning_requests alter column user_id drop not null;
alter table public.team_provisioning_requests drop constraint if exists team_provisioning_requests_user_id_fkey;
alter table public.team_provisioning_requests add constraint team_provisioning_requests_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.team_provisioning_requests add column if not exists state text not null default 'committed' check (state in ('committed','cleanup_pending','cleaned'));
grant update (state,user_id) on public.team_provisioning_requests to authenticated;
drop policy if exists "Team managers update provisioning requests" on public.team_provisioning_requests;
create policy "Team managers update provisioning requests" on public.team_provisioning_requests
  for update to authenticated using (private.can_manage_team(team_provisioning_requests.center_id))
  with check (private.can_manage_team(team_provisioning_requests.center_id));
