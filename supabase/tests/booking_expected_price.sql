begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
select ok(to_regprocedure('public.book_public_appointment_with_price(text,uuid,uuid,timestamptz,text,text,text,uuid[],integer)') is null, 'price checks live in the backend workflow');
select ok(not has_table_privilege('redondeado_public','public.appointments','insert'), 'public projection role cannot write patient records');
select ok(not has_table_privilege('anon','public.appointments','select'), 'anonymous clients cannot read patient records');
select ok(exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_no_professional_overlap'), 'database overlap constraint remains the final price-independent guard');
select * from finish();
rollback;
