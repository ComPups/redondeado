-- Center lifecycle is independent of shared identity and historical appointments.
alter table public.center_memberships add column active boolean not null default true;
create index center_memberships_active_user_idx on public.center_memberships(user_id,center_id) where active;

create view private.active_center_memberships with (security_invoker=true) as select * from public.center_memberships where active;
revoke all on private.active_center_memberships from public,anon;
grant select on private.active_center_memberships to authenticated;

-- Existing authorization and booking routines require active memberships.
-- Keep their original signatures and privileges; no bypass aliases are exposed.
CREATE OR REPLACE FUNCTION public.appointment_professional_names(p_center_id uuid)
 RETURNS TABLE(appointment_id uuid, display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.id, p.display_name from public.appointments a
  join public.staff_profiles p on p.user_id = a.professional_user_id
  where a.center_id = p_center_id and (exists (select 1 from public.platform_administrators pa where pa.user_id = (select auth.uid()))
    or exists (select 1 from (select * from public.center_memberships where active) m where m.center_id = a.center_id and m.user_id = (select auth.uid()) and (m.role = 'administrator' or a.professional_user_id = m.user_id)));
$function$;

CREATE OR REPLACE FUNCTION public.book_staff_appointment(p_center_id uuid, p_service uuid, p_professional uuid, p_start timestamp with time zone, p_name text, p_email text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_slug text; v_user uuid; v_service public.services%rowtype; v_id uuid; v_offering public.professional_services%rowtype;
begin
  if not exists (select 1 from public.staff_booking_professionals(p_center_id) p where p.id = p_professional) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 2 and 120 or p_email is null or length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_phone is null or p_phone !~ '^\+56[0-9]{8,18}$' then
    raise exception 'Invalid patient details' using errcode = '22023';
  end if;
  select c.slug, m.user_id into v_slug, v_user from public.centers c
    join public.services s on s.center_id=c.id and s.id=p_service and s.active
    join (select * from public.center_memberships where active) m on m.center_id=c.id
    join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=p_professional
    where c.id=p_center_id;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  perform 1 from public.centers where id=p_center_id for update;
  if not exists(select 1 from public.staff_booking_professionals(p_center_id) where id=p_professional) then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.services where center_id=p_center_id and id=p_service and active for share;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  perform 1 from public.professional_services where center_id=p_center_id and service_id=p_service and professional_user_id=v_user and active for share;
  if not found or not exists (select 1 from public.public_availability(v_slug,p_service,p_professional) slot where slot.starts_at=p_start) then
    raise exception 'Slot unavailable' using errcode='P0001';
  end if;
  select * into strict v_service from public.services where id=p_service and center_id=p_center_id and active;
  select * into strict v_offering from public.professional_services where center_id=p_center_id and service_id=p_service and professional_user_id=v_user and active;
  insert into public.appointments(center_id,professional_user_id,service_id,service_name,patient_name,patient_email,patient_phone,starts_at,ends_at,price_clp)
    values(p_center_id,v_user,v_service.id,v_service.name,trim(p_name),trim(p_email),trim(p_phone),p_start,p_start + v_offering.duration_minutes * interval '1 minute',v_offering.price_clp) returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.manage_booking_terms(p_center uuid, p_service uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := auth.uid(); v_version uuid;
begin
  if v_user is null or not exists (select 1 from (select * from public.center_memberships where active) m where m.center_id=p_center and m.user_id=v_user and (m.role='administrator' or (m.role='member' and p_service is not null))) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_service is not null and not exists (select 1 from public.services s where s.id=p_service and s.center_id=p_center and s.active) then
    raise exception 'Invalid service' using errcode='22023';
  end if;
  if p_body is not null and length(trim(p_body)) not between 1 and 30000 then raise exception 'Invalid terms' using errcode='22023'; end if;
  perform 1 from public.centers where id=p_center for update;
  delete from public.booking_terms_current where center_id=p_center and professional_user_id is not distinct from (case when p_service is null then null else v_user end) and service_id is not distinct from p_service;
  if p_body is not null then
    insert into public.booking_terms_versions(center_id,professional_user_id,service_id,body) values (p_center,case when p_service is null then null else v_user end,p_service,p_body) returning id into v_version;
    insert into public.booking_terms_current(center_id,professional_user_id,service_id,version_id) values (p_center,case when p_service is null then null else v_user end,p_service,v_version);
  end if;
  return v_version;
end $function$;

CREATE OR REPLACE FUNCTION public.public_availability(p_slug text, p_service uuid, p_professional uuid)
 RETURNS TABLE(starts_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select candidate at time zone 'America/Santiago' from public.centers c join public.services s on s.center_id=c.id and s.id=p_service and s.active join public.professional_services ps on ps.center_id=c.id and ps.service_id=s.id and ps.active join public.staff_profiles p on p.user_id=ps.professional_user_id and p.professional_id=p_professional
cross join lateral generate_series(date_trunc('month',now() at time zone 'America/Santiago'),date_trunc('month',now() at time zone 'America/Santiago')+interval '2 months'-interval '1 day',interval '1 day') day
cross join lateral generate_series(day+c.opens_at,day+c.closes_at-ps.duration_minutes*interval '1 minute',interval '30 minutes') candidate
where exists(select 1 from public.center_memberships member where member.center_id=c.id and member.user_id=ps.professional_user_id and member.active) and c.slug=p_slug and candidate at time zone 'America/Santiago'>now() and not exists(select 1 from public.appointments a where a.professional_user_id=ps.professional_user_id and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(candidate at time zone 'America/Santiago',(candidate+ps.duration_minutes*interval '1 minute') at time zone 'America/Santiago','[)')) order by 1;
$function$;

CREATE OR REPLACE FUNCTION public.public_booking_terms(p_slug text, p_service uuid, p_professional uuid)
 RETURNS TABLE(id uuid, kind text, body text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select v.id, case when t.professional_user_id is null then 'center' else 'professional' end, v.body
  from public.centers c join public.services s on s.center_id=c.id and s.id=p_service and s.active
  join (select * from public.center_memberships where active) m on m.center_id=c.id join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=p_professional
  join public.booking_terms_current t on t.center_id=c.id and (t.professional_user_id is null or (t.professional_user_id=m.user_id and t.service_id=s.id))
  join public.booking_terms_versions v on v.id=t.version_id where c.slug=p_slug order by t.professional_user_id nulls first;
$function$;

CREATE OR REPLACE FUNCTION public.staff_booking_professionals(p_center_id uuid)
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.professional_id, p.display_name
  from (select * from public.center_memberships where active) m join public.staff_profiles p on p.user_id = m.user_id
  where m.center_id = p_center_id and (
    exists (select 1 from public.platform_administrators pa where pa.user_id = (select auth.uid()))
    or exists (select 1 from (select * from public.center_memberships where active) actor where actor.center_id = p_center_id and actor.user_id = (select auth.uid()) and (actor.role = 'administrator' or (actor.role = 'member' and m.user_id = actor.user_id)))
  ) order by p.display_name;
$function$;

CREATE OR REPLACE FUNCTION public.staff_booking_terms(p_center uuid)
 RETURNS TABLE(service_id uuid, body text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select t.service_id, v.body from public.booking_terms_current t join public.booking_terms_versions v on v.id=t.version_id
  join (select * from public.center_memberships where active) m on m.center_id=t.center_id and m.user_id=(select auth.uid())
  where t.center_id=p_center and ((t.professional_user_id=m.user_id) or (t.professional_user_id is null and m.role='administrator'));
$function$;

CREATE OR REPLACE FUNCTION public.book_public_appointment_with_price(p_slug text, p_service uuid, p_professional uuid, p_start timestamp with time zone, p_name text, p_email text, p_phone text, p_terms uuid[], p_expected_price integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_center uuid; v_user uuid; v_price integer;
begin
  if p_expected_price is null or p_expected_price < 0 then raise exception 'Invalid price' using errcode='22023'; end if;
  select c.id, m.user_id into v_center, v_user from public.centers c
    join (select * from public.center_memberships where active) m on m.center_id=c.id
    join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=p_professional
    where c.slug=p_slug;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  perform 1 from public.centers where id=v_center for update;
  perform 1 from public.services where center_id=v_center and id=p_service and active for share;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  select price_clp into v_price from public.professional_services where center_id=v_center and service_id=p_service and professional_user_id=v_user and active for share;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  if v_price <> p_expected_price then raise exception 'Price changed' using errcode='P0002'; end if;
  return public.book_public_appointment(p_slug,p_service,p_professional,p_start,p_name,p_email,p_phone,p_terms);
end $function$;

CREATE OR REPLACE FUNCTION public.book_public_appointment(p_slug text, p_service uuid, p_professional uuid, p_start timestamp with time zone, p_name text, p_email text, p_phone text, p_terms uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_center uuid; v_user uuid; v_service public.services%rowtype; v_id uuid; v_terms uuid[]; v_offering public.professional_services%rowtype;
begin
  if p_name is null or length(trim(p_name)) not between 2 and 120 or p_email is null or length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_phone is null or p_phone !~ '^\+56[0-9]{8,18}$' then raise exception 'Invalid patient details' using errcode='22023'; end if;
  select c.id, m.user_id into v_center, v_user from public.centers c join public.services s on s.center_id=c.id and s.id=p_service and s.active join (select * from public.center_memberships where active) m on m.center_id=c.id join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=p_professional where c.slug=p_slug;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  perform 1 from public.centers where id=v_center for update;
  perform 1 from public.services where center_id=v_center and id=p_service and active for share;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  perform 1 from public.professional_services where center_id=v_center and service_id=p_service and professional_user_id=v_user and active for share;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_terms from public.public_booking_terms(p_slug,p_service,p_professional);
  if p_terms is null or cardinality(p_terms) <> cardinality(v_terms) or not (p_terms @> v_terms and v_terms @> p_terms) then raise exception 'Terms changed or not accepted' using errcode='PT409'; end if;
  if not exists (select 1 from public.public_availability(p_slug,p_service,p_professional) slot where slot.starts_at=p_start) then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  select * into strict v_service from public.services where id=p_service and center_id=v_center and active;
  select * into strict v_offering from public.professional_services where center_id=v_center and service_id=p_service and professional_user_id=v_user and active;
  insert into public.appointments(center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at, price_clp) values(v_center,v_user,v_service.id,v_service.name,trim(p_name),trim(p_email),trim(p_phone),p_start,p_start + v_offering.duration_minutes * interval '1 minute', v_offering.price_clp) returning id into v_id;
  insert into public.appointment_terms_acceptances(appointment_id,version_id) select v_id, unnest(v_terms);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION private.center_profile(center_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select jsonb_build_object('name',c.name,'description',c.description,'image_url',c.image_url,'opens_at',c.opens_at,'closes_at',c.closes_at,
 'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'duration_minutes',ps.duration_minutes,'price_clp',ps.price_clp,'professional_id',p.professional_id) order by s.name,p.display_name) from public.services s join public.professional_services ps on ps.center_id=s.center_id and ps.service_id=s.id and ps.active join public.staff_profiles p on p.user_id=ps.professional_user_id where s.center_id=c.id and s.active and exists(select 1 from public.center_memberships member where member.center_id=c.id and member.user_id=ps.professional_user_id and member.active)),'[]'::jsonb),
 'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',p.professional_id,'name',p.display_name,'description',p.description,'service_ids',coalesce((select jsonb_agg(ps.service_id order by ps.service_id) from public.professional_services ps join public.services s on s.id=ps.service_id and s.center_id=ps.center_id where ps.center_id=c.id and ps.professional_user_id=m.user_id and ps.active and s.active),'[]'::jsonb)) order by p.display_name,p.professional_id) from (select * from public.center_memberships where active) m join public.staff_profiles p on p.user_id=m.user_id where m.center_id=c.id),'[]'::jsonb)) from public.centers c where c.slug=center_slug;
$function$;

alter policy "Center administrators create services" on public.services with check ((EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = services.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'administrator'::center_role)))));

alter policy "Center administrators read own catalog" on public.services using ((EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = services.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'administrator'::center_role)))));

