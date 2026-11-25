begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
insert into public.centers(id,name,slug) values ('10000000-0000-4000-8000-000000000099','Other center','settings-other-center');

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
with changed as (
  update public.centers set name='Centro actualizado', description=repeat('a',400), opens_at='08:30', closes_at='19:00'
  where id='10000000-0000-4000-8000-000000000001' returning 1
) select is((select count(*) from changed),1::bigint,'administrator can edit own center settings');
reset role;
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='centers' and column_name='description'),'center description remains available to the backend projection');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='centers' and column_name='opens_at'),'center opening time remains available to the backend projection');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='centers' and column_name='closes_at'),'center closing time remains available to the backend projection');
reset role;
set local role authenticated;
select throws_ok($$update public.centers set description=repeat('a',401) where id='10000000-0000-4000-8000-000000000001'$$,'23514',null,'description rejects 401 characters');
select throws_ok($$update public.centers set closes_at=opens_at where id='10000000-0000-4000-8000-000000000001'$$,'23514',null,'closing time must follow opening time');
select throws_ok($$update public.centers set slug='changed-address' where id='10000000-0000-4000-8000-000000000001'$$,'42501',null,'administrator cannot change the public address');
select throws_ok($$update public.centers set image_url='https://example.com/image.jpg' where id='10000000-0000-4000-8000-000000000001'$$,'42501',null,'administrator cannot change fields outside settings');
with changed as (update public.centers set name='Forbidden' where id='10000000-0000-4000-8000-000000000099' returning 1)
select is((select count(*) from changed),0::bigint,'administrator cannot edit a different center');

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
with changed as (update public.centers set name='Forbidden' returning 1)
select is((select count(*) from changed),0::bigint,'member cannot edit center settings');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
with changed as (update public.centers set name='Forbidden' returning 1)
select is((select count(*) from changed),0::bigint,'limited staff cannot edit center settings');
set local role anon;
select throws_ok($$update public.centers set name='Forbidden'$$,'42501',null,'anonymous users cannot edit centers');
reset role;
select is((select slug from public.centers where id='10000000-0000-4000-8000-000000000001'),'centro-bienestar-arrayan','profile URL remains unchanged');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
with changed as (update public.centers set slug='platform-edited-address', image_url='https://example.com/center.jpg' where id='10000000-0000-4000-8000-000000000099' returning 1)
select is((select count(*) from changed),1::bigint,'platform editor retains its existing field access');
reset role;
select * from finish();
rollback;
