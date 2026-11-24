import { strict as assert } from 'node:assert';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = process.env;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
const api = process.env.TEST_API_URL || 'http://localhost:3000';
const slug = 'centro-bienestar-arrayan';
const center = '10000000-0000-4000-8000-000000000001';
const service = '70000000-0000-4000-8000-000000000001';
const professional = '50000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000001';
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await client.auth.signInWithPassword({ email: 'camila.rojas@example.com', password: 'Demo-Arrayan-2026!' });
assert.ifError(login.error);
const token = login.data.session.access_token;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const list = async () => { const r = await fetch(`${api}/staff/centers/${center}/appointments`, { headers }); assert.equal(r.status, 200); return r.json(); };
const unique = `API test ${Date.now()}`;
const clean = async () => {
  for (const row of await list()) if (row.patient_name.startsWith(unique)) {
    const r = await fetch(`${api}/staff/centers/${center}/appointments/${row.id}`, { method: 'DELETE', headers });
    assert.equal(r.status, 200);
  }
};
try {
  const availability = await fetch(`${api}/public/centers/${slug}/availability?${new URLSearchParams({ service_id: service, professional_id: professional })}`);
  assert.equal(availability.status, 200);
  const slots = await availability.json();
  assert.ok(slots.length >= 2);
  assert.equal((await fetch(`${api}/public/centers/${slug}/availability?service_id=invalid&professional_id=${professional}`)).status, 400);
  const body = { service_id: service, professional_id: professional, starts_at: slots[0].starts_at, patient_name: `${unique} public`, patient_email: 'test@example.com', patient_phone: '+56912345678' };
  const book = () => fetch(`${api}/public/centers/${slug}/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await book()).status, 201);
  assert.equal((await book()).status, 409);
  assert.ok((await list()).some(a => a.patient_name === body.patient_name && a.professional_user_id === user));
  const after = await (await fetch(`${api}/public/centers/${slug}/availability?${new URLSearchParams({ service_id: service, professional_id: professional })}`)).json();
  assert.ok(!after.some(slot => slot.starts_at === body.starts_at));
  const staffBody = { ...body, scope: 'personal', starts_at: after[0].starts_at, patient_name: `${unique} staff` };
  const staff = await fetch(`${api}/staff/centers/${center}/appointments`, { method: 'POST', headers, body: JSON.stringify(staffBody) });
  assert.equal(staff.status, 201);
  assert.ok((await list()).some(a => a.patient_name === staffBody.patient_name && a.professional_user_id === user));
  assert.equal((await fetch(`${api}/staff/centers/${center}/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(staffBody) })).status, 401);
  console.log('Public and staff appointment API checks passed');
} finally {
  await clean();
  await client.auth.signOut();
}
