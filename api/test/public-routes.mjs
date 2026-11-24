import { strict as assert } from 'node:assert';
import express from 'express';
import { publicRoutes } from '../dist/routes/public.js';

const service = '70000000-0000-4000-8000-000000000001';
const professional = '50000000-0000-4000-8000-000000000001';
const slot = '2099-11-24T13:00:00Z';
let booked = false;
let received;
const db = { rpc(name, args) {
  if (name === 'public_availability') return { async range(from) { return { data: from ? [] : booked ? [] : [{ starts_at: slot }], error: null }; } };
  if (name === 'book_public_appointment') {
    received = args;
    if (booked) return Promise.resolve({ error: { code: 'P0001' } });
    booked = true; return Promise.resolve({ data: 'appointment-id', error: null });
  }
  throw new Error(`Unexpected RPC ${name}`);
} };
const app = express(); app.use(express.json()); app.use('/public', publicRoutes('', '', db));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/public/centers/demo`;
try {
  const availability = `${base}/availability?${new URLSearchParams({ service_id: service, professional_id: professional })}`;
  assert.deepEqual(await (await fetch(availability)).json(), [{ starts_at: slot }]);
  assert.equal((await fetch(`${base}/availability?service_id=bad&professional_id=${professional}`)).status, 400);
  const body = { service_id: service, professional_id: professional, starts_at: slot, patient_name: 'Test Patient', patient_email: 'test@example.com', patient_phone: '+56912345678' };
  const book = () => fetch(`${base}/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await book()).status, 201);
  assert.equal(received.p_professional, professional);
  assert.equal(received.p_slug, 'demo');
  assert.equal((await book()).status, 409);
  assert.deepEqual(await (await fetch(availability)).json(), []);
  assert.equal((await fetch(`${base}/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
  console.log('Public appointment API route checks passed');
} finally { await new Promise(resolve => server.close(resolve)); }
