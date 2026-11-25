-- The catalog belongs to the center; each professional controls their offering.
create unique index services_center_active_name_idx on public.services(center_id, lower(btrim(name))) where active;
alter table public.professional_services
  add column price_clp integer check (price_clp >= 0),
  add column duration_minutes integer check (duration_minutes > 0),
  add column active boolean not null default true;
insert into public.professional_services(center_id, professional_user_id, service_id, price_clp, duration_minutes)
select s.center_id, m.user_id, s.id, s.price_clp, s.duration_minutes
from public.services s join public.center_memberships m on m.center_id=s.center_id where s.active
on conflict (center_id, professional_user_id, service_id) do update set price_clp=excluded.price_clp, duration_minutes=excluded.duration_minutes;
-- Legacy assignments can also point to inactive catalog entries.
update public.professional_services ps set price_clp=s.price_clp, duration_minutes=s.duration_minutes
from public.services s where s.center_id=ps.center_id and s.id=ps.service_id and ps.price_clp is null;
alter table public.professional_services alter column price_clp set not null, alter column duration_minutes set not null;
create index professional_services_owner_idx on public.professional_services(center_id, professional_user_id) where active;
alter table public.appointments add column price_clp integer check (price_clp >= 0);

grant select, insert, update on public.professional_services to authenticated;
create policy "Center members read offerings" on public.professional_services for select to authenticated using (
 exists (select 1 from public.center_memberships m where m.center_id=professional_services.center_id and m.user_id=(select auth.uid())));
create policy "Members create own offerings" on public.professional_services for insert to authenticated with check (
 professional_user_id=(select auth.uid()) and exists(select 1 from public.center_memberships m where m.center_id=professional_services.center_id and m.user_id=(select auth.uid()) and m.role in ('member','administrator'))
 and exists(select 1 from public.services s where s.center_id=professional_services.center_id and s.id=professional_services.service_id and s.active));
create policy "Members edit own offerings" on public.professional_services for update to authenticated using (
 professional_user_id=(select auth.uid()) and exists(select 1 from public.center_memberships m where m.center_id=professional_services.center_id and m.user_id=(select auth.uid()) and m.role in ('member','administrator'))) with check (
 professional_user_id=(select auth.uid()) and exists(select 1 from public.center_memberships m where m.center_id=professional_services.center_id and m.user_id=(select auth.uid()) and m.role in ('member','administrator')));
revoke update on public.professional_services from authenticated;
grant update (price_clp,duration_minutes,active) on public.professional_services to authenticated;
grant insert on public.services to authenticated;
create policy "Center administrators create services" on public.services for insert to authenticated with check (
 exists(select 1 from public.center_memberships m where m.center_id=services.center_id and m.user_id=(select auth.uid()) and m.role='administrator'));
create policy "Center administrators read own catalog" on public.services for select to authenticated using (
 exists(select 1 from public.center_memberships m where m.center_id=services.center_id and m.user_id=(select auth.uid()) and m.role='administrator'));
create policy "Center administrators update services" on public.services for update to authenticated using (
 exists(select 1 from public.center_memberships m where m.center_id=services.center_id and m.user_id=(select auth.uid()) and m.role='administrator')) with check (
 exists(select 1 from public.center_memberships m where m.center_id=services.center_id and m.user_id=(select auth.uid()) and m.role='administrator'));

-- Serialize offering creation/reactivation with catalog deactivation.
create function private.check_offering_catalog_active() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.active then
    perform 1 from public.services where center_id=new.center_id and id=new.service_id and active for share;
    if not found then raise exception 'Service is not active' using errcode='23514'; end if;
  end if;
  return new;
end $$;
revoke all on function private.check_offering_catalog_active() from public,anon,authenticated;
create trigger professional_services_check_catalog before insert or update of active on public.professional_services for each row execute function private.check_offering_catalog_active();

-- Deactivating a catalog service retires every offering without deleting bookings.
create function private.deactivate_service_offerings() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.active and not new.active then
    update public.professional_services set active=false where center_id=new.center_id and service_id=new.id and active;
  end if;
  return new;
end $$;
revoke all on function private.deactivate_service_offerings() from public,anon,authenticated;
create trigger services_deactivate_offerings after update of active on public.services for each row execute function private.deactivate_service_offerings();

