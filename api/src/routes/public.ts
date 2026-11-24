import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Router } from 'express';

// Use the public key only; booking validation remains in the database.
export function publicRoutes(url: string, key: string, client?: SupabaseClient) {
  const router = Router();
  const db = client ?? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  router.get('/centers/:slug/availability', async (req, res) => {
    const { service_id, professional_id } = req.query;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof service_id !== 'string' || !uuid.test(service_id) || typeof professional_id !== 'string' || !uuid.test(professional_id)) {
      res.status(400).json({ error: 'Selecciona un servicio y profesional válidos.' }); return;
    }
    const slots: { starts_at: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.rpc('public_availability', { p_slug: req.params.slug, p_service: service_id, p_professional: professional_id }).range(from, from + 999);
      if (error) { res.status(500).json({ error: 'No se pudieron cargar los horarios disponibles.' }); return; }
      const page = (data ?? []) as { starts_at: string }[];
      slots.push(...page);
      if (page.length < 1000) break;
    }
    res.json(slots);
  });
  router.post('/centers/:slug/appointments', async (req, res) => {
    const { service_id, professional_id, starts_at, patient_name, patient_email, patient_phone } = req.body ?? {};
    const values = [service_id, professional_id, starts_at, patient_name, patient_email, patient_phone];
    if (!values.every(v => typeof v === 'string' && v.trim())) { res.status(400).json({ error: 'Completa todos los campos.' }); return; }
    const { error } = await db.rpc('book_public_appointment', { p_slug: req.params.slug, p_service: service_id, p_professional: professional_id, p_start: starts_at, p_name: patient_name, p_email: patient_email, p_phone: patient_phone });
    if (error) {
      if (error.code === 'P0001' || error.code === '23P01') { res.status(409).json({ error: 'Este horario ya no está disponible. Elige otro horario actualizado.' }); return; }
      if (['22023', '22P02', '22007', '22008'].includes(error.code)) { res.status(400).json({ error: 'No pudimos reservar. Revisa tus datos e inténtalo de nuevo.' }); return; }
      res.status(500).json({ error: 'No pudimos procesar la reserva. Inténtalo nuevamente.' }); return;
    }
    res.status(201).json({ success: true });
  });
  return router;
}
