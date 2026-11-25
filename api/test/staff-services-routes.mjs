// Run against an isolated, seeded local stack and API.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, TEST_API_URL: api } = process.env;
if (!url || !key || !api) throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and TEST_API_URL');
const base = `${api}/staff/centers/10000000-0000-4000-8000-000000000001`;
async function login(email) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: 'Demo-Arrayan-2026!' });
  assert.ifError(error); return { client, token: data.session.access_token };
}
const request = (path, token, method = 'GET', body) => fetch(path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const admin = await login('camila.rojas@example.com');
const member = await login('matias.soto@example.com');
const limited = await login('valentina.munoz@example.com');
let original; let serviceId; let catalogId; let removed = false;
try {
  assert.equal((await request(`${base}/services`)).status, 401);
  const catalog = await request(`${base}/service-catalog`, member.token); assert.equal(catalog.status, 200);
  const services = await request(`${base}/services`, member.token); assert.equal(services.status, 200);
  original = (await services.json())[0]; assert.ok(original); serviceId = original.id;
  const ownBefore = (await (await request(`${base}/services`, admin.token)).json()).find(s => s.id === serviceId); assert.ok(ownBefore);
  assert.equal((await request(`${base}/services/${serviceId}`, limited.token, 'PATCH', original)).status, 403);
  assert.equal((await request(`${base}/service-catalog/${serviceId}`, member.token, 'PATCH', { name: 'Forbidden', description: '' })).status, 403);
  assert.equal((await request(`${base}/services/${serviceId}`, member.token, 'PATCH', { price_clp: -1, duration_minutes: 30 })).status, 400);
  assert.equal((await request(`${base}/services/${serviceId}`, member.token, 'PATCH', { price_clp: original.price_clp + 100, duration_minutes: 75 })).status, 200);
  const otherAfter = (await (await request(`${base}/services`, admin.token)).json()).find(s => s.id === serviceId);
  assert.equal(otherAfter.price_clp, ownBefore.price_clp);
  assert.equal((await request(`${base}/services/${serviceId}`, member.token, 'DELETE')).status, 200); removed = true;
  const response = await request(`${api}/public/centers/centro-bienestar-arrayan`); const profile = await response.json();
  const matias = profile.professionals.find(p => p.name === 'Matías Soto');
  const camila = profile.professionals.find(p => p.name === 'Camila Rojas');
  assert.ok(!matias.service_ids.includes(serviceId)); assert.ok(camila.service_ids.includes(serviceId));
  assert.equal((await request(`${base}/services`, member.token, 'POST', { service_id: serviceId, price_clp: original.price_clp, duration_minutes: original.duration_minutes })).status, 201); removed = false;
  assert.equal((await request(`${base}/services`, member.token, 'POST', { service_id: serviceId, price_clp: original.price_clp, duration_minutes: original.duration_minutes })).status, 409);
  const newService = await request(`${base}/service-catalog`, admin.token, 'POST', { name: 'Servicio de prueba', description: 'Temporal', price_clp: 1000, duration_minutes: 30 });
  assert.equal(newService.status, 201); catalogId = (await newService.json()).id;
  assert.equal((await request(`${base}/services`, member.token, 'POST', { service_id: catalogId, price_clp: 2500, duration_minutes: 45 })).status, 201);
  assert.equal((await request(`${base}/service-catalog/${catalogId}`, admin.token, 'PATCH', { name: 'Servicio actualizado', description: 'Nueva descripción' })).status, 200);
  const updated = (await (await request(`${base}/services`, member.token)).json()).find(s => s.id === catalogId);
  assert.equal(updated.name, 'Servicio actualizado'); assert.equal(updated.price_clp, 2500);
  assert.equal((await request(`${base}/service-catalog/${catalogId}`, admin.token, 'DELETE')).status, 200); catalogId = null;
  assert.ok(!(await (await request(`${base}/services`, member.token)).json()).some(s => s.name === 'Servicio actualizado'));
  console.log('Staff offering REST integration checks passed');
} finally {
  if (catalogId) await request(`${base}/service-catalog/${catalogId}`, admin.token, 'DELETE');
  if (original) {
    const method = removed ? 'POST' : 'PATCH'; const path = removed ? `${base}/services` : `${base}/services/${serviceId}`;
    await request(path, member.token, method, { service_id: serviceId, price_clp: original.price_clp, duration_minutes: original.duration_minutes });
  }
  await Promise.all([admin.client.auth.signOut(), member.client.auth.signOut(), limited.client.auth.signOut()]);
}
