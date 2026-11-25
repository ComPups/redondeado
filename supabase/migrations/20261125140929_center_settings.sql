-- Center staff may edit their own profile; platform administration keeps its
-- existing policy. Membership lookup remains subject to self-only RLS.
create policy "Center administrators update their center" on public.centers
for update to authenticated
using (exists (
  select 1 from public.center_memberships m
  where m.center_id = centers.id and m.user_id = (select auth.uid()) and m.role = 'administrator'
))
with check (exists (
  select 1 from public.center_memberships m
  where m.center_id = centers.id and m.user_id = (select auth.uid()) and m.role = 'administrator'
));

-- UPDATE is already granted for the platform editor. Restrict center admins to
-- the four profile fields, including when SQL bypasses the HTTP field allowlist.
create function private.protect_center_settings()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated'
    and not exists (select 1 from public.platform_administrators where user_id = (select auth.uid()))
    and (to_jsonb(new) - array['name','description','opens_at','closes_at'])
      is distinct from (to_jsonb(old) - array['name','description','opens_at','closes_at']) then
    raise exception 'Only center profile settings may be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_center_settings() from public, anon, authenticated;
create trigger protect_center_settings before update on public.centers
for each row execute function private.protect_center_settings();
