import { strict as assert } from 'node:assert';
import express from 'express';
import { staffRoutes } from '../dist/routes/staff.js';

// Exercise the HTTP routes with a database double; RLS itself is tested separately.
const center = 'center-a';
const rows = [
  { id: 'own', center_id: center, professional_user_id: 'member', patient_name: 'Own', patient_email: 'own@example.com', patient_phone: '+56912345678', service_name: 'Service', starts_at: '2099-01-01T12:00:00Z', ends_at: '2099-01-01T13:00:00Z' },
  { id: 'other', center_id: center, professional_user_id: 'other', patient_name: 'Other', patient_email: 'other@example.com', patient_phone: '+56912345678', service_name: 'Service', starts_at: '2099-01-01T14:00:00Z', ends_at: '2099-01-01T15:00:00Z' },
];
function database(userId, role) {
  function from(table) {
    const filters = {}; let operation = 'select'; let changes;
    const query = {
      select() { return query; }, eq(key, value) { filters[key] = value; return query; }, order() { return query; },
      update(value) { operation = 'update'; changes = value; return query; }, delete() { operation = 'delete'; return query; },
      async maybeSingle() { const result = await query.execute(); return { ...result, data: result.data?.[0] ?? null }; },
      async execute() {
        if (table === 'center_memberships') return { data: filters.center_id === center ? [{ role }] : [], error: null };
        if (table !== 'appointments') throw new Error(`Unexpected table ${table}`);
        const matches = rows.filter(row => Object.entries(filters).every(([k, v]) => row[k] === v) && (role === 'administrator' || row.professional_user_id === userId));
        if (operation === 'update') matches.forEach(row => Object.assign(row, changes));
        if (operation === 'delete') matches.forEach(row => rows.splice(rows.indexOf(row), 1));
        return { data: matches.map(row => ({ ...row })), error: null };
      },
      then(resolve, reject) { return query.execute().then(resolve, reject); },
    };
    return query;
  }
  async function rpc(name, args) {
    if (name === 'appointment_professional_names') return { data: rows.map(row => ({ appointment_id: row.id, display_name: row.professional_user_id })), error: null };
    if (name === 'staff_own_professional_id') return { data: 'own-professional', error: null };
    if (name === 'book_staff_appointment') {
      if (args.p_professional !== 'own-professional' && role !== 'administrator') return { error: { code: '42501' } };
      if (args.p_start === 'occupied') return { error: { code: 'P0001' } };
      return { data: 'created', error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
  return { from, rpc };
}
const app = express(); app.use(express.json());
app.use('/staff', (req, res, next) => {
  const token = req.get('Authorization')?.replace('Bearer ', '');
  if (!['member', 'limited', 'administrator'].includes(token)) { res.status(401).json({ error: 'Authentication required' }); return; }
  res.locals.staff = { userId: token, db: database(token, token), platformAdmin: false }; next();
}, staffRoutes);
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/staff/centers/${center}/appointments`;
const request = (path, role, method = 'GET', body) => fetch(path, { method, headers: { ...(role ? { Authorization: `Bearer ${role}` } : {}), 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
try {
  assert.equal((await request(base)).status, 401);
  assert.equal((await request(base.replace(center, 'other-center'), 'member')).status, 403);
  assert.deepEqual((await (await request(base, 'member')).json()).map(row => row.id), ['own']);
  assert.equal((await (await request(base, 'administrator')).json()).length, 2);
  const update = { patient_name: 'Updated', patient_email: 'own@example.com', patient_phone: '+56912345678', starts_at: '2099-01-01T12:00:00Z', ends_at: '2099-01-01T13:00:00Z' };
  assert.equal((await request(`${base}/own`, 'member', 'PATCH', update)).status, 200);
  assert.equal(rows[0].patient_name, 'Updated');
  assert.equal((await request(`${base}/other`, 'member', 'PATCH', update)).status, 404);
  assert.equal((await request(`${base}/own`, 'limited', 'PATCH', update)).status, 403);
  assert.equal((await request(`${base}/own`, 'member', 'PATCH', { ...update, ends_at: 'bad' })).status, 400);
  const booking = { service_id: 'service', professional_id: 'other-professional', starts_at: '2099-01-01T16:00:00Z', patient_name: 'Patient', patient_email: 'p@example.com', patient_phone: '+56912345678' };
  assert.equal((await request(base, 'member', 'POST', booking)).status, 403);
  assert.equal((await request(base, 'member', 'POST', { ...booking, scope: 'personal' })).status, 201);
  assert.equal((await request(base, 'member', 'POST', { ...booking, scope: 'personal', starts_at: 'occupied' })).status, 409);
  assert.equal((await request(base, 'limited', 'POST', booking)).status, 403);
  assert.equal((await request(`${base}/other`, 'member', 'DELETE')).status, 404);
  assert.equal((await request(`${base}/own`, 'limited', 'DELETE')).status, 403);
  assert.equal((await request(`${base}/other`, 'administrator', 'DELETE')).status, 200);
  assert.equal((await request(`${base}/other`, 'administrator', 'DELETE')).status, 404);
  console.log('Staff appointment CRUD API route checks passed');
} finally { await new Promise(resolve => server.close(resolve)); }
