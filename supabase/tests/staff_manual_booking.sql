begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.staff_booking_professionals('10000000-0000-4000-8000-000000000001')), 1::bigint, 'member may select only themselves');
select throws_ok($$select public.book_staff_appointment('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',now(),'Paciente','p@example.com','+56912345678')$$, '42501', null, 'member cannot book for another professional');
select lives_ok($test$do $body$ declare t timestamptz; v_id uuid; begin
  select starts_at into t from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002') limit 1;
  if t is null then raise exception 'No available slot for test'; end if;
  v_id := public.book_staff_appointment('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',t,'Paciente Prueba','p@example.com','+56912345678');
  if not exists (select 1 from public.appointments where id = v_id and professional_user_id = auth.uid()) then raise exception 'Booking missing from member agenda'; end if;
end $body$$test$, 'member books an available slot and sees it in their agenda');
select throws_ok($$select public.book_staff_appointment('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',now(),'Paciente','p@example.com','+56912345678')$$, 'P0001', null, 'unavailable slot rejected');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.staff_booking_professionals('10000000-0000-4000-8000-000000000001')), 0::bigint, 'limited user cannot book');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.staff_booking_professionals('10000000-0000-4000-8000-000000000001')), 3::bigint, 'administrator can select center professionals');
select lives_ok($test$do $body$ declare t timestamptz; begin
  select starts_at into t from public.public_availability('centro-bienestar-arrayan','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003') limit 1;
  if t is null then raise exception 'No available slot for test'; end if;
  perform public.book_staff_appointment('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',t,'Paciente Prueba','p@example.com','+56912345678');
end $body$$test$, 'administrator can book for another professional');
select * from finish();
rollback;
