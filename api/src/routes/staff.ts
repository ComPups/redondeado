import { Router } from 'express';
import { requireCenterAccess } from '../middleware/centerAccess.js';

export const staffRoutes = Router();
const router = staffRoutes;

router.get('/me', async (_req, res) => {
  const { data, error } = await res.locals.staff.db.rpc('staff_display_name');
  if (error) { res.status(500).json({ error: 'Could not load staff profile' }); return; }
  res.json({ platformAdmin: res.locals.staff.platformAdmin, displayName: data });
});

router.get('/centers', async (_req, res) => {
  const { db, userId, platformAdmin } = res.locals.staff;
  if (platformAdmin) {
    const { data, error } = await db.from('centers').select('id, name, slug, description, opens_at, closes_at');
    if (error) { res.status(500).json({ error: 'Could not load centers' }); return; }
    res.json(data.map((center: { id: string; name: string; slug: string; description: string; opens_at: string; closes_at: string }) => ({ center_id: center.id, role: 'platform_administrator', centers: center }))); return;
  }
  const { data, error } = await db.from('center_memberships').select('center_id, role, centers(id, name, slug, description, opens_at, closes_at)').eq('user_id', userId);
  if (error) { res.status(500).json({ error: 'Could not load centers' }); return; }
  res.json(data);
});

router.use('/centers/:centerId', requireCenterAccess);

router.get('/centers/:centerId', (req, res) => {
  res.json({ centerId: req.params.centerId, role: res.locals.role });
});

router.get('/centers/:centerId/appointments', async (req, res) => {
  const { db, userId } = res.locals.staff;
  let query = db.from('appointments').select('id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at, professional_user_id').eq('center_id', req.params.centerId).order('starts_at');
  if (!['administrator', 'platform_administrator'].includes(res.locals.role)) query = query.eq('professional_user_id', userId);
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: 'Could not load appointments' }); return; }
  if (['administrator', 'platform_administrator'].includes(res.locals.role)) {
    const { data: names, error: namesError } = await db.rpc('appointment_professional_names', { p_center_id: req.params.centerId });
    if (namesError) { res.status(500).json({ error: 'Could not load professional names' }); return; }
    const byId = new Map((names as { appointment_id: string; display_name: string }[]).map(n => [n.appointment_id, n.display_name]));
    res.json(data.map((row: { id: string }) => ({ ...row, professional_name: byId.get(row.id) ?? null }))); return;
  }
  res.json(data);
});

router.patch('/centers/:centerId/appointments/:appointmentId', async (req, res) => {
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Read-only access' }); return; }
  const { patient_name, patient_email, patient_phone, starts_at, ends_at } = req.body ?? {};
  if (![patient_name, patient_email, patient_phone].every(v => typeof v === 'string' && v.trim().length > 0) ||
      typeof starts_at !== 'string' || typeof ends_at !== 'string' || !Number.isFinite(Date.parse(starts_at)) || !Number.isFinite(Date.parse(ends_at)) || Date.parse(ends_at) <= Date.parse(starts_at)) {
    res.status(400).json({ error: 'Invalid appointment details' }); return;
  }
  const { data, error } = await res.locals.staff.db.from('appointments').update({ patient_name: patient_name.trim(), patient_email: patient_email.trim(), patient_phone: patient_phone.trim(), starts_at, ends_at }).eq('center_id', req.params.centerId).eq('id', req.params.appointmentId).select('id').maybeSingle();
  if (error) { res.status(error.code === '23P01' || error.code === '22023' ? 409 : 400).json({ error: error.code === '23P01' || error.code === '22023' ? 'El horario no está disponible o está fuera del horario de atención.' : 'No se pudo actualizar la cita.' }); return; }
  if (!data) { res.status(404).json({ error: 'Appointment not found' }); return; }
  res.json(data);
});

router.delete('/centers/:centerId/appointments/:appointmentId', async (req, res) => {
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Read-only access' }); return; }
  const { data, error } = await res.locals.staff.db.from('appointments').delete().eq('center_id', req.params.centerId).eq('id', req.params.appointmentId).select('id').maybeSingle();
  if (error) { res.status(500).json({ error: 'Could not delete appointment' }); return; }
  if (!data) { res.status(404).json({ error: 'Appointment not found' }); return; }
  res.json(data);
});

router.get('/centers/:centerId/booking-options', async (req, res) => {
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Acceso de solo lectura.' }); return; }
  const { db } = res.locals.staff;
  const [professionals, services] = await Promise.all([
    db.rpc('staff_booking_professionals', { p_center_id: req.params.centerId }),
    db.from('services').select('id, name, duration_minutes').eq('center_id', req.params.centerId).eq('active', true).order('name'),
  ]);
  if (professionals.error || services.error) { res.status(500).json({ error: 'No se pudieron cargar los servicios y profesionales.' }); return; }
  let availableProfessionals = professionals.data;
  if (req.query.scope === 'personal') {
    const { data: ownId, error: ownError } = await db.rpc('staff_own_professional_id');
    if (ownError) { res.status(500).json({ error: 'No se pudo cargar tu perfil profesional.' }); return; }
    availableProfessionals = professionals.data.filter((professional: { id: string }) => professional.id === ownId);
  }
  res.json({ professionals: availableProfessionals, services: services.data });
});

router.post('/centers/:centerId/appointments', async (req, res) => {
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Acceso de solo lectura.' }); return; }
  const { service_id, starts_at, patient_name, patient_email, patient_phone, scope } = req.body ?? {};
  let professional_id = req.body?.professional_id;
  if (scope === 'personal') {
    const { data, error } = await res.locals.staff.db.rpc('staff_own_professional_id');
    if (error) { res.status(500).json({ error: 'No se pudo cargar tu perfil profesional.' }); return; }
    professional_id = data;
  }
  if (![service_id, professional_id, starts_at, patient_name, patient_email, patient_phone].every(v => typeof v === 'string' && v.trim())) {
    res.status(400).json({ error: 'Completa todos los campos.' }); return;
  }
  const { data, error } = await res.locals.staff.db.rpc('book_staff_appointment', { p_center_id: req.params.centerId, p_service: service_id, p_professional: professional_id, p_start: starts_at, p_name: patient_name, p_email: patient_email, p_phone: patient_phone });
  if (error) {
    const message = error.code === 'P0001' || error.code === '23P01' ? 'El horario no está disponible. Elige otro horario.' : error.code === '42501' ? 'No tienes acceso para agendar con este profesional.' : 'Revisa los datos ingresados.';
    res.status(error.code === '42501' ? 403 : error.code === 'P0001' || error.code === '23P01' ? 409 : 400).json({ error: message }); return;
  }
  res.status(201).json({ id: data });
});
