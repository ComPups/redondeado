-- Require the price shown to the patient and lock the offering until booking commits.
create function public.book_public_appointment_with_price(p_slug text, p_service uuid, p_professional uuid, p_start timestamptz, p_name text, p_email text, p_phone text, p_terms uuid[], p_expected_price integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_center uuid; v_user uuid; v_price integer;
begin
  if p_expected_price is null or p_expected_price < 0 then raise exception 'Invalid price' using errcode='22023'; end if;
  select c.id, m.user_id into v_center, v_user from public.centers c
    join public.center_memberships m on m.center_id=c.id
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
end $$;
revoke all on function public.book_public_appointment_with_price(text,uuid,uuid,timestamptz,text,text,text,uuid[],integer) from public,anon,authenticated;
grant execute on function public.book_public_appointment_with_price(text,uuid,uuid,timestamptz,text,text,text,uuid[],integer) to redondeado_public;
revoke execute on function public.book_public_appointment(text,uuid,uuid,timestamptz,text,text,text,uuid[]) from redondeado_public;

-- The center service fields are the canonical identity and description.
create or replace function private.center_profile(center_slug text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('name',c.name,'description',c.description,'image_url',c.image_url,'opens_at',c.opens_at,'closes_at',c.closes_at,
 'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'duration_minutes',ps.duration_minutes,'price_clp',ps.price_clp,'professional_id',p.professional_id) order by s.name,p.display_name) from public.services s join public.professional_services ps on ps.center_id=s.center_id and ps.service_id=s.id and ps.active join public.staff_profiles p on p.user_id=ps.professional_user_id where s.center_id=c.id and s.active),'[]'::jsonb),
 'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',p.professional_id,'name',p.display_name,'description',p.description,'service_ids',coalesce((select jsonb_agg(ps.service_id order by ps.service_id) from public.professional_services ps join public.services s on s.id=ps.service_id and s.center_id=ps.center_id where ps.center_id=c.id and ps.professional_user_id=m.user_id and ps.active and s.active),'[]'::jsonb)) order by p.display_name,p.professional_id) from public.center_memberships m join public.staff_profiles p on p.user_id=m.user_id where m.center_id=c.id),'[]'::jsonb)) from public.centers c where c.slug=center_slug;
$$;
