begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select throws_ok($$update public.appointments set service_name = 'Altered' where id = '80000000-0000-4000-8000-000000000002'$$, '42501', null, 'member cannot alter service snapshot directly');
select throws_ok($$update public.appointments set starts_at = now() - interval '1 day', ends_at = now() - interval '15 minutes' where id = '80000000-0000-4000-8000-000000000002'$$, '22023', null, 'past rescheduling is rejected');
select throws_ok($$update public.appointments set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '2 hours' where id = '80000000-0000-4000-8000-000000000002'$$, '22023', null, 'staff cannot change duration');
select lives_ok($test$do $body$ declare t timestamptz; begin
  select starts_at into t from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002') limit 1;
  if t is null then raise exception 'No available slot'; end if;
  update public.appointments set starts_at = t, ends_at = t + interval '45 minutes' where id = '80000000-0000-4000-8000-000000000002';
end $body$$test$, 'member can reschedule to an available slot');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select throws_ok($$update public.appointments set professional_user_id = '20000000-0000-4000-8000-000000000001' where id = '80000000-0000-4000-8000-000000000002'$$, '42501', null, 'center admin cannot change professional directly');
select * from finish();
rollback;
