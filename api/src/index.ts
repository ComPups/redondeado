import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import express from 'express';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required');

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Construct a client per request so user credentials never leak between requests.
app.use('/staff', async (req, res, next) => {
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
});

app.get('/staff/me', (_req, res) => res.json({ platformAdmin: res.locals.staff.platformAdmin }));

app.use('/staff/platform', (_req, res, next) => {
  if (!res.locals.staff.platformAdmin) { res.status(403).json({ error: 'Platform administrator access required' }); return; }
  next();
});

app.post('/staff/platform/centers', async (req, res) => {
  const { name, description = '', opens_at = '09:00', closes_at = '18:00' } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || typeof description !== 'string' || description.length > 400 ||
    typeof opens_at !== 'string' || typeof closes_at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(opens_at) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closes_at) || opens_at >= closes_at) {
    res.status(400).json({ error: 'Revisa el nombre, la descripción y los horarios del centro.' }); return;
  }
  const slug = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug || slug === 'staff') { res.status(400).json({ error: 'Elige un nombre que genere una dirección válida.' }); return; }
  const { data, error } = await res.locals.staff.db.from('centers').insert({ name: name.trim(), slug, description: description.trim(), opens_at, closes_at }).select('id, name, slug, description, opens_at, closes_at').single();
  if (error) { res.status(error.code === '23505' ? 409 : 400).json({ error: error.code === '23505' ? 'Ya existe un centro con esa dirección.' : 'No se pudo crear el centro.' }); return; }
  res.status(201).json(data);
});

const editable: Record<string, { key: string; columns: string[]; fields: string }> = {
  centers: { key: 'id', columns: ['name', 'slug', 'description', 'opens_at', 'closes_at'], fields: 'id, name, slug, description, opens_at, closes_at' },
  services: { key: 'id', columns: ['name', 'price_clp', 'duration_minutes', 'active'], fields: 'id, center_id, name, price_clp, duration_minutes, active' },
  appointments: { key: 'id', columns: ['professional_user_id', 'service_id', 'service_name', 'patient_name', 'patient_email', 'patient_phone', 'starts_at', 'ends_at'], fields: 'id, center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at' },
  staff_profiles: { key: 'professional_id', columns: ['display_name'], fields: 'professional_id, display_name' },
};
app.get('/staff/platform/:entity', async (req, res) => {
  const config = editable[req.params.entity];
  if (!config) { res.status(404).json({ error: 'Unknown entity' }); return; }
  const { data, error } = await res.locals.staff.db.from(req.params.entity).select(config.fields);
  if (error) { res.status(500).json({ error: 'Could not load records' }); return; }
  res.json(data);
});
app.patch('/staff/platform/:entity/:id', async (req, res) => {
  const config = editable[req.params.entity];
  if (!config) { res.status(404).json({ error: 'Unknown entity' }); return; }
  const changes = req.body;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length || Object.keys(changes).some(k => !config.columns.includes(k))) {
    res.status(400).json({ error: 'Invalid fields' }); return;
  }
  const { data, error } = await res.locals.staff.db.from(req.params.entity).update(changes).eq(config.key, req.params.id).select(config.fields).maybeSingle();
  if (error) { res.status(400).json({ error: 'Could not update record' }); return; }
  if (!data) { res.status(404).json({ error: 'Record not found' }); return; }
  res.json(data);
});

app.get('/staff/platform-memberships', async (_req, res) => {
  if (!res.locals.staff.platformAdmin) { res.status(403).json({ error: 'Platform administrator access required' }); return; }
  const { data, error } = await res.locals.staff.db.from('center_memberships').select('center_id, user_id, role');
  if (error) { res.status(500).json({ error: 'Could not load memberships' }); return; }
  res.json(data);
});
app.patch('/staff/platform-memberships/:centerId/:userId', async (req, res) => {
  if (!res.locals.staff.platformAdmin) { res.status(403).json({ error: 'Platform administrator access required' }); return; }
  if (!['administrator', 'member', 'limited'].includes(req.body?.role)) { res.status(400).json({ error: 'Invalid role' }); return; }
  const { data, error } = await res.locals.staff.db.from('center_memberships').update({ role: req.body.role }).eq('center_id', req.params.centerId).eq('user_id', req.params.userId).select('center_id, user_id, role').maybeSingle();
  if (error) { res.status(400).json({ error: 'Could not update membership' }); return; }
  if (!data) { res.status(404).json({ error: 'Membership not found' }); return; }
  res.json(data);
});

app.get('/staff/centers', async (_req, res) => {
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

app.use('/staff/centers/:centerId', async (req, res, next) => {
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
});

app.get('/staff/centers/:centerId', (req, res) => {
  res.json({ centerId: req.params.centerId, role: res.locals.role });
});

app.get('/staff/centers/:centerId/appointments', async (req, res) => {
  const { db, userId } = res.locals.staff;
  let query = db.from('appointments').select('id, service_name, patient_name, starts_at, ends_at, professional_user_id').eq('center_id', req.params.centerId).order('starts_at');
  if (!['administrator', 'platform_administrator'].includes(res.locals.role)) query = query.eq('professional_user_id', userId);
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: 'Could not load appointments' }); return; }
  res.json(data);
});

app.listen(port, '127.0.0.1', () => console.log(`API listening on http://127.0.0.1:${port}`));
