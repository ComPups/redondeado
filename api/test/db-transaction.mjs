import assert from 'node:assert/strict';
import { createDatabase } from '../dist/db.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable local database connection');
const db = createDatabase({ connectionString: process.env.TEST_DATABASE_URL, max: 1, connectionTimeoutMillis: 2000 }, 1000);
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const staff = userId => ({ kind: 'staff', userId });
try {
  const inspect = async client => (await client.query('select current_user, auth.uid() as uid, pg_backend_pid() as pid')).rows[0];
  const a = await db.transaction(staff(first), inspect);
  assert.equal(a.current_user, 'authenticated');
  assert.equal(a.uid, first);
  await assert.rejects(db.transaction(staff(first), async client => {
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [first]);
    throw new Error('intentional rollback');
  }), /intentional rollback/);
  const b = await db.transaction(staff(second), inspect);
  assert.equal(b.pid, a.pid);
  assert.equal(b.uid, second);
  await assert.rejects(db.transaction(staff(first), client => client.query('select pg_sleep(2)')), /statement timeout/);
  const c = await db.transaction(staff(second), inspect);
  assert.equal(c.uid, second);
  assert.equal(c.pid, a.pid);
  await assert.rejects(db.transaction(staff('not-a-uuid'), inspect), /Invalid verified user ID/);
  console.log('Transaction identity reuse and rollback checks passed');
} finally {
  await db.close();
}
