import { Router } from 'express';
import { requireCenterAccess } from '../middleware/centerAccess.js';

export const staffRoutes = Router();
const router = staffRoutes;

router.get('/me', (_req, res) => res.json({ platformAdmin: res.locals.staff.platformAdmin }));

router.get('/centers', async (_req, res) => {
  const { db, userId, platformAdmin } = res.locals.staff;
  if (platformAdmin) {
    const { data, error } = await db.from('centers').select('id, name');
    if (error) { res.status(500).json({ error: 'Could not load centers' }); return; }
    res.json(data.map((center: { id: string; name: string }) => ({ center_id: center.id, role: 'platform_administrator', centers: center }))); return;
  }
  const { data, error } = await db.from('center_memberships').select('center_id, role, centers(id, name)').eq('user_id', userId);
  if (error) { res.status(500).json({ error: 'Could not load centers' }); return; }
  res.json(data);
});

router.use('/centers/:centerId', requireCenterAccess);

router.get('/centers/:centerId', (req, res) => {
  res.json({ centerId: req.params.centerId, role: res.locals.role });
});

router.get('/centers/:centerId/appointments', async (req, res) => {
  const { db, userId } = res.locals.staff;
  let query = db.from('appointments').select('id, service_name, patient_name, starts_at, ends_at, professional_user_id').eq('center_id', req.params.centerId).order('starts_at');
  if (!['administrator', 'platform_administrator'].includes(res.locals.role)) query = query.eq('professional_user_id', userId);
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: 'Could not load appointments' }); return; }
  res.json(data);
});
