begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='service_name'), 'appointment service name is a stored snapshot');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='price_clp'), 'appointment price is a stored snapshot');
select ok(exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_valid_time'), 'appointment duration remains constrained');
select ok(exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_service_center_fk'), 'appointment service remains tied to its center');
select * from finish();
rollback;
