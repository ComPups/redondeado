// Real HTTP integration test. Run only against an isolated, seeded local stack.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, TEST_API_URL: api } = process.env;
if (!url || !key || !api) throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and TEST_API_URL for an isolated seeded stack');
const center = '10000000-0000-4000-8000-000000000001';
const base = `${api}/staff/centers/${center}/appointments`;
async function login(email) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: 'Demo-Arrayan-2026!' });
  assert.ifError(error);
  return { client, token: data.session.access_token };
}
const member = await login('matias.soto@example.com');
const limited = await login('valentina.munoz@example.com');
const admin = await login('camila.rojas@example.com');
const request = (path, token, method = 'GET', body) => fetch(path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
try {
  assert.equal((await request(base)).status, 401);
  assert.equal((await request(`${base}?page=0`, member.token)).status, 400);
  const all = [];
  for (const period of ['past', 'upcoming']) {
    const response = await request(`${base}?scope=center&period=${period}`, admin.token);
    assert.equal(response.status, 200);
    all.push(...(await response.json()).appointments);
  }
  const own = all.find(row => row.id === '80000000-0000-4000-8000-000000000002');
  const other = all.find(row => row.id === '80000000-0000-4000-8000-000000000001');
  assert.ok(own && other);
  const body = { patient_name: own.patient_name, patient_email: own.patient_email, patient_phone: own.patient_phone, starts_at: own.starts_at, ends_at: own.ends_at };
  assert.equal((await request(`${base}/${other.id}`, member.token, 'PATCH', body)).status, 404);
  assert.equal((await request(`${base}/${other.id}`, member.token, 'DELETE')).status, 404);
  assert.equal((await request(`${base}/${own.id}`, limited.token, 'PATCH', body)).status, 403);
  assert.equal((await request(`${base}/${own.id}`, member.token, 'PATCH', { ...body, patient_email: 'invalid' })).status, 400);
  assert.equal((await request(`${base}/${own.id}`, member.token, 'PATCH', body)).status, 200);
  console.log('Staff appointment HTTP authorization checks passed');
} finally { await member.client.auth.signOut(); await limited.client.auth.signOut(); await admin.client.auth.signOut(); }
