import type { RequestHandler } from 'express';

export const requirePlatformAdmin: RequestHandler = (_req, res, next) => {
  if (!res.locals.staff.platformAdmin) { res.status(403).json({ error: 'Platform administrator access required' }); return; }
  next();
};