alter policy "Center administrators update services" on public.services using ((EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = services.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'administrator'::center_role))))) with check ((EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = services.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'administrator'::center_role)))));

alter policy "Center members read offerings" on public.professional_services using ((EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = professional_services.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

alter policy "Members create own offerings" on public.professional_services with check (((professional_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = professional_services.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['member'::center_role, 'administrator'::center_role]))))) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.center_id = professional_services.center_id) AND (s.id = professional_services.service_id) AND s.active)))));

alter policy "Members edit own offerings" on public.professional_services using (((professional_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = professional_services.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['member'::center_role, 'administrator'::center_role]))))))) with check (((professional_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = professional_services.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['member'::center_role, 'administrator'::center_role])))))));

alter policy "Staff delete permitted appointments" on public.appointments using (((EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = appointments.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role = 'administrator'::center_role) OR ((m.role = 'member'::center_role) AND (appointments.professional_user_id = m.user_id)))))) OR (EXISTS ( SELECT 1
   FROM platform_administrators
  WHERE (platform_administrators.user_id = ( SELECT auth.uid() AS uid))))));

alter policy "Staff read permitted appointments" on public.appointments using ((EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = appointments.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role = 'administrator'::center_role) OR (appointments.professional_user_id = ( SELECT auth.uid() AS uid)))))));

