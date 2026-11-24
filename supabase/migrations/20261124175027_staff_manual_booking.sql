-- Only administrators can book for other professionals. Members book for themselves.
create function public.staff_booking_professionals(p_center_id uuid)
returns table(id uuid, name text) language sql stable security definer set search_path = '' as $$
  select p.professional_id, p.display_name
  from public.center_memberships m join public.staff_profiles p on p.user_id = m.user_id
  where m.center_id = p_center_id and (
    exists (select 1 from public.platform_administrators pa where pa.user_id = (select auth.uid()))
    or exists (select 1 from public.center_memberships actor where actor.center_id = p_center_id and actor.user_id = (select auth.uid()) and (actor.role = 'administrator' or (actor.role = 'member' and m.user_id = actor.user_id)))
  ) order by p.display_name;
$$;
revoke all on function public.staff_booking_professionals(uuid) from public, anon;
grant execute on function public.staff_booking_professionals(uuid) to authenticated;

create function public.book_staff_appointment(p_center_id uuid, p_service uuid, p_professional uuid, p_start timestamptz, p_name text, p_email text, p_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_slug text;
begin
  if not exists (select 1 from public.staff_booking_professionals(p_center_id) p where p.id = p_professional) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select c.slug into v_slug from public.centers c where c.id = p_center_id;
  return public.book_public_appointment(v_slug, p_service, p_professional, p_start, p_name, p_email, p_phone);
end;
$$;
revoke all on function public.book_staff_appointment(uuid, uuid, uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.book_staff_appointment(uuid, uuid, uuid, timestamptz, text, text, text) to authenticated;
