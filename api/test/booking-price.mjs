// Run against an isolated seeded database and API; changes are restored afterward.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const { TEST_DATABASE_URL, TEST_API_URL } = process.env;
if (!TEST_DATABASE_URL || !TEST_API_URL) throw Error('Set TEST_DATABASE_URL and TEST_API_URL for an isolated stack');
const db = new pg.Client({ connectionString: TEST_DATABASE_URL });
await db.connect();
const center = '10000000-0000-4000-8000-000000000001';
const service = '70000000-0000-4000-8000-000000000002';
const user = '20000000-0000-4000-8000-000000000002';
const professional = '50000000-0000-4000-8000-000000000002';
const base = `${TEST_API_URL}/public/centers/centro-bienestar-arrayan`;
const email = `price-${randomUUID()}@example.com`;
const saved = await db.query('select price_clp from public.professional_services where center_id=$1 and service_id=$2 and professional_user_id=$3', [center, service, user]);
const original = saved.rows[0].price_clp;
try {
  await db.query('update public.professional_services set price_clp=$1 where center_id=$2 and service_id=$3 and professional_user_id=$4', [original + 1, center, service, user]);
  const profile = await (await fetch(base)).json();
  const shownPrice = profile.services.find(row => row.id === service && row.professional_id === professional).price_clp;
  const query = new URLSearchParams({ service, professional });
  const slots = await (await fetch(`${base}/availability?${query}`)).json();
  const terms = await (await fetch(`${base}/terms?${query}`)).json();
  assert.ok(slots.length);
  const body = { service, professional, start: slots[0].starts_at, name: 'Paciente prueba', email, phone: '+56912345678', terms: terms.map(t => t.id), expected_price_clp: shownPrice };
  await db.query('update public.professional_services set price_clp=$1 where center_id=$2 and service_id=$3 and professional_user_id=$4', [shownPrice + 1, center, service, user]);
  const post = value => fetch(`${base}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const { expected_price_clp: _price, ...withoutPrice } = body;
  assert.equal((await post(withoutPrice)).status, 400);
  const rejected = await post(body); assert.equal(rejected.status, 409); assert.equal((await rejected.json()).code, 'PRICE_CHANGED');
  assert.equal((await db.query('select count(*)::int as count from public.appointments where patient_email=$1', [email])).rows[0].count, 0);
  const accepted = await post({ ...body, expected_price_clp: shownPrice + 1 }); assert.equal(accepted.status, 201, await accepted.text());
  assert.equal((await db.query('select price_clp from public.appointments where patient_email=$1', [email])).rows[0].price_clp, shownPrice + 1);
  console.log('Booking price conflict and refresh integration passed');
} finally {
  await db.query('delete from public.appointments where patient_email=$1', [email]);
  await db.query('update public.professional_services set price_clp=$1 where center_id=$2 and service_id=$3 and professional_user_id=$4', [original, center, service, user]);
  await db.end();
}
