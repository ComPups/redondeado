import assert from 'node:assert/strict';
import { createDatabase } from '../dist/db.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to an isolated runtime login');
const db = createDatabase({ connectionString: process.env.TEST_DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 }, 3000);
const member = '20000000-0000-4000-8000-000000000002';
const limited = '20000000-0000-4000-8000-000000000003';
try {
  const tasks = Array.from({ length: 60 }, (_, i) => (async () => {
    const userId = i % 2 ? member : limited;
    const isPublic = i % 3 === 0;
    const fail = i % 7 === 0;
    const identity = isPublic ? { kind: 'public' } : { kind: 'staff', userId };
    try {
      await db.transaction(identity, async client => {
        const before = await client.query("select current_user as role, nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub' as sub, pg_backend_pid() as pid, pg_sleep(0.01)");
        assert.equal(before.rows[0].role, isPublic ? 'redondeado_public' : 'authenticated');
        assert.equal(before.rows[0].sub, isPublic ? null : userId);
        if (!isPublic) {
          const rows = await client.query('select professional_user_id from public.appointments');
          assert.ok(rows.rows.every(row => row.professional_user_id === userId));
        }
        if (fail) throw new Error('intentional test rollback');
      });
      assert.equal(fail, false);
    } catch (error) {
      if (!fail || error.message !== 'intentional test rollback') throw error;
    }
  })());
  await Promise.all(tasks);
  console.log('Concurrent transaction identity and rollback checks passed');
} finally { await db.close(); }
