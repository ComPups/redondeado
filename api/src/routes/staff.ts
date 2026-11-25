import { Router, type Response } from 'express';
import type { PoolClient } from 'pg';

async function query(res: Response, text: string, values: unknown[] = []) {
  const { sql, userId } = res.locals.staff;
  try { const result = await sql.transaction({ kind: 'staff', userId }, (client: PoolClient) => client.query(text, values)); return { data: result.rows, error: null }; }
  catch (error) { return { data: [], error: error as { code?: string; message?: string } }; }
}
import { requireCenterAccess } from '../middleware/centerAccess.js';

export const staffRoutes = Router();
const router = staffRoutes;

router.get('/me', async (_req, res) => {
  const { data: rows, error } = await query(res, 'select public.staff_display_name() as value');
  const data = rows[0]?.value;
  if (error) { res.status(500).json({ error: 'Could not load staff profile' }); return; }
  res.json({ platformAdmin: res.locals.staff.platformAdmin, displayName: data });
});

router.get('/centers', async (_req, res) => {
  const { userId, platformAdmin } = res.locals.staff;
  if (platformAdmin) {
    const { data, error } = await query(res, 'select id, name, slug, description, opens_at, closes_at from public.centers');
    if (error) { res.status(500).json({ error: 'Could not load centers' }); return; }
    res.json(data.map((center: { id: string; name: string; slug: string; description: string; opens_at: string; closes_at: string }) => ({ center_id: center.id, role: 'platform_administrator', centers: center }))); return;
  }
  const { data, error } = await query(res, `select m.center_id, m.role, json_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'description', c.description, 'opens_at', c.opens_at, 'closes_at', c.closes_at) as centers from public.center_memberships m left join public.centers c on c.id = m.center_id where m.user_id = $1`, [userId]);
  if (error) { res.status(500).json({ error: 'Could not load centers' }); return; }
  res.json(data);
});

router.use('/centers/:centerId', requireCenterAccess);

router.get('/centers/:centerId', (req, res) => {
  res.json({ centerId: req.params.centerId, role: res.locals.role });
});

router.get('/centers/:centerId/appointments', async (req, res) => {
  const { userId } = res.locals.staff;
  const period = req.query.period ?? 'upcoming';
  const scope = req.query.scope ?? 'personal';
  const pageText = req.query.page ?? '1';
  if ((period !== 'upcoming' && period !== 'past') || (scope !== 'personal' && scope !== 'center') || typeof pageText !== 'string' || !/^[1-9]\d{0,5}$/.test(pageText)) {
    res.status(400).json({ error: 'Invalid agenda filter' }); return;
  }
  const page = Number(pageText);
  const pageSize = 50;
  const personal = scope === 'personal' || !['administrator', 'platform_administrator'].includes(res.locals.role);
  const comparison = period === 'past' ? '<' : '>=';
  const direction = period === 'past' ? 'desc' : 'asc';
  const statement = `with filtered as materialized (
    select id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at, professional_user_id
    from public.appointments where center_id = $1 and (not $2::boolean or professional_user_id = $3)
      and starts_at ${comparison} $4::timestamptz
  ), page_rows as (select * from filtered order by starts_at ${direction}, id ${direction} limit $5 offset $6)
  select (select count(*)::integer from filtered) as count, coalesce((select json_agg(page_rows) from page_rows), '[]'::json) as appointments`;
  const result = await query(res, statement, [req.params.centerId, personal, userId, new Date().toISOString(), pageSize, (page - 1) * pageSize]);
  if (result.error || !result.data[0]) { res.status(500).json({ error: 'Could not load appointments' }); return; }
  const data = result.data[0].appointments;
  const count = result.data[0].count;
  if (['administrator', 'platform_administrator'].includes(res.locals.role) && data.length) {
    const { data: names, error: namesError } = await query(res, 'select * from public.appointment_professional_names($1) where appointment_id = any($2::uuid[])', [req.params.centerId, data.map((row: { id: string }) => row.id)]);
    if (namesError) { res.status(500).json({ error: 'Could not load professional names' }); return; }
    const byId = new Map((names as { appointment_id: string; display_name: string }[]).map(n => [n.appointment_id, n.display_name]));
    res.json({ appointments: data.map((row: { id: string }) => ({ ...row, professional_name: byId.get(row.id) ?? null })), page, has_more: page * pageSize < count }); return;
  }
  res.json({ appointments: data, page, has_more: page * pageSize < count });
});

