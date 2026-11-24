begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
insert into public.services (id, center_id, name, price_clp, duration_minutes) values
  ('70000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000001', 'Servicio nuevo', 10000, 30);
set local role anon;
select is(public.public_center_profile('centro-bienestar-arrayan')->>'name', 'Centro Bienestar Arrayán', 'public profile is available by slug');
select is(public.public_center_profile('missing-center'), null::jsonb, 'unknown center is absent');
select is(jsonb_array_length(public.public_center_profile('centro-bienestar-arrayan')->'professionals'), 3, 'center professionals are listed');
select is((select count(*) from jsonb_array_elements(public.public_center_profile('centro-bienestar-arrayan')->'professionals') p where jsonb_array_length(p->'service_ids') = 4), 3::bigint, 'every professional offers all active services');
select ok(exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000099','50000000-0000-4000-8000-000000000002')), 'new services are offered without assignments');
select is((select count(*) from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000099','50000000-0000-4000-8000-000000000099')), 0::bigint, 'new service remains restricted to center professionals');
select ok(exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001')), 'previously unassigned service has availability');
select is((select count(*) from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000099')), 0::bigint, 'unknown professional has no availability');
select throws_ok($$select public.book_public_appointment('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000099',now() + interval '1 day','Paciente','p@example.com','+56912345678')$$, 'P0001', null, 'unknown professional cannot be booked');
select throws_ok($$select patient_email from public.appointments$$, '42501', null, 'patient records remain private');
select throws_ok($$select public.book_public_appointment('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',now(),'A','invalid','123')$$, '22023', null, 'patient details are validated');
select throws_ok($$select public.book_public_appointment('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',now(),'Paciente','p@example.com','+56912345678')$$, 'P0001', null, 'unavailable times cannot be booked');
select ok(exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001') where starts_at at time zone 'America/Santiago' >= date_trunc('month', now() at time zone 'America/Santiago') + interval '1 month'), 'next month has available slots');
select ok(not exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001') where starts_at at time zone 'America/Santiago' >= date_trunc('month', now() at time zone 'America/Santiago') + interval '2 months'), 'availability does not extend past next month');
reset role;
-- Test a real available slot, when any remain in the current month.
select case when exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')) then
  lives_ok($test$do $body$ declare t timestamptz; begin
    select starts_at into t from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001') limit 1;
    perform public.book_public_appointment('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',t,'Paciente','p@example.com','+56912345678');
    if exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001') where starts_at = t) then raise exception 'booked slot still available'; end if;
  end $body$$test$, 'booking persists and removes the slot')
  else skip('No future slots remain in this booking month', 1) end;
select * from finish();
rollback;
