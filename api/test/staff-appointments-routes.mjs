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
    const filters = {}; let operation = 'select'; let changes; let start = 0; let end = Infinity; let period; let descending = false;
    const query = {
      select() { return query; }, eq(key, value) { filters[key] = value; return query; }, order(key, opts) { if (key === 'starts_at') descending = !opts.ascending; return query; }, lt() { period = 'past'; return query; }, gte() { period = 'upcoming'; return query; }, range(from, to) { start = from; end = to; return query; },
      update(value) { operation = 'update'; changes = value; return query; }, delete() { operation = 'delete'; return query; },
      async maybeSingle() { const result = await query.execute(); return { ...result, data: result.data?.[0] ?? null }; },
      async execute() {
        if (table === 'center_memberships') return { data: filters.center_id === center ? [{ role }] : [], error: null };
        if (table !== 'appointments') throw new Error(`Unexpected table ${table}`);
        let matches = rows.filter(row => Object.entries(filters).every(([k, v]) => row[k] === v) && (role === 'administrator' || row.professional_user_id === userId));
        if (period) matches = matches.filter(row => period === 'past' ? Date.parse(row.starts_at) < Date.now() : Date.parse(row.starts_at) >= Date.now()).sort((a, b) => (descending ? -1 : 1) * (a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id)));
        const count = matches.length;
        matches = matches.slice(start, end + 1);
        if (operation === 'update') matches.forEach(row => Object.assign(row, changes));
        if (operation === 'delete') matches.forEach(row => rows.splice(rows.indexOf(row), 1));
        return { data: matches.map(row => ({ ...row })), error: null, count };
      },
      then(resolve, reject) { return query.execute().then(resolve, reject); },
    };
    return query;
  }
  function rpc(name, args) {
    if (name === 'appointment_professional_names') return { async in(_key, ids) { return { data: rows.filter(row => ids.includes(row.id)).map(row => ({ appointment_id: row.id, display_name: row.professional_user_id })), error: null }; } };
    return otherRpc(name, args);
  }
  async function otherRpc(name, args) {
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
  assert.deepEqual((await (await request(base, 'member')).json()).appointments.map(row => row.id), ['own']);
  assert.equal((await (await request(`${base}?scope=center`, 'administrator')).json()).appointments.length, 2);
  const update = { patient_name: 'Updated', patient_email: 'own@example.com', patient_phone: '+56912345678', starts_at: '2099-01-01T12:00:00Z', ends_at: '2099-01-01T13:00:00Z' };
  assert.equal((await request(`${base}/own`, 'member', 'PATCH', update)).status, 200);
  assert.equal(rows[0].patient_name, 'Updated');
  assert.equal((await request(`${base}/other`, 'member', 'PATCH', update)).status, 404);
  assert.equal((await request(`${base}/own`, 'limited', 'PATCH', update)).status, 403);
  assert.equal((await request(`${base}/own`, 'member', 'PATCH', { ...update, ends_at: 'bad' })).status, 400);
  assert.equal((await request(`${base}/own`, 'member', 'PATCH', { ...update, patient_email: 'invalid' })).status, 400);
  assert.equal((await request(`${base}/own`, 'member', 'PATCH', { ...update, patient_phone: '12' })).status, 400);
  for (let i = 0; i < 110; i++) rows.push({ ...rows[0], id: `page-${String(i).padStart(3, '0')}` });
  for (let i = 0; i < 1001; i++) rows.push({ ...rows[0], id: `past-${String(i).padStart(4, '0')}`, starts_at: '2020-01-01T12:00:00Z' });
  const page1 = await (await request(`${base}?scope=personal&page=1`, 'member')).json();
  const page2 = await (await request(`${base}?scope=personal&page=2`, 'member')).json();
  assert.equal(page1.appointments.length, 50);
  assert.ok(page1.appointments.every(row => row.id !== 'past-0000' && !row.id.startsWith('past-')));
  const pastPage = await (await request(`${base}?period=past&page=1`, 'member')).json();
  assert.equal(pastPage.appointments.length, 50);
  assert.equal(pastPage.has_more, true);
  assert.equal(page2.appointments.length, 50);
  assert.equal(page1.has_more, true);
  assert.ok(page1.appointments.every(a => !page2.appointments.some(b => a.id === b.id)));
  assert.equal((await request(`${base}?page=0`, 'member')).status, 400);
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
