-- Manual staff provisioning replaces invitation delivery. Auth and SQL are
-- coordinated by the API; this table contains no password or auth secret.
drop function if exists public.accept_staff_invitation(uuid);
drop function if exists public.team_invitation_action(uuid, uuid, text);
drop function if exists public.team_invite(uuid, text, text, public.center_role, uuid[]);
drop function if exists public.team_list(uuid);
drop table if exists public.staff_invitation_services;
drop table if exists public.staff_invitations;

create table public.team_provisioning_requests (
  request_id uuid primary key,
  center_id uuid not null references public.centers(id) on delete cascade,
  email text not null,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (center_id, email)
);
alter table public.team_provisioning_requests enable row level security;
revoke all on public.team_provisioning_requests from public, anon, authenticated;

create function public.team_member_json(p_center uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('user_id',m.user_id,'display_name',p.display_name,'role',m.role,'active',m.active,
    'upcoming_appointments',(select count(*) from public.appointments a where a.center_id=m.center_id and a.professional_user_id=m.user_id and a.starts_at>now()),
    'services',coalesce((select jsonb_agg(s.name order by s.name) from public.professional_services ps join public.services s on s.id=ps.service_id and s.center_id=ps.center_id where ps.center_id=m.center_id and ps.professional_user_id=m.user_id and ps.active and s.active),'[]'::jsonb))
  from public.center_memberships m join public.staff_profiles p on p.user_id=m.user_id where m.center_id=p_center and m.user_id=p_user;
$$;

create function public.team_provisioning_lookup(p_center uuid, p_email text, p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.team_provisioning_requests%rowtype; result jsonb;
begin
  if not private.can_manage_team(p_center) then raise exception 'Access denied' using errcode='42501'; end if;
  select * into saved from public.team_provisioning_requests where request_id=p_request;
  if saved.request_id is null then return null; end if;
  if saved.center_id<>p_center or saved.email<>lower(btrim(p_email)) then raise exception 'Idempotency key already used' using errcode='22023'; end if;
  result:=public.team_member_json(saved.center_id,saved.user_id);
  if result is null then raise exception 'Provisioning incomplete' using errcode='P0002'; end if;
  return result;
end $$;

create function public.team_create_member(p_center uuid,p_user uuid,p_email text,p_name text,p_role public.center_role,p_services uuid[],p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; saved public.team_provisioning_requests%rowtype; service_count integer;
begin
  perform 1 from public.centers where id=p_center for update;
  if not private.can_manage_team(p_center) then raise exception 'Access denied' using errcode='42501'; end if;
  if p_role is null then raise exception 'Invalid role' using errcode='22023'; end if;
  if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(btrim(p_email))) then raise exception 'Auth account not found' using errcode='22023'; end if;
  select * into saved from public.team_provisioning_requests where request_id=p_request;
  if saved.request_id is not null then
    if saved.center_id<>p_center or saved.email<>lower(btrim(p_email)) or saved.user_id<>p_user then raise exception 'Idempotency key already used' using errcode='22023'; end if;
    return public.team_member_json(saved.center_id,saved.user_id);
  end if;
  if exists(select 1 from public.center_memberships where center_id=p_center and user_id=p_user) then raise exception 'Membership already exists' using errcode='23505'; end if;
  select count(*) into service_count from public.services where center_id=p_center and id=any(coalesce(p_services,'{}'::uuid[])) and active;
  if service_count<>(select count(distinct value) from unnest(coalesce(p_services,'{}'::uuid[])) value) then raise exception 'Selecciona servicios activos del centro.' using errcode='22023'; end if;
  insert into public.staff_profiles(user_id,display_name) values(p_user,btrim(p_name)) on conflict(user_id) do nothing;
  insert into public.center_memberships(center_id,user_id,role) values(p_center,p_user,p_role);
  insert into public.professional_services(center_id,professional_user_id,service_id,price_clp,duration_minutes)
    select p_center,p_user,s.id,s.price_clp,s.duration_minutes from public.services s where s.center_id=p_center and s.id=any(coalesce(p_services,'{}'::uuid[])) and s.active;
  insert into public.team_provisioning_requests(request_id,center_id,email,user_id) values(p_request,p_center,lower(btrim(p_email)),p_user);
  result:=public.team_member_json(p_center,p_user);
  return result;
end $$;

create or replace function public.team_list(p_center uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.can_manage_team(p_center) then raise exception 'Access denied' using errcode='42501'; end if;
  return jsonb_build_object('members',coalesce((select jsonb_agg(public.team_member_json(p_center,m.user_id) order by p.display_name) from public.center_memberships m join public.staff_profiles p on p.user_id=m.user_id where m.center_id=p_center),'[]'::jsonb));
end $$;

revoke all on function public.team_member_json(uuid,uuid),public.team_provisioning_lookup(uuid,text,uuid),public.team_create_member(uuid,uuid,text,text,public.center_role,uuid[],uuid),public.team_list(uuid) from public,anon,authenticated;
grant execute on function public.team_provisioning_lookup(uuid,text,uuid),public.team_create_member(uuid,uuid,text,text,public.center_role,uuid[],uuid),public.team_list(uuid) to authenticated;
