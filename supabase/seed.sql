-- Fictional local demo data only. Never use these credentials in production.
insert into public.centers (id, name, slug) values
  ('10000000-0000-4000-8000-000000000001', 'Centro Bienestar Arrayán', 'centro-bienestar-arrayan');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
       extensions.crypt('Demo-Arrayan-2026!', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
from (values
  ('20000000-0000-4000-8000-000000000001'::uuid, 'camila.rojas@example.com'),
  ('20000000-0000-4000-8000-000000000002'::uuid, 'matias.soto@example.com'),
  ('20000000-0000-4000-8000-000000000003'::uuid, 'valentina.munoz@example.com')
) as staff(id, email);

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, jsonb_build_object('sub', id::text, 'email', email), 'email', id::text, now(), now(), now()
from auth.users where id in (
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003'
);

insert into public.staff_profiles (user_id, display_name) values
  ('20000000-0000-4000-8000-000000000001', 'Camila Rojas'),
  ('20000000-0000-4000-8000-000000000002', 'Matías Soto'),
  ('20000000-0000-4000-8000-000000000003', 'Valentina Muñoz');
insert into public.center_memberships (center_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'administrator'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'member'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'limited');
