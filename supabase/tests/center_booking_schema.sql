begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select is((select count(*) from public.services where center_id = '10000000-0000-4000-8000-000000000001'), 3::bigint, 'demo has three services');
select is((select count(*) from public.appointments where center_id = '10000000-0000-4000-8000-000000000001'), 3::bigint, 'demo has three appointments');
select is((select count(*) from public.appointments where professional_user_id = '20000000-0000-4000-8000-000000000001'), 1::bigint, 'administrator takes appointments');
select throws_ok($$update public.centers set closes_at = opens_at where slug = 'centro-bienestar-arrayan'$$, '23514', null, 'closing time must follow opening time');
select throws_ok($$update public.centers set description = repeat('x', 401) where slug = 'centro-bienestar-arrayan'$$, '23514', null, 'description is limited to 400 characters');
select throws_ok($$update public.services set duration_minutes = 0 where id = '70000000-0000-4000-8000-000000000001'$$, '23514', null, 'service duration must be positive');
select throws_ok($$update public.services set price_clp = -1 where id = '70000000-0000-4000-8000-000000000001'$$, '23514', null, 'price cannot be negative');

insert into public.centers (id, name, slug) values ('90000000-0000-4000-8000-000000000001', 'Centro de Prueba', 'centro-prueba');
insert into public.center_memberships (center_id, user_id, role) values
 ('90000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'member');
insert into public.services (id, center_id, name, price_clp, duration_minutes, active) values
 ('90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'Consulta de prueba', 10000, 60, true),
 ('90000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000001', 'Servicio inactivo', 10000, 60, false);

insert into public.appointments (center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'Consulta de psicología', 'Paciente de prueba', 'paciente@example.com', '+56955501004', '2040-01-10 12:00Z', '2040-01-10 13:00Z');
select throws_ok($$insert into public.appointments (center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at) values ('90000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 'Consulta', 'Paciente', 'paciente@example.com', '123', '2040-01-10 12:30Z', '2040-01-10 13:30Z')$$, '23P01', null, 'overlap is rejected across centers for the same professional');
select lives_ok($$insert into public.appointments (center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at) values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'Consulta', 'Paciente', 'paciente@example.com', '123', '2040-01-10 13:00Z', '2040-01-10 14:00Z')$$, 'adjacent appointments are allowed');
select lives_ok($$insert into public.appointments (center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at) values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', 'Consulta', 'Paciente', 'paciente@example.com', '123', '2040-01-10 12:00Z', '2040-01-10 13:00Z')$$, 'different professionals can book the same time');
select throws_ok($$insert into public.appointments (center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at) values ('90000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', 'Consulta', 'Paciente', 'paciente@example.com', '123', '2040-01-11 12:00Z', '2040-01-11 13:00Z')$$, '23503', null, 'professional must belong to appointment center');
select throws_ok($$insert into public.appointments (center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at) values ('90000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'Consulta', 'Paciente', 'paciente@example.com', '123', '2040-01-11 12:00Z', '2040-01-11 13:00Z')$$, '23503', null, 'service must belong to appointment center');
select throws_ok($$update public.appointments set ends_at = starts_at where id = '80000000-0000-4000-8000-000000000001'$$, '23514', null, 'appointment end must follow start');
update public.services set name = 'Servicio actualizado', duration_minutes = 30 where id = '70000000-0000-4000-8000-000000000001';
select is((select service_name from public.appointments where id = '80000000-0000-4000-8000-000000000001'), 'Consulta de psicología', 'service changes preserve booked service name');
select is((select extract(epoch from ends_at - starts_at)::integer from public.appointments where id = '80000000-0000-4000-8000-000000000001'), 3600, 'service changes preserve booked duration');
set local role anon;
select is((select count(*) from public.services where id = '90000000-0000-4000-8000-000000000003'), 0::bigint, 'inactive services are not public');
select throws_ok($$select patient_email from public.appointments$$, '42501', null, 'anonymous users cannot access patient details');
select * from finish();
rollback;
