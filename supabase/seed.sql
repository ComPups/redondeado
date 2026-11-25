-- Fictional local demo data only. Never use these credentials in production.
insert into public.centers (id, name, slug, description, opens_at, closes_at) values
  ('10000000-0000-4000-8000-000000000001', 'Centro Bienestar Arrayán', 'centro-bienestar-arrayan',
   'Un espacio de atención integral para cuidar tu bienestar en Santiago.', '09:00', '18:00');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
       extensions.crypt('Demo-Arrayan-2026!', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
from (values
  ('20000000-0000-4000-8000-000000000001'::uuid, 'camila.rojas@example.com'),
  ('20000000-0000-4000-8000-000000000002'::uuid, 'matias.soto@example.com'),
  ('20000000-0000-4000-8000-000000000003'::uuid, 'valentina.munoz@example.com'),
  ('20000000-0000-4000-8000-000000000004'::uuid, 'plataforma@example.com')
) as staff(id, email);

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, jsonb_build_object('sub', id::text, 'email', email), 'email', id::text, now(), now(), now()
from auth.users where id in (
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004'
);

insert into public.platform_administrators (user_id) values ('20000000-0000-4000-8000-000000000004');

insert into public.staff_profiles (user_id, professional_id, display_name, description) values
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Camila Rojas', 'Acompaña a personas adultas en el manejo del estrés y el cuidado de su salud emocional.'),
  ('20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Matías Soto', 'Trabaja con cada persona para establecer hábitos de alimentación que se adapten a su rutina.'),
  ('20000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 'Valentina Muñoz', 'Se enfoca en la recuperación del movimiento y el retorno progresivo a las actividades cotidianas.');
insert into public.center_memberships (center_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'administrator'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'member'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'limited');


insert into public.services (id, center_id, name, price_clp, duration_minutes, description) values
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Consulta de psicología', 35000, 60, 'Conversación clínica para revisar lo que te preocupa y acordar objetivos de acompañamiento.'),
  ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Consulta nutricional', 30000, 45, 'Evaluación de tus hábitos y necesidades para definir un plan de alimentación personalizado.'),
  ('70000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Sesión de kinesiología', 28000, 45, 'Evaluación de movilidad y ejercicios guiados según tu lesión o motivo de consulta.');

insert into public.professional_services(center_id,professional_user_id,service_id,price_clp,duration_minutes)
select s.center_id,m.user_id,s.id,s.price_clp,s.duration_minutes from public.services s join public.center_memberships m on m.center_id=s.center_id where s.active;

-- Fixed examples inside the current booking month, in the center's time zone.
-- They are fictional and may be in the past near the end of that month.
insert into public.appointments (id, center_id, professional_user_id, service_id, service_name,
  patient_name, patient_email, patient_phone, starts_at, ends_at)
select id, '10000000-0000-4000-8000-000000000001', professional_user_id, service_id, service_name,
  patient_name, patient_email, patient_phone,
  (date_trunc('month', now() at time zone 'America/Santiago')::date + start_time + day_offset * interval '1 day') at time zone 'America/Santiago',
  (date_trunc('month', now() at time zone 'America/Santiago')::date + start_time + day_offset * interval '1 day' + duration * interval '1 minute') at time zone 'America/Santiago'
from (values
  ('80000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, '70000000-0000-4000-8000-000000000001'::uuid, 'Consulta de psicología', 'Antonia González', 'antonia.gonzalez@example.com', '+56955501001', 10, time '10:00', 60),
  ('80000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '70000000-0000-4000-8000-000000000002'::uuid, 'Consulta nutricional', 'Diego Morales', 'diego.morales@example.com', '+56955501002', 10, time '10:00', 45),
  ('80000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000003'::uuid, '70000000-0000-4000-8000-000000000003'::uuid, 'Sesión de kinesiología', 'Francisca Herrera', 'francisca.herrera@example.com', '+56955501003', 14, time '15:00', 45)
) as demo(id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, day_offset, start_time, duration);

-- Fictional demo text for testing only; do not publish as production terms.
insert into public.booking_terms_versions (id, center_id, professional_user_id, service_id, body) values
  ('90000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', null, null,
   'Términos de demostración del centro: esta reserva es ficticia y se utiliza únicamente para probar el sistema.'),
  ('90000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   'Términos de demostración de Camila Rojas para consulta de psicología: el horario y las condiciones son ficticios.');
insert into public.booking_terms_current (center_id, professional_user_id, service_id, version_id) values
  ('10000000-0000-4000-8000-000000000001', null, null, '90000000-0000-4000-8000-000000000010'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000011');