create or replace function private.center_profile(center_slug text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('name',c.name,'description',c.description,'image_url',c.image_url,'opens_at',c.opens_at,'closes_at',c.closes_at,
 'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'duration_minutes',ps.duration_minutes,'price_clp',ps.price_clp,'professional_id',p.professional_id) order by s.name,p.display_name) from public.services s join public.professional_services ps on ps.center_id=s.center_id and ps.service_id=s.id and ps.active join public.staff_profiles p on p.user_id=ps.professional_user_id where s.center_id=c.id and s.active),'[]'::jsonb),
 'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',p.professional_id,'name',p.display_name,'description',p.description,'service_ids',coalesce((select jsonb_agg(ps.service_id order by ps.service_id) from public.professional_services ps join public.services s on s.id=ps.service_id and s.center_id=ps.center_id where ps.center_id=c.id and ps.professional_user_id=m.user_id and ps.active and s.active),'[]'::jsonb)) order by p.display_name,p.professional_id) from public.center_memberships m join public.staff_profiles p on p.user_id=m.user_id where m.center_id=c.id),'[]'::jsonb)) from public.centers c where c.slug=center_slug;
$$;
create or replace function public.public_availability(p_slug text,p_service uuid,p_professional uuid) returns table(starts_at timestamptz) language sql stable security definer set search_path='' as $$
select candidate at time zone 'America/Santiago' from public.centers c join public.services s on s.center_id=c.id and s.id=p_service and s.active join public.professional_services ps on ps.center_id=c.id and ps.service_id=s.id and ps.active join public.staff_profiles p on p.user_id=ps.professional_user_id and p.professional_id=p_professional
cross join lateral generate_series(date_trunc('month',now() at time zone 'America/Santiago'),date_trunc('month',now() at time zone 'America/Santiago')+interval '2 months'-interval '1 day',interval '1 day') day
cross join lateral generate_series(day+c.opens_at,day+c.closes_at-ps.duration_minutes*interval '1 minute',interval '30 minutes') candidate
where c.slug=p_slug and candidate at time zone 'America/Santiago'>now() and not exists(select 1 from public.appointments a where a.professional_user_id=ps.professional_user_id and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(candidate at time zone 'America/Santiago',(candidate+ps.duration_minutes*interval '1 minute') at time zone 'America/Santiago','[)')) order by 1;
$$;

create or replace function public.book_public_appointment(p_slug text, p_service uuid, p_professional uuid, p_start timestamptz, p_name text, p_email text, p_phone text, p_terms uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_center uuid; v_user uuid; v_service public.services%rowtype; v_id uuid; v_terms uuid[]; v_offering public.professional_services%rowtype;
begin
  if p_name is null or length(trim(p_name)) not between 2 and 120 or p_email is null or length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_phone is null or p_phone !~ '^\+56[0-9]{8,18}$' then raise exception 'Invalid patient details' using errcode='22023'; end if;
  select c.id, m.user_id into v_center, v_user from public.centers c join public.services s on s.center_id=c.id and s.id=p_service and s.active join public.center_memberships m on m.center_id=c.id join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=p_professional where c.slug=p_slug;
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
end $$;

create or replace function public.book_staff_appointment(p_center_id uuid, p_service uuid, p_professional uuid, p_start timestamptz, p_name text, p_email text, p_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
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
    join public.center_memberships m on m.center_id=c.id
    join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=p_professional
    where c.id=p_center_id;
  if not found then raise exception 'Slot unavailable' using errcode='P0001'; end if;
  perform 1 from public.centers where id=p_center_id for update;
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
end $$;
create function public.staff_booking_offerings(p_center_id uuid) returns table(id uuid,name text,duration_minutes integer,professional_id uuid) language sql stable security definer set search_path='' as $$
select s.id,s.name,ps.duration_minutes,p.professional_id from public.professional_services ps join public.services s on s.center_id=ps.center_id and s.id=ps.service_id and s.active join public.staff_profiles p on p.user_id=ps.professional_user_id where ps.center_id=p_center_id and ps.active and exists(select 1 from public.staff_booking_professionals(p_center_id) allowed where allowed.id=p.professional_id) order by s.name;
$$;
revoke all on function public.staff_booking_offerings(uuid) from public,anon;
grant execute on function public.staff_booking_offerings(uuid) to authenticated;
