begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
select ok(not has_function_privilege('redondeado_public','public.book_public_appointment(text,uuid,uuid,timestamptz,text,text,text,uuid[])','execute'), 'public role cannot bypass the price check');
select ok(has_function_privilege('redondeado_public','public.book_public_appointment_with_price(text,uuid,uuid,timestamptz,text,text,text,uuid[],integer)','execute'), 'public role can call the price-checked booking');
select throws_ok($$select public.book_public_appointment_with_price('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002', (select starts_at from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002') limit 1), 'Paciente','stale@example.com','+56912345678', (select coalesce(array_agg(id),'{}'::uuid[]) from public.public_booking_terms('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')), 1)$$, 'P0002', null, 'changed prices reject the booking');
select is((select count(*) from public.appointments where patient_email='stale@example.com'),0::bigint,'a stale price creates no appointment');
select * from finish();
rollback;
