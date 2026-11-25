begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Public booking is an HTTP workflow now; these tests protect the database
-- boundary it relies on without reintroducing a callable booking RPC.
select ok(to_regprocedure('public.book_public_appointment(text,uuid,uuid,timestamptz,text,text,text,uuid[])') is null, 'public booking workflow is not a database function');
select ok(to_regprocedure('public.book_public_appointment_with_price(text,uuid,uuid,timestamptz,text,text,text,uuid[],integer)') is null, 'price validation is not a database function');
select ok(to_regprocedure('public.public_availability(text,uuid,uuid)') is null, 'availability generation is not a database function');
select ok(to_regprocedure('public.public_center_profile(text)') is null, 'public profile projection is not a database function');
select ok(to_regprocedure('public.public_booking_terms(text,uuid,uuid)') is null, 'public terms projection is not a database function');
select ok(not has_table_privilege('anon', 'public.appointments', 'select'), 'patient records remain private from anon');
select ok(not has_table_privilege('authenticated', 'public.appointments', 'insert'), 'patient writes are not exposed to authenticated clients');
select ok(not has_column_privilege('redondeado_backend', 'public.appointments', 'patient_email', 'select'), 'backend overlap checks cannot read patient email');
select ok(has_column_privilege('redondeado_backend', 'public.appointments', 'starts_at', 'select') and has_column_privilege('redondeado_backend', 'public.appointments', 'ends_at', 'select'), 'backend overlap checks retain only schedule columns');
select ok((select relrowsecurity from pg_class where oid='public.appointments'::regclass), 'appointments retain RLS');
select ok(exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and contype='x'), 'professional overlap protection remains a database constraint');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='price_clp'), 'booking price snapshot remains stored on appointments');
select ok(exists(select 1 from pg_constraint where conrelid='public.appointment_terms_acceptances'::regclass and contype='p'), 'term acceptances retain an immutable primary key');
select ok((select relrowsecurity from pg_class where oid='public.booking_terms_current'::regclass), 'current terms pointers retain RLS');

select * from finish();
rollback;
