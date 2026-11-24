revoke execute on function public.public_center_profile(text) from public, anon, authenticated;
revoke execute on function public.public_availability(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.book_public_appointment(text, uuid, uuid, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.public_center_profile(text), public.public_availability(text, uuid, uuid), public.book_public_appointment(text, uuid, uuid, timestamptz, text, text, text) to service_role;
