import { createClient } from '@supabase/supabase-js';
import type { RequestHandler } from 'express';

// Construct a client per request so user credentials never leak between requests.
export function authenticateStaff(url: string, key: string): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '');
    if (!match) { res.status(401).json({ error: 'Authentication required' }); return; }
    const token = match[1];
    const db = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) { res.status(401).json({ error: 'Invalid authentication' }); return; }
    const { data: platformRole, error: roleError } = await db.from('platform_administrators').select('user_id').eq('user_id', data.user.id).maybeSingle();
    if (roleError) { res.status(500).json({ error: 'Could not check platform role' }); return; }
    res.locals.staff = { db, userId: data.user.id, platformAdmin: !!platformRole };
    next();
  };
}
