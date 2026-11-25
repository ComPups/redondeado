import pg from 'pg';
import type { PoolClient, PoolConfig } from 'pg';

// Only the authentication middleware may construct a staff identity, after
// verifying the token with Supabase Auth. No role or claims come from a body.
export type DatabaseIdentity = { kind: 'staff'; userId: string } | { kind: 'public' };

export function createDatabase(config: PoolConfig, statementTimeoutMs: number) {
  if (!Number.isSafeInteger(statementTimeoutMs) || statementTimeoutMs <= 0) throw new Error('Invalid statement timeout');
  if (!config.max || !Number.isSafeInteger(config.max) || config.max < 1) throw new Error('A bounded database pool is required');
  if (!Number.isSafeInteger(config.connectionTimeoutMillis) || !config.connectionTimeoutMillis || config.connectionTimeoutMillis < 1) throw new Error('A database acquisition timeout is required');
  const pool = new pg.Pool(config);
  // Idle client errors must not terminate the process without explanation.
  pool.on('error', error => console.error('Idle database connection failed', error));

  async function transaction<T>(identity: DatabaseIdentity, run: (client: PoolClient) => Promise<T>): Promise<T> {
    if (identity.kind === 'staff' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.userId)) throw new Error('Invalid verified user ID');
    const client = await pool.connect();
    let discard = false;
    try {
      await client.query('begin');
      await client.query(identity.kind === 'staff' ? 'set local role authenticated' : 'set local role redondeado_public');
      const claims = identity.kind === 'staff' ? { sub: identity.userId, role: 'authenticated' } : {};
      await client.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', $1, true), set_config('statement_timeout', $2, true)", [JSON.stringify(claims), `${statementTimeoutMs}ms`]);
      const result = await run(client);
      await client.query('commit');
      return result;
    } catch (error) {
      try { await client.query('rollback'); } catch { discard = true; }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  return { transaction, close: () => pool.end() };
}
