begin;
create extension if not exists pgtap with schema extensions;
select plan(23);
-- Verify the catalog works for an existing center with no legacy assignments.
delete from public.professional_services
where center_id = '10000000-0000-4000-8000-000000000001';
insert into public.centers (id, name, slug) values
  ('10000000-0000-4000-8000-000000000099', 'Other Center', 'other-catalog-center');
insert into public.services (id, center_id, name, price_clp, duration_minutes, active) values
  ('70000000-0000-4000-8000-000000000098', '10000000-0000-4000-8000-000000000001', 'Inactive Service', 1000, 30, false),
  ('70000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099', 'Other Service', 1000, 30, true);
select ok(not has_function_privilege('anon', 'public.public_center_profile(text)', 'execute'), 'anonymous clients cannot call profile directly');
select ok(not has_function_privilege('anon', 'public.public_availability(text,uuid,uuid)', 'execute'), 'anonymous clients cannot call availability directly');
select ok(not has_function_privilege('authenticated', 'public.book_public_appointment(text,uuid,uuid,timestamptz,text,text,text)', 'execute'), 'authenticated clients cannot call booking directly');
set local role service_role;
select is(public.public_center_profile('centro-bienestar-arrayan')->>'name', 'Centro Bienestar Arrayán', 'public profile is available by slug');
select is(public.public_center_profile('centro-bienestar-arrayan')->>'opens_at', '09:00:00', 'public profile includes opening hours');
select ok(public.public_center_profile('centro-bienestar-arrayan') ? 'image_url', 'public profile includes the optional center photo');
select ok(jsonb_path_exists(public.public_center_profile('centro-bienestar-arrayan'), '$.services[*] ? (@.description != "")'), 'public catalog includes service descriptions');
select ok(jsonb_path_exists(public.public_center_profile('centro-bienestar-arrayan'), '$.professionals[*] ? (@.description != "")'), 'public catalog includes professional descriptions');
select is(public.public_center_profile('missing-center'), null::jsonb, 'unknown center is absent');
select is(jsonb_array_length(public.public_center_profile('centro-bienestar-arrayan')->'professionals'), 3, 'center professionals are listed');
select is(
  (select count(*) from jsonb_array_elements(public.public_center_profile('centro-bienestar-arrayan')->'professionals') as professional
    where professional->'service_ids' = '["70000000-0000-4000-8000-000000000001", "70000000-0000-4000-8000-000000000002", "70000000-0000-4000-8000-000000000003"]'::jsonb),
  3::bigint, 'each member offers the entire active center catalog'
);
select ok(exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001')), 'an active service has availability without an assignment');
select is((select count(*) from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000098','50000000-0000-4000-8000-000000000001')), 0::bigint, 'inactive services have no availability');
select is((select count(*) from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000099','50000000-0000-4000-8000-000000000001')), 0::bigint, 'services at another center have no availability here');
select throws_ok($$select public.book_public_appointment('other-catalog-center','70000000-0000-4000-8000-000000000099','50000000-0000-4000-8000-000000000001',now() + interval '1 day','Paciente','p@example.com','+56912345678')$$, 'P0001', null, 'booking requires a membership at the selected center');
select throws_ok($$select public.book_public_appointment('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',now(),'Paciente','p@example.com','95550123')$$, '22023', null, 'public booking requires the +56 prefix');
select throws_ok($$select public.book_public_appointment('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',now(),'Paciente','p@example.com','+569555012')$$, '22023', null, 'public booking requires eight digits after +56');
select ok(not has_table_privilege('anon', 'public.appointments', 'select'), 'patient records remain private');
select throws_ok($$select public.book_public_appointment('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',now(),'A','invalid','123')$$, '22023', null, 'patient details are validated');
select throws_ok($$select public.book_public_appointment('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',now(),'Paciente','p@example.com','+56912345678')$$, 'P0001', null, 'unavailable times cannot be booked');
select ok(exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001') where starts_at at time zone 'America/Santiago' >= date_trunc('month', now() at time zone 'America/Santiago') + interval '1 month'), 'next month has available slots');
select ok(not exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001') where starts_at at time zone 'America/Santiago' >= date_trunc('month', now() at time zone 'America/Santiago') + interval '2 months'), 'availability does not extend past next month');
-- Book a different service from the one in the professional's demo appointment.
select lives_ok($test$do $body$
declare t timestamptz;
begin
  select starts_at into strict t
  from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001')
  limit 1;
  perform public.book_public_appointment('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',t,'Paciente','p@example.com','+5695550123');
  if exists(select 1 from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001') where starts_at = t) then
    raise exception 'booked slot is still available for a different service';
  end if;
end $body$$test$, 'an anonymous patient can book any active service and the slot is blocked across services');
reset role;
select * from finish();
rollback;
