// Run against a local API and local Supabase only; remove all created fixtures.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const api = process.env.TEST_API_URL;
const ownerUrl = process.env.TEST_ADMIN_DATABASE_URL;
for (const value of [api, ownerUrl, process.env.SUPABASE_URL]) {
  assert.ok(value && ['localhost', '127.0.0.1'].includes(new URL(value).hostname), 'Use local test services only');
}
const owner = new pg.Pool({ connectionString: ownerUrl });
const clients = [];
async function login(email) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client);
  const { data, error } = await client.auth.signInWithPassword({ email, password: 'Demo-Arrayan-2026!' });
  assert.ifError(error);
  return data.session.access_token;
}
async function request(path, token, method = 'GET', body) {
  return fetch(`${api}/staff${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
let centerId;
try {
  const platform = await login('plataforma@example.com');
  const admin = await login('camila.rojas@example.com');
  const createdCenter = await request('/platform/centers', platform, 'POST', { name: `Platform test ${randomUUID()}` });
  assert.equal(createdCenter.status, 201);
  const center = await createdCenter.json(); centerId = center.id;
  const base = `/centers/${centerId}`;
  assert.equal((await owner.query('select count(*)::int as count from public.center_memberships where center_id=$1', [centerId])).rows[0].count, 0, 'platform requires no membership');
  assert.equal((await request(`${base}/service-catalog`, admin, 'POST', {})).status, 403, 'center admin cannot manage another center');
  const createdService = await request(`${base}/service-catalog`, platform, 'POST', { name: 'Consulta', description: 'Inicial', price_clp: 1000, duration_minutes: 30 });
  assert.equal(createdService.status, 201, await createdService.clone().text());
  const service = await createdService.json();
  assert.equal((await request(`${base}/service-catalog/${service.id}`, platform, 'PATCH', { name: 'Consulta actualizada', description: 'Actualizada' })).status, 200);
  const catalog = await (await request(`${base}/service-catalog`, platform)).json();
  assert.equal(catalog[0].name, 'Consulta actualizada');
  assert.equal((await request(base, platform, 'PATCH', { name: center.name, description: 'Centro actualizado', opens_at: '08:00', closes_at: '19:00' })).status, 200);
  assert.equal((await request(`${base}/terms/center`, platform, 'POST', { body: 'Condiciones del centro' })).status, 201);
  assert.deepEqual(await (await request(`${base}/terms`, platform)).json(), [{ service_id: null, body: 'Condiciones del centro' }]);
  assert.equal((await request(`${base}/terms/center`, platform, 'PUT', { body: 'Condiciones actualizadas' })).status, 200);
  assert.equal((await request(`${base}/terms/center`, platform, 'DELETE')).status, 204);
  assert.equal((await request(`${base}/appointments?scope=center`, platform)).status, 200);
  assert.equal((await request(`${base}/service-catalog/${service.id}`, platform, 'DELETE')).status, 200);
  assert.deepEqual(await (await request(`${base}/service-catalog`, platform)).json(), []);
  console.log('Platform admin catalog CRUD, settings, center terms, agenda, and center isolation passed');
} finally {
  if (centerId) {
    await owner.query('delete from public.booking_terms_current where center_id=$1', [centerId]);
    await owner.query('delete from public.booking_terms_versions where center_id=$1', [centerId]);
    await owner.query('delete from public.services where center_id=$1', [centerId]);
    await owner.query('delete from public.centers where id=$1', [centerId]);
  }
  await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' })));
  await owner.end();
}
