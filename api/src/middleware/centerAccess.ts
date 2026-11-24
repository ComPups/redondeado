import type { RequestHandler } from 'express';

export const requireCenterAccess: RequestHandler<{ centerId: string }> = async (req, res, next) => {
  const { db, userId } = res.locals.staff;
  if (res.locals.staff.platformAdmin) {
    const { data, error } = await db.from('centers').select('id').eq('id', req.params.centerId).maybeSingle();
    if (error) { res.status(500).json({ error: 'Could not check center' }); return; }
    if (!data) { res.status(403).json({ error: 'Center access denied' }); return; }
    res.locals.role = 'platform_administrator'; next(); return;
  }
  const { data, error } = await db.from('center_memberships').select('role').eq('center_id', req.params.centerId).eq('user_id', userId).maybeSingle();
  if (error) { res.status(500).json({ error: 'Could not check membership' }); return; }
  if (!data) { res.status(403).json({ error: 'Center access denied' }); return; }
  res.locals.role = data.role;
  next();
};
