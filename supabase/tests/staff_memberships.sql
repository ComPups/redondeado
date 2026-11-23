begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select is((select count(*) from auth.users where email in ('camila.rojas@example.com', 'matias.soto@example.com', 'valentina.munoz@example.com') and encrypted_password = extensions.crypt('Demo-Arrayan-2026!', encrypted_password) and email_confirmed_at is not null), 3::bigint, 'demo accounts have confirmed password credentials');
select is((select count(*) from auth.identities where user_id in ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003') and provider = 'email'), 3::bigint, 'demo accounts have email identities');
select is((select count(distinct role) from public.center_memberships where center_id = '10000000-0000-4000-8000-000000000001'), 3::bigint, 'demo center has all three roles');

-- Separate, fictional authorization fixtures: two centers, two members in
-- the first, and a different administrator in each center.
insert into auth.users (id, aud, role, email) values
 ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin.norte@example.com'),
 ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'miembro.uno@example.com'),
 ('30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'miembro.dos@example.com'),
 ('30000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin.sur@example.com');
insert into public.centers (id, name, slug) values
 ('40000000-0000-4000-8000-000000000001', 'Centro Norte de Prueba', 'fixture-norte'),
 ('40000000-0000-4000-8000-000000000002', 'Centro Sur de Prueba', 'fixture-sur');
insert into public.staff_profiles (user_id, display_name) values
 ('30000000-0000-4000-8000-000000000001', 'Andrea Silva'),
 ('30000000-0000-4000-8000-000000000002', 'Francisco Díaz'),
 ('30000000-0000-4000-8000-000000000003', 'Josefa Pérez'),
 ('30000000-0000-4000-8000-000000000004', 'Tomás Araya');
insert into public.center_memberships (center_id, user_id, role) values
 ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'administrator'),
 ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'member'),
 ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'member'),
 ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'administrator');
select throws_ok($$insert into public.center_memberships values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'limited')$$, '23505', null, 'membership pair is unique');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.center_memberships), 1::bigint, 'member sees only own membership');
select is((select role::text from public.center_memberships), 'member', 'member role is available');
select is((select count(*) from public.centers), 1::bigint, 'member sees only their center');
select is((select slug from public.centers), 'fixture-norte', 'member sees the correct center');
select ok(not has_table_privilege('authenticated', 'public.center_memberships', 'INSERT'), 'member cannot administer memberships');
select ok(not has_table_privilege('authenticated', 'auth.users', 'SELECT'), 'private auth accounts are not exposed');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
select is((select slug from public.centers), 'fixture-sur', 'other center administrator is isolated');
select is((select role::text from public.center_memberships), 'administrator', 'administrator role is available');
set local role anon;
select is((select display_name from public.staff_profiles where user_id = '30000000-0000-4000-8000-000000000002'), 'Francisco Díaz', 'public can identify a professional by display name');
select ok(not has_table_privilege('anon', 'public.center_memberships', 'SELECT'), 'anonymous users cannot read memberships');
select * from finish();
rollback;