router.patch('/centers/:centerId/appointments/:appointmentId', async (req, res) => {
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Read-only access' }); return; }
  const { patient_name, patient_email, patient_phone, starts_at, ends_at } = req.body ?? {};
  if (typeof patient_name !== 'string' || patient_name.trim().length < 2 || patient_name.trim().length > 120 ||
      typeof patient_email !== 'string' || patient_email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient_email.trim()) ||
      typeof patient_phone !== 'string' || !/^\+?[0-9 ()-]{7,20}$/.test(patient_phone.trim()) || patient_phone.replace(/[^0-9]/g, '').length < 7 ||
      typeof starts_at !== 'string' || typeof ends_at !== 'string' || !Number.isFinite(Date.parse(starts_at)) || !Number.isFinite(Date.parse(ends_at)) || Date.parse(ends_at) <= Date.parse(starts_at)) {
    res.status(400).json({ error: 'Invalid appointment details' }); return;
  }
  const { data: rows, error } = await query(res, 'update public.appointments set patient_name = $1, patient_email = $2, patient_phone = $3, starts_at = $4, ends_at = $5 where center_id = $6 and id = $7 returning id', [patient_name.trim(), patient_email.trim(), patient_phone.trim(), starts_at, ends_at, req.params.centerId, req.params.appointmentId]);
  const data = rows[0];
  if (error) { const conflict = error.code === '23P01' || (error.code === '22023' && error.message !== 'Invalid patient details'); res.status(conflict ? 409 : 400).json({ error: conflict ? 'El horario no está disponible o está fuera del horario de atención.' : 'Revisa los datos del paciente.' }); return; }
  if (!data) { res.status(404).json({ error: 'Appointment not found' }); return; }
  res.json(data);
});

router.delete('/centers/:centerId/appointments/:appointmentId', async (req, res) => {
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Read-only access' }); return; }
  const { data: rows, error } = await query(res, 'delete from public.appointments where center_id = $1 and id = $2 returning id', [req.params.centerId, req.params.appointmentId]);
  const data = rows[0];
  if (error) { res.status(500).json({ error: 'Could not delete appointment' }); return; }
  if (!data) { res.status(404).json({ error: 'Appointment not found' }); return; }
  res.json(data);
});

router.get('/centers/:centerId/booking-options', async (req, res) => {
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Acceso de solo lectura.' }); return; }
  const [professionals, services] = await Promise.all([
    query(res, 'select * from public.staff_booking_professionals($1)', [req.params.centerId]),
    query(res, 'select id, name, duration_minutes from public.services where center_id = $1 and active order by name', [req.params.centerId]),
  ]);
  if (professionals.error || services.error) { res.status(500).json({ error: 'No se pudieron cargar los servicios y profesionales.' }); return; }
  let availableProfessionals = professionals.data;
  if (req.query.scope === 'personal') {
    const { data: ownRows, error: ownError } = await query(res, 'select public.staff_own_professional_id() as value');
    const ownId = ownRows[0]?.value;
    if (ownError) { res.status(500).json({ error: 'No se pudo cargar tu perfil profesional.' }); return; }
    availableProfessionals = professionals.data.filter((professional: { id: string }) => professional.id === ownId);
  }
  res.json({ professionals: availableProfessionals, services: services.data });
});

