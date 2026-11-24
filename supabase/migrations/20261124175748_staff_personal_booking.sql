-- The caller can resolve their own public professional identifier without
-- exposing the link between other staff profiles and Auth user IDs.
create function public.staff_own_professional_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.professional_id from public.staff_profiles p where p.user_id = (select auth.uid());
$$;
revoke all on function public.staff_own_professional_id() from public, anon;
grant execute on function public.staff_own_professional_id() to authenticated;
