import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, TEST_API_URL: api = 'http://127.0.0.1:3000' } = process.env;
const jwtSecret = process.env.TEST_JWT_SECRET;
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!url || !key || !jwtSecret || !adminUrl) throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, local TEST_JWT_SECRET and isolated TEST_ADMIN_DATABASE_URL');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await client.auth.signInWithPassword({ email: 'matias.soto@example.com', password: 'Demo-Arrayan-2026!' });
assert.ifError(login.error);
const token = login.data.session.access_token;
try {
  for (const [path, options] of [
    ['/rest/v1/appointments?select=id', {}],
    ['/rest/v1/rpc/public_center_profile', { method: 'POST', body: JSON.stringify({ center_slug: 'centro-bienestar-arrayan' }) }],
    ['/graphql/v1', { method: 'POST', body: JSON.stringify({ query: '{ __schema { queryType { name } } }' }) }],
  ]) {
    const response = await fetch(`${url}${path}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    assert.ok(!response.ok, `${path} unexpectedly exposed a data endpoint: ${response.status}`);
  }
  const parts = token.split('.');
  const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: '20000000-0000-4000-8000-000000000004', role: 'authenticated', exp: 4102444800 })).toString('base64url')}.${parts[2]}`;
  const expiredPayload = Buffer.from(JSON.stringify({ sub: login.data.user.id, role: 'authenticated', aud: 'authenticated', exp: 1 })).toString('base64url');
  const expiredHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const unsigned = `${expiredHeader}.${expiredPayload}`;
  const expired = `${unsigned}.${createHmac('sha256', jwtSecret).update(unsigned).digest('base64url')}`;
  for (const credential of [undefined, 'invalid.token.value', forged, expired]) {
    const response = await fetch(`${api}/staff/me`, { headers: credential ? { Authorization: `Bearer ${credential}` } : {} });
    assert.equal(response.status, 401);
  }
  const base = `${api}/public/centers/centro-bienestar-arrayan`;
  assert.equal((await fetch(base)).status, 200);
  const service = '70000000-0000-4000-8000-000000000002';
  const professional = '50000000-0000-4000-8000-000000000002';
  const params = new URLSearchParams({ service, professional });
  const availability = await (await fetch(`${base}/availability?${params}`)).json();
  assert.ok(availability.length);
  const terms = await (await fetch(`${base}/terms?${params}`)).json();
  const email = `${randomUUID()}@example.com`;
  const body = JSON.stringify({ service, professional, start: availability[0].starts_at, name: 'Prueba Aislada', email, phone: '+56912345678', terms: terms.map(term => term.id) });
  const booking = await fetch(`${base}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(booking.status, 201, await booking.text());
  const duplicate = await fetch(`${base}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(duplicate.status, 409);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const result = await admin.query('select a.id, count(t.version_id)::int as accepted from public.appointments a left join public.appointment_terms_acceptances t on t.appointment_id = a.id where a.patient_email = $1 group by a.id', [email]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].accepted, terms.length);
  } finally { await admin.end(); }
  console.log('Auth, Data API denial and public booking checks passed');
} finally { await client.auth.signOut(); }