alter policy "Staff read their centers" on public.centers using ((id IN ( SELECT private.active_center_memberships.center_id
   FROM private.active_center_memberships
  WHERE (private.active_center_memberships.user_id = ( SELECT auth.uid() AS uid)))));

alter policy "Staff update permitted appointments" on public.appointments using ((EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = appointments.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role = 'administrator'::center_role) OR ((m.role = 'member'::center_role) AND (appointments.professional_user_id = m.user_id))))))) with check ((EXISTS ( SELECT 1
   FROM private.active_center_memberships m
  WHERE ((m.center_id = appointments.center_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role = 'administrator'::center_role) OR ((m.role = 'member'::center_role) AND (appointments.professional_user_id = m.user_id)))))));

create function private.can_manage_team(p_center uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and (exists(select 1 from public.platform_administrators where user_id=(select auth.uid())) or exists(select 1 from public.center_memberships where center_id=p_center and user_id=(select auth.uid()) and active and role='administrator'));
$$;
revoke all on function private.can_manage_team(uuid) from public,anon;
grant execute on function private.can_manage_team(uuid) to authenticated;

-- A center row is the common mutex for membership mutations and booking.
-- The trigger also protects privileged/direct SQL updates and the old editor.
create function private.guard_center_admin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.centers where id=old.center_id for update;
 if old.active and old.role='administrator' and (tg_op='DELETE' or not new.active or new.role<>'administrator') and not exists(select 1 from public.center_memberships where center_id=old.center_id and user_id<>old.user_id and active and role='administrator') then
   raise exception 'El centro debe conservar un administrador activo.' using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.guard_center_admin() from public,anon,authenticated;
create trigger center_memberships_guard_admin before update or delete on public.center_memberships for each row execute function private.guard_center_admin();

create table public.staff_invitations (
 id uuid primary key default gen_random_uuid(),
 center_id uuid not null references public.centers(id) on delete cascade,
 email text not null check(email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 display_name text not null check(length(btrim(display_name)) between 2 and 120),
 role public.center_role not null default 'member',
 status text not null default 'pending' check(status in ('pending','accepted','cancelled')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references auth.users(id),
 accepted_at timestamptz
);
create unique index staff_invitations_pending_email_idx on public.staff_invitations(center_id,email) where status='pending';
create index staff_invitations_accepted_by_idx on public.staff_invitations(accepted_by);
create table public.staff_invitation_services (
 invitation_id uuid not null references public.staff_invitations(id) on delete cascade,
 service_id uuid not null references public.services(id),
 price_clp integer not null check(price_clp>=0),
 duration_minutes integer not null check(duration_minutes>0),
 primary key(invitation_id,service_id)
);
create index staff_invitation_services_service_idx on public.staff_invitation_services(service_id);
alter table public.staff_invitations enable row level security;
alter table public.staff_invitation_services enable row level security;
revoke all on public.staff_invitations,public.staff_invitation_services from anon,authenticated;

create function public.team_list(p_center uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.can_manage_team(p_center) then raise exception 'Access denied' using errcode='42501'; end if;
 return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',p.display_name,'role',m.role,'active',m.active,'upcoming_appointments',(select count(*) from public.appointments a where a.center_id=p_center and a.professional_user_id=m.user_id and a.starts_at>now()),'services',coalesce((select jsonb_agg(s.name order by s.name) from public.professional_services ps join public.services s on s.id=ps.service_id and s.center_id=ps.center_id where ps.center_id=p_center and ps.professional_user_id=m.user_id and ps.active and s.active),'[]'::jsonb)) order by p.display_name) from public.center_memberships m join public.staff_profiles p on p.user_id=m.user_id where m.center_id=p_center),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('services',coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'price_clp',v.price_clp,'duration_minutes',v.duration_minutes)) from public.staff_invitation_services v join public.services s on s.id=v.service_id where v.invitation_id=i.id),'[]'::jsonb)) order by i.created_at desc) from public.staff_invitations i where i.center_id=p_center and i.status='pending'),'[]'::jsonb));
end $$;

create function public.team_update_member(p_center uuid,p_user uuid,p_role public.center_role,p_active boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform 1 from public.centers where id=p_center for update;
 if not private.can_manage_team(p_center) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_role is null then raise exception 'Invalid membership' using errcode='22023'; end if;
 update public.center_memberships set role=p_role,active=coalesce(p_active,active) where center_id=p_center and user_id=p_user returning to_jsonb(center_memberships) into result;
 if result is null then raise exception 'Membership not found' using errcode='P0002'; end if;
 return result;
end $$;
-- All application membership edits go through the same center lock and rules.
revoke update on public.center_memberships from authenticated;
revoke update(role) on public.center_memberships from authenticated;

create function public.team_invite(p_center uuid,p_email text,p_name text,p_role public.center_role,p_services uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.staff_invitations%rowtype; target_user uuid;
begin
 perform 1 from public.centers where id=p_center for update;
 if not private.can_manage_team(p_center) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_services is null or cardinality(p_services)>100 then raise exception 'Invalid services' using errcode='22023'; end if;
 select id into target_user from auth.users where lower(email)=lower(btrim(p_email));
 if exists(select 1 from public.center_memberships where center_id=p_center and user_id=target_user) then raise exception 'Esta cuenta ya pertenece al centro; usa reactivar si corresponde.' using errcode='23505'; end if;
 -- A duplicate request returns the original values rather than changing a live invitation.
 select * into invitation from public.staff_invitations where center_id=p_center and email=lower(btrim(p_email)) and status='pending';
 if found then return to_jsonb(invitation); end if;
 perform 1 from public.services where center_id=p_center and id=any(p_services) and active order by id for share;
 if (select count(*) from public.services where center_id=p_center and id=any(p_services) and active)<>(select count(distinct x) from unnest(p_services) x) then raise exception 'Selecciona servicios activos del centro.' using errcode='22023'; end if;
 insert into public.staff_invitations(center_id,email,display_name,role) values(p_center,lower(btrim(p_email)),btrim(p_name),p_role) returning * into invitation;
 insert into public.staff_invitation_services(invitation_id,service_id,price_clp,duration_minutes) select invitation.id,id,price_clp,duration_minutes from public.services where center_id=p_center and id=any(p_services) and active;
 return to_jsonb(invitation);
end $$;

create function public.team_invitation_action(p_center uuid,p_id uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform 1 from public.centers where id=p_center for update;
 if not private.can_manage_team(p_center) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_action not in ('resend','cancel') then raise exception 'Invalid action' using errcode='22023'; end if;
 update public.staff_invitations set status=case when p_action='cancel' then 'cancelled' else status end, expires_at=case when p_action='resend' then now()+interval '7 days' else expires_at end where id=p_id and center_id=p_center and (status='pending' or (p_action='cancel' and status='cancelled')) returning to_jsonb(staff_invitations) into result;
 if result is null then raise exception 'Pending invitation not found' using errcode='P0002'; end if;
 return result;
end $$;

create function public.accept_staff_invitation(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.staff_invitations%rowtype; v_user uuid:=(select auth.uid()); v_email text; v_center uuid; copied integer;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select center_id into v_center from public.staff_invitations where id=p_id;
 perform 1 from public.centers where id=v_center for update;
 select * into invitation from public.staff_invitations where id=p_id for update;
 select lower(email) into v_email from auth.users where id=v_user and email_confirmed_at is not null;
 if invitation.id is null or invitation.email is distinct from v_email then raise exception 'Invitation unavailable for this account' using errcode='42501'; end if;
 if invitation.status='accepted' and invitation.accepted_by=v_user then return jsonb_build_object('center_id',v_center,'accepted',true); end if;
 if invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'Invitation expired or cancelled' using errcode='22023'; end if;
 -- Existing profiles are shared and must never be overwritten by an invitation.
 insert into public.staff_profiles(user_id,display_name) values(v_user,invitation.display_name) on conflict(user_id) do nothing;
 insert into public.center_memberships(center_id,user_id,role) values(v_center,v_user,invitation.role) on conflict(center_id,user_id) do nothing;
 -- Do not reactivate an existing inactive membership through acceptance.
 if not exists(select 1 from public.center_memberships where center_id=v_center and user_id=v_user and active) then raise exception 'Membership inactive' using errcode='42501'; end if;
 perform 1 from public.services s join public.staff_invitation_services v on v.service_id=s.id where v.invitation_id=p_id and s.center_id=v_center and s.active order by s.id for share of s;
 insert into public.professional_services(center_id,professional_user_id,service_id,price_clp,duration_minutes)
 select v_center,v_user,s.id,v.price_clp,v.duration_minutes from public.staff_invitation_services v join public.services s on s.id=v.service_id and s.center_id=v_center and s.active where v.invitation_id=p_id on conflict(center_id,professional_user_id,service_id) do nothing;
 get diagnostics copied=row_count;
 update public.staff_invitations set status='accepted',accepted_by=v_user,accepted_at=now() where id=p_id;
 return jsonb_build_object('center_id',v_center,'accepted',true,'services_added',copied);
end $$;

revoke all on function public.team_list(uuid),public.team_update_member(uuid,uuid,public.center_role,boolean),public.team_invite(uuid,text,text,public.center_role,uuid[]),public.team_invitation_action(uuid,uuid,text),public.accept_staff_invitation(uuid) from public,anon;
grant execute on function public.team_list(uuid),public.team_update_member(uuid,uuid,public.center_role,boolean),public.team_invite(uuid,text,text,public.center_role,uuid[]),public.team_invitation_action(uuid,uuid,text),public.accept_staff_invitation(uuid) to authenticated;
