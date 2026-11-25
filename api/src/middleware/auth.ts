import { createClient } from '@supabase/supabase-js';
import type { RequestHandler } from 'express';
import type { createDatabase } from '../db.js';

type Database = ReturnType<typeof createDatabase>;
export function authenticateStaff(url: string, key: string, db: Database): RequestHandler {
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '');
    if (!match) { res.status(401).json({ error: 'Authentication required' }); return; }
    const token = match[1];
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) { res.status(401).json({ error: 'Invalid authentication' }); return; }
    const userId = data.user.id;
    try {
      const platformAdmin = await db.transaction({ kind: 'staff', userId }, async client => (await client.query('select 1 from public.platform_administrators where user_id = $1', [userId])).rowCount !== 0);
      res.locals.staff = { userId, platformAdmin, sql: db };
      next();
    } catch { res.status(500).json({ error: 'Could not check platform role' }); }
  };
}
