// Run with node --import tsx test/center-settings.mjs against seeded local Supabase.
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createDatabase } from '../src/db.ts';
import { authenticateStaff } from '../src/middleware/auth.ts';
import { staffRoutes } from '../src/routes/staff.ts';

const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, DATABASE_URL: databaseUrl } = process.env;
if (!url || !key || !databaseUrl) throw Error('Set local SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DATABASE_URL');
const db = createDatabase({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000, ssl: false }, 15000);
const app = express(); app.use(express.json());
app.use('/staff', authenticateStaff(url, key, db), staffRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const api = `http://127.0.0.1:${server.address().port}`;
const centerId = '10000000-0000-4000-8000-000000000001';
const clients = [];
async function login(email) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(client);
  const { data, error } = await client.auth.signInWithPassword({ email, password: 'Demo-Arrayan-2026!' });
  assert.ifError(error); return data.session.access_token;
}
const request = (path, token, method = 'GET', body) => fetch(`${api}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
let original; let admin;
try {
  admin = await login('camila.rojas@example.com');
  const member = await login('matias.soto@example.com');
  const limited = await login('valentina.munoz@example.com');
  const memberships = await (await request('/staff/centers', admin)).json();
  const current = memberships.find(m => m.center_id === centerId).centers;
  original = { name: current.name, description: current.description, opens_at: current.opens_at.slice(0, 5), closes_at: current.closes_at.slice(0, 5) };
  const path = `/staff/centers/${centerId}`;
  assert.equal((await request(path, null, 'PATCH', original)).status, 401);
  for (const token of [member, limited]) assert.equal((await request(path, token, 'PATCH', original)).status, 403);
  for (const invalid of [{ name: ' ' }, { name: 'a'.repeat(121) }, { description: 'a'.repeat(401) }, { opens_at: '25:00' }, { closes_at: original.opens_at }, { opens_at: '20:00', closes_at: '09:00' }, { slug: 'changed' }, { image_url: 'https://example.com/a.jpg' }]) {
    assert.equal((await request(path, admin, 'PATCH', { ...original, ...invalid })).status, 400);
  }
  assert.equal((await request('/staff/centers/10000000-0000-4000-8000-000000000099', admin, 'PATCH', original)).status, 403);
  const saved = await request(path, admin, 'PATCH', { name: ' Centro editado ', description: 'a'.repeat(400), opens_at: '08:30', closes_at: '19:00' });
  assert.equal(saved.status, 200); assert.equal((await saved.json()).slug, current.slug);
  // The local migration login can call the projection directly; deployed API
  // public transactions instead use the separately provisioned runtime login.
  const verifier = new pg.Client({ connectionString: databaseUrl, ssl: false });
  let profile;
  try { await verifier.connect(); profile = (await verifier.query('select public.public_center_profile($1) as profile', [current.slug])).rows[0].profile; }
  finally { await verifier.end(); }
  assert.equal(profile.name, 'Centro editado'); assert.equal(profile.description.length, 400); assert.equal(profile.opens_at, '08:30:00'); assert.equal(profile.closes_at, '19:00:00');
  console.log('Center settings HTTP authorization, validation and public persistence checks passed');
} finally {
  if (original && admin) assert.equal((await request(`/staff/centers/${centerId}`, admin, 'PATCH', original)).status, 200);
  await Promise.all(clients.map(client => client.auth.signOut()));
  await new Promise(resolve => server.close(resolve)); await db.close();
}
