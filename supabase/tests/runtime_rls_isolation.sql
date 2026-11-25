begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
-- A second ordinary member in the demo center and one in a separate center.
insert into auth.users (id, aud, role, email) values
 ('30000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'rls-one@example.com'),
 ('30000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'rls-two@example.com');
insert into public.centers (id, name, slug) values ('40000000-0000-4000-8000-000000000012', 'RLS Other', 'rls-other');
insert into public.staff_profiles (user_id, professional_id, display_name) values
 ('30000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000011', 'Member One'),
 ('30000000-0000-4000-8000-000000000012', '60000000-0000-4000-8000-000000000012', 'Member Two');
insert into public.center_memberships (center_id, user_id, role) values
 ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000011', 'member'),
 ('40000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000012', 'member');
insert into public.services (id, center_id, name, price_clp, duration_minutes) values
 ('70000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000012', 'Service', 1, 30);
insert into public.appointments (id, center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at) values
 ('80000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000001', 'Service', 'Same Center', 'one@example.com', '+56912345678', '2099-01-01 12:00+00', '2099-01-01 12:30+00'),
 ('80000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000012', '70000000-0000-4000-8000-000000000012', 'Service', 'Other Center', 'two@example.com', '+56912345678', '2099-01-01 12:00+00', '2099-01-01 12:30+00');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.appointments where id in ('80000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000012')), 0::bigint, 'member cannot read same-center or cross-center appointments');
with changed as (update public.appointments set patient_name='Unauthorized' where id='80000000-0000-4000-8000-000000000011' returning 1) select is((select count(*) from changed), 0::bigint, 'member cannot update other member');
with changed as (delete from public.appointments where id='80000000-0000-4000-8000-000000000012' returning 1) select is((select count(*) from changed), 0::bigint, 'member cannot delete other center appointment');
select throws_ok($$update public.appointments set professional_user_id='30000000-0000-4000-8000-000000000011' where id='80000000-0000-4000-8000-000000000002'$$, '42501', null, 'member cannot reassign own appointment');
select is((select count(*) from public.appointments where professional_user_id <> auth.uid()), 0::bigint, 'unfiltered ownership enforced by RLS');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000011', true);
select is((select count(*) from public.appointments where id='80000000-0000-4000-8000-000000000002'), 0::bigint, 'second member cannot read first member');
select is((select count(*) from public.appointments where id='80000000-0000-4000-8000-000000000011'), 1::bigint, 'second member sees own appointment');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000012', true);
select is((select count(*) from public.appointments where id='80000000-0000-4000-8000-000000000011'), 0::bigint, 'other center cannot read same-center fixture');
reset role;
select is((select patient_name from public.appointments where id='80000000-0000-4000-8000-000000000011'), 'Same Center', 'protected update left data unchanged');
select is((select count(*) from public.appointments where id='80000000-0000-4000-8000-000000000012'), 1::bigint, 'protected delete left data unchanged');
select * from finish();
rollback;
