-- Passwords are provisioned separately via the deployment secret process.
-- NOINHERIT forces the API to choose a fixed role for every transaction.
create role redondeado_api login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role redondeado_public nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant authenticated, redondeado_public to redondeado_api;

-- Public access is limited to the existing booking projections and operation.
-- Keep service_role grants during the compatibility window for rollback.
grant usage on schema public, private to redondeado_public;
grant execute on function private.center_profile(text) to redondeado_public;
grant execute on function public.public_center_profile(text),
  public.public_availability(text, uuid, uuid),
  public.public_booking_terms(text, uuid, uuid),
  public.book_public_appointment(text, uuid, uuid, timestamptz, text, text, text, uuid[])
  to redondeado_public;
