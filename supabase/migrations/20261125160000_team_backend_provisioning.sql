-- Forward correction: application orchestration now lives in the API. Keep
-- only table constraints, RLS access rules, and the last-admin trigger.
drop function if exists public.team_provisioning_lookup(uuid, text, uuid);
drop function if exists public.team_create_member(uuid, uuid, text, text, public.center_role, uuid[], uuid);
drop function if exists public.team_list(uuid);
drop function if exists public.team_update_member(uuid, uuid, public.center_role, boolean);
drop function if exists public.team_member_json(uuid, uuid);

alter table public.team_provisioning_requests alter column user_id drop not null;
alter table public.team_provisioning_requests drop constraint if exists team_provisioning_requests_user_id_fkey;
alter table public.team_provisioning_requests add constraint team_provisioning_requests_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.team_provisioning_requests add column if not exists state text not null default 'committed' check (state in ('committed','cleanup_pending','cleaned'));

create function private.is_team_manager() returns boolean
language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.platform_administrators where user_id=(select auth.uid()))
    or exists (select 1 from public.center_memberships where user_id=(select auth.uid()) and active and role='administrator');
$$;
revoke all on function private.is_team_manager() from public, anon, authenticated;
grant execute on function private.is_team_manager() to authenticated;

create function private.can_view_team_profile(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_team_manager() and (
    exists (select 1 from public.platform_administrators where user_id=(select auth.uid()))
    or exists (select 1 from public.center_memberships target join public.center_memberships actor on actor.center_id=target.center_id where target.user_id=p_user and actor.user_id=(select auth.uid()) and actor.active and actor.role='administrator')
  );
$$;
revoke all on function private.can_view_team_profile(uuid) from public, anon, authenticated;
grant execute on function private.can_view_team_profile(uuid) to authenticated;

create policy "Team managers read memberships" on public.center_memberships
  for select to authenticated using (
    private.can_manage_team(center_memberships.center_id)
  );
create policy "Team managers insert memberships" on public.center_memberships
  for insert to authenticated with check (
    private.can_manage_team(center_memberships.center_id)
  );
create policy "Team managers update memberships" on public.center_memberships
  for update to authenticated using (
    private.can_manage_team(center_memberships.center_id)
  ) with check (private.can_manage_team(center_memberships.center_id) and role in ('administrator','member','limited'));
revoke update on public.center_memberships from authenticated;
grant insert on public.center_memberships to authenticated;
grant update (role,active) on public.center_memberships to authenticated;
grant insert on public.staff_profiles to authenticated;
drop policy if exists "Read professional display names" on public.staff_profiles;
create policy "Anonymous read professional display names" on public.staff_profiles
  for select to anon using (true);
create policy "Team managers read member IDs" on public.staff_profiles
  for select to authenticated using (private.can_view_team_profile(user_id));
grant select (user_id,display_name) on public.staff_profiles to authenticated;
create policy "Team managers insert profiles" on public.staff_profiles
  for insert to authenticated with check (
    private.is_team_manager()
  );

create policy "Team managers insert offerings" on public.professional_services
  for insert to authenticated with check (
    private.can_manage_team(professional_services.center_id)
  );
grant insert on public.professional_services to authenticated;

grant select, insert on public.team_provisioning_requests to authenticated;
grant update (state,user_id) on public.team_provisioning_requests to authenticated;
create policy "Team managers read provisioning requests" on public.team_provisioning_requests
  for select to authenticated using (
    private.can_manage_team(team_provisioning_requests.center_id)
  );
create policy "Team managers insert provisioning requests" on public.team_provisioning_requests
  for insert to authenticated with check (
    private.can_manage_team(team_provisioning_requests.center_id)
  );
create policy "Team managers update provisioning requests" on public.team_provisioning_requests
  for update to authenticated using (private.can_manage_team(team_provisioning_requests.center_id))
  with check (private.can_manage_team(team_provisioning_requests.center_id));
