// TEAM_TEST_DATABASE_URL must point to an isolated migrated database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { createDatabase } from '../src/db.ts';
import { teamRoutes } from '../src/routes/team.ts';
import { platformRoutes } from '../src/routes/platform.ts';

const url = process.env.TEAM_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.includes('equipo_validation')) throw new Error('Use an isolated equipo_validation database');
const owner = new pg.Pool({ connectionString: url, max: 3 });
const db = createDatabase({ connectionString: url, max: 4, connectionTimeoutMillis: 2000 }, 5000);
const center = randomUUID(), otherCenter = randomUUID(), admin = randomUUID(), created = randomUUID(), legacyLimited = randomUUID(), service = randomUUID(), requestKey = randomUUID();
await owner.query("insert into auth.users(id,email,email_confirmed_at,aud,role) values($1,$2,now(),'authenticated','authenticated'),($3,$4,now(),'authenticated','authenticated')", [admin, `${admin}@example.com`, legacyLimited, `${legacyLimited}@example.com`]);
await owner.query('insert into public.staff_profiles(user_id,display_name) values($1,$2),($3,$4)', [admin, 'Admin', legacyLimited, 'Legacy Limited']);
await owner.query('insert into public.centers(id,name,slug) values($1,$2,$3)', [center, 'Equipo API', `equipo-${center}`]);
await owner.query('insert into public.centers(id,name,slug) values($1,$2,$3)', [otherCenter, 'Otro', `equipo-${otherCenter}`]);
await owner.query("insert into public.center_memberships(center_id,user_id,role) values($1,$2,'administrator')", [center, admin]);
await owner.query("insert into public.center_memberships(center_id,user_id,role,active) values($1,$2,'limited',false)", [center, legacyLimited]);
await owner.query('insert into public.services(id,center_id,name,price_clp,duration_minutes) values($1,$2,$3,1000,30)', [service, center, 'Consulta']);
const authUsers = new Map([[`${created}@example.com`, created]]); let deleteMode = 'success'; const deleteCalls = [];
const authAdmin = { auth: { admin: {
  createUser: async ({ email }) => { const id = authUsers.get(email) ?? randomUUID(); authUsers.set(email, id); await owner.query("insert into auth.users(id,email,email_confirmed_at,aud,role) values($1,$2,now(),'authenticated','authenticated')", [id, email]); return { data: { user: { id, email } }, error: null }; },
  deleteUser: async userId => { deleteCalls.push(userId); if (deleteMode === 'reject') throw new Error('Auth unavailable'); if (deleteMode === 'error') return { error: { code: 'unexpected_failure' } }; await owner.query('delete from auth.users where id=$1', [userId]); return { error: null }; },
} } };
const app = express(); app.use(express.json());
app.use((req, res, next) => { res.locals.staff = { userId: admin, platformAdmin: req.get('x-test-platform') === 'yes', sql: db }; next(); });
app.use('/staff', teamRoutes('http://localhost', undefined, 'http://localhost', authAdmin));
app.use('/staff', platformRoutes);
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/staff`;
async function call(path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, { method, headers: { 'x-test-user': admin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
try {
  assert.equal((await call(`/centers/${otherCenter}/team`)).status, 403, 'center isolation');
  assert.equal((await call(`/centers/${center}/team`)).status, 200, 'admin can list team');
  const body = { display_name: 'Nueva persona', email: `${created}@example.com`, password: 'New-password!', role: 'member', service_ids: [service] };
  const limitedCreate = await call(`/centers/${center}/team/members`, 'POST', { ...body, role: 'limited' }, { 'idempotency-key': randomUUID() }); assert.equal(limitedCreate.status, 400, 'limited cannot be newly assigned');
  const createdResponse = await call(`/centers/${center}/team/members`, 'POST', body, { 'idempotency-key': requestKey });
  assert.equal(createdResponse.status, 201); assert.equal(createdResponse.body.role, 'member');
  assert.deepEqual((await owner.query('select price_clp,duration_minutes from public.professional_services where center_id=$1 and professional_user_id=$2', [center, created])).rows, [{ price_clp: 1000, duration_minutes: 30 }]);
  const retry = await call(`/centers/${center}/team/members`, 'POST', { ...body, password: 'different-password' }, { 'idempotency-key': requestKey }); assert.equal(retry.status, 200, 'committed retry is idempotent');
  assert.equal((await call(`/centers/${center}/team/members/${created}`, 'PATCH', { role: 'limited', active: false })).status, 400, 'limited cannot be newly assigned by PATCH');
  const listed = await call(`/centers/${center}/team`); assert.equal(listed.body.members.find(m => m.user_id === legacyLimited).role, 'limited', 'legacy role remains visible');
  assert.equal((await call(`/centers/${center}/team/members/${legacyLimited}`, 'PATCH', { role: 'limited', active: true })).status, 200, 'legacy limited membership can reactivate');
  assert.equal((await call(`/centers/${center}/team/members/${legacyLimited}`, 'PATCH', { role: 'member', active: true })).status, 200, 'legacy membership can be explicitly changed to member');
  await owner.query("update public.center_memberships set role='limited',active=false where center_id=$1 and user_id=$2", [center, legacyLimited]);
  assert.equal((await call(`/platform-memberships/${center}/${legacyLimited}`, 'PATCH', { role: 'limited', active: true }, { 'x-test-platform': 'yes' })).status, 200, 'platform editor can preserve and reactivate a legacy role');
  assert.equal((await call(`/platform-memberships/${center}/${created}`, 'PATCH', { role: 'limited' }, { 'x-test-platform': 'yes' })).status, 400, 'platform editor cannot newly assign limited');
  assert.equal((await call(`/centers/${center}/team/members/${created}`, 'PATCH', { role: 'member', active: false })).status, 200, 'member can be deactivated');
  const platformRoleOnly = await call(`/platform-memberships/${center}/${created}`, 'PATCH', { role: 'member' }, { 'x-test-platform': 'yes' });
  assert.equal(platformRoleOnly.status, 200, 'platform role-only PATCH works');
  assert.equal(platformRoleOnly.body.active, false, 'platform role-only PATCH preserves inactive state');
  assert.equal((await call(`/centers/${center}/team/members/${admin}`, 'PATCH', { role: 'member', active: true })).status, 409, 'last-admin protection');
  const invalidKey = randomUUID(); const failedEmail = `${randomUUID()}@example.com`; const failedUser = randomUUID(); authUsers.set(failedEmail, failedUser); deleteMode = 'error';
  const failed = await call(`/centers/${center}/team/members`, 'POST', { display_name: 'Cleanup error', email: failedEmail, password: 'New-password!', service_ids: [randomUUID()] }, { 'idempotency-key': invalidKey }); assert.equal(failed.status, 500); assert.equal((await owner.query('select state from public.team_provisioning_requests where request_id=$1', [invalidKey])).rows[0].state, 'cleanup_pending');
  deleteMode = 'reject'; const rejectedKey = randomUUID(); const rejectedEmail = `${randomUUID()}@example.com`; const rejectedUser = randomUUID(); authUsers.set(rejectedEmail, rejectedUser);
  const rejected = await call(`/centers/${center}/team/members`, 'POST', { display_name: 'Cleanup reject', email: rejectedEmail, password: 'New-password!', service_ids: [randomUUID()] }, { 'idempotency-key': rejectedKey }); assert.equal(rejected.status, 500); assert.equal((await owner.query('select state from public.team_provisioning_requests where request_id=$1', [rejectedKey])).rows[0].state, 'cleanup_pending');
  deleteMode = 'success'; const recoveredKey = randomUUID(); const recoveredEmail = `${randomUUID()}@example.com`; const recoveredUser = randomUUID(); authUsers.set(recoveredEmail, recoveredUser);
  const recovered = await call(`/centers/${center}/team/members`, 'POST', { display_name: 'Cleanup success', email: recoveredEmail, password: 'New-password!', service_ids: [randomUUID()] }, { 'idempotency-key': recoveredKey }); assert.equal(recovered.status, 400); assert.equal((await owner.query('select state,user_id from public.team_provisioning_requests where request_id=$1', [recoveredKey])).rows[0].state, 'cleaned');
  assert.ok(deleteCalls.includes(failedUser) && deleteCalls.includes(rejectedUser) && deleteCalls.includes(recoveredUser));
  console.log('team API isolation, listing, snapshots, idempotency, PATCH, last-admin and Auth cleanup paths passed');
} finally { await new Promise(resolve => server.close(resolve)); await db.close(); await owner.end(); }
