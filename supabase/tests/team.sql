begin;
create extension if not exists pgtap with schema extensions;
-- Test-only grants roll back with the fixtures below.
grant redondeado_backend to postgres;
grant usage on schema extensions to redondeado_backend;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('a0000000-0000-4000-8000-000000000001','equipo.admin@example.com',now(),'authenticated','authenticated'),
 ('a0000000-0000-4000-8000-000000000002','equipo.new@example.com',now(),'authenticated','authenticated');
insert into public.staff_profiles(user_id,display_name) values ('a0000000-0000-4000-8000-000000000001','Admin Equipo');
insert into public.centers(id,name,slug) values ('a0000000-0000-4000-8000-000000000010','Equipo','equipo-test');
insert into public.center_memberships(center_id,user_id,role) values ('a0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','administrator');
insert into public.services(id,center_id,name,price_clp,duration_minutes) values ('a0000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000010','Consulta',35000,60);
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select lives_ok($$insert into public.staff_profiles(user_id,display_name) values ('a0000000-0000-4000-8000-000000000002','Nueva Persona')$$,'team manager can create a shared profile');
select lives_ok($$insert into public.center_memberships(center_id,user_id,role) values ('a0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000002','member')$$,'team manager can create a member');
select lives_ok($$insert into public.professional_services(center_id,professional_user_id,service_id,price_clp,duration_minutes) values ('a0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000020',35000,60)$$,'team manager can snapshot an offering');
select lives_ok($$insert into public.team_provisioning_requests(request_id,center_id,email,user_id) values ('a0000000-0000-4000-8000-000000000099','a0000000-0000-4000-8000-000000000010','equipo.new@example.com','a0000000-0000-4000-8000-000000000002')$$,'team manager can persist idempotency metadata');
select is((select price_clp from public.professional_services where professional_user_id='a0000000-0000-4000-8000-000000000002'),35000,'offering price is a snapshot');
select ok(not has_column_privilege('authenticated','public.center_memberships','center_id','UPDATE'),'center_id is not writable by authenticated staff');
select throws_ok($$update public.center_memberships set center_id='a0000000-0000-4000-8000-000000000099' where center_id='a0000000-0000-4000-8000-000000000010' and user_id='a0000000-0000-4000-8000-000000000002'$$,'42501',null,'staff cannot reassign a membership to another center');
select throws_ok($$update public.center_memberships set role='member' where center_id='a0000000-0000-4000-8000-000000000010' and user_id='a0000000-0000-4000-8000-000000000001'$$,'23514',null,'last administrator cannot be demoted');
select lives_ok($$update public.center_memberships set role='limited',active=false where center_id='a0000000-0000-4000-8000-000000000010' and user_id='a0000000-0000-4000-8000-000000000002'$$,'team manager can deactivate a non-admin');
reset role;
set local role redondeado_backend;
select set_config('request.redondeado.context','public',true);
select is((select count(*) from public.center_memberships where center_id='a0000000-0000-4000-8000-000000000010'),1::bigint,'backend workflows exclude inactive memberships');
select is((select count(*) from public.professional_services where center_id='a0000000-0000-4000-8000-000000000010'),0::bigint,'backend profiles and availability exclude inactive staff offerings');
reset role;
select * from finish();
rollback;
