import { strict as assert } from 'node:assert';
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = process.env;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
const api = process.env.TEST_API_URL || 'http://localhost:3000';
const center = '10000000-0000-4000-8000-000000000001';
const query = new URLSearchParams({ service_id: '70000000-0000-4000-8000-000000000001', professional_id: '50000000-0000-4000-8000-000000000001' });
const path = `${api}/staff/centers/${center}/availability?${query}`;
assert.equal((await fetch(path)).status, 401);
for (const [email, expected] of [['camila.rojas@example.com', 200], ['matias.soto@example.com', 200], ['valentina.munoz@example.com', 403]]) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: 'Demo-Arrayan-2026!' });
  assert.ifError(error);
  const response = await fetch(path, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
  assert.equal(response.status, expected);
  if (expected === 200) assert.ok(Array.isArray(await response.json()));
  await client.auth.signOut();
}
console.log('Staff availability API checks passed');