router.get('/centers/:centerId/availability', async (req, res) => {
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Acceso de solo lectura.' }); return; }
  const { service_id, professional_id } = req.query;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof service_id !== 'string' || !uuid.test(service_id) || typeof professional_id !== 'string' || !uuid.test(professional_id)) {
    res.status(400).json({ error: 'Selecciona un servicio y profesional válidos.' }); return;
  }
  const { data: centers, error: centerError } = await query(res, 'select slug from public.centers where id = $1', [req.params.centerId]);
  const center = centers[0];
  if (centerError || !center) { res.status(500).json({ error: 'No se pudo cargar el centro.' }); return; }
  try {
    const slots = await res.locals.publicDb.transaction({ kind: 'public' }, async (client: import('pg').PoolClient) => (await client.query('select * from public.public_availability($1, $2, $3)', [center.slug, service_id, professional_id])).rows);
    res.json(slots);
  } catch { res.status(500).json({ error: 'No se pudieron cargar los horarios disponibles.' }); }
});

router.post('/centers/:centerId/appointments', async (req, res) => {
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Acceso de solo lectura.' }); return; }
  const { service_id, starts_at, patient_name, patient_email, patient_phone, scope } = req.body ?? {};
  let professional_id = req.body?.professional_id;
  if (scope === 'personal') {
    const { data: rows, error } = await query(res, 'select public.staff_own_professional_id() as value');
    const data = rows[0]?.value;
    if (error) { res.status(500).json({ error: 'No se pudo cargar tu perfil profesional.' }); return; }
    professional_id = data;
  }
  if (![service_id, professional_id, starts_at, patient_name, patient_email, patient_phone].every(v => typeof v === 'string' && v.trim())) {
    res.status(400).json({ error: 'Completa todos los campos.' }); return;
  }
  const { data: rows, error } = await query(res, 'select public.book_staff_appointment($1, $2, $3, $4, $5, $6, $7) as value', [req.params.centerId, service_id, professional_id, starts_at, patient_name, patient_email, patient_phone]);
  const data = rows[0]?.value;
  if (error) {
    const message = error.code === 'P0001' || error.code === '23P01' ? 'El horario no está disponible. Elige otro horario.' : error.code === '42501' ? 'No tienes acceso para agendar con este profesional.' : 'Revisa los datos ingresados.';
    res.status(error.code === '42501' ? 403 : error.code === 'P0001' || error.code === '23P01' ? 409 : 400).json({ error: message }); return;
  }
  res.status(201).json({ id: data });
});
const termsScope = (scope: string) => scope === 'center' ? null : scope;
const validTermsScope = (scope: string) => scope === 'center' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope);

router.get('/centers/:centerId/terms', async (req, res) => {
  const { data, error } = await query(res, 'select * from public.staff_booking_terms($1)', [req.params.centerId]);
  if (error) { res.status(500).json({ error: 'Could not load terms' }); return; }
  res.json(data);
});

async function writeTerms(req: import('express').Request, res: import('express').Response, withdraw: boolean) {
  const scope = req.params.scope as string;
  if (res.locals.role === 'limited') { res.status(403).json({ error: 'Read-only access' }); return; }
  if (!validTermsScope(scope)) { res.status(400).json({ error: 'Invalid service' }); return; }
  if (scope === 'center' && res.locals.role !== 'administrator') { res.status(403).json({ error: 'Center administrator required' }); return; }
  const body = withdraw ? null : req.body?.body;
  if (!withdraw && (typeof body !== 'string' || !body.trim() || body.length > 30000)) { res.status(400).json({ error: 'Invalid terms' }); return; }
  const { data: rows, error } = await query(res, 'select public.manage_booking_terms($1, $2, $3) as value', [req.params.centerId, termsScope(scope), body]);
  const data = rows[0]?.value;
  if (error) { res.status(error.code === '42501' ? 403 : error.code === '22023' ? 400 : 500).json({ error: 'Could not update terms' }); return; }
  if (withdraw) { res.status(204).end(); return; }
  res.status(req.method === 'POST' ? 201 : 200).json({ id: data, service_id: termsScope(scope), body });
}

// Publishing creates a new immutable version; withdrawal keeps prior acceptances.
router.post('/centers/:centerId/terms/:scope', (req, res) => void writeTerms(req, res, false));
router.put('/centers/:centerId/terms/:scope', (req, res) => void writeTerms(req, res, false));
router.delete('/centers/:centerId/terms/:scope', (req, res) => void writeTerms(req, res, true));
