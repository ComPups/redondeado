import { createClient } from '@supabase/supabase-js';
import { Router } from 'express';

export function publicRoutes(url: string, secret: string) {
  const router = Router();
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  router.get('/centers/:slug', async (req, res) => {
    const { data, error } = await db.rpc('public_center_profile', { center_slug: req.params.slug });
    if (error) { res.status(500).json({ error: 'Could not load center' }); return; }
    if (!data) { res.status(404).json({ error: 'Center not found' }); return; }
    res.json(data);
  });
  router.get('/centers/:slug/availability', async (req, res) => {
    const { service, professional } = req.query;
    if (typeof service !== 'string' || typeof professional !== 'string') { res.status(400).json({ error: 'Invalid selection' }); return; }
    const slots = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.rpc('public_availability', { p_slug: req.params.slug, p_service: service, p_professional: professional }).range(from, from + 999);
      if (error) { res.status(400).json({ error: 'Could not load availability' }); return; }
      slots.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    res.json(slots);
  });
  router.get('/centers/:slug/terms', async (req, res) => {
    const { service, professional } = req.query;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof service !== 'string' || !uuid.test(service) || typeof professional !== 'string' || !uuid.test(professional)) { res.status(400).json({ error: 'Invalid selection' }); return; }
    const { data, error } = await db.rpc('public_booking_terms', { p_slug: req.params.slug, p_service: service, p_professional: professional });
    if (error) { res.status(500).json({ error: 'Could not load terms' }); return; }
    res.json(data);
  });
  router.post('/centers/:slug/bookings', async (req, res) => {
    const { service, professional, start, name, email, phone, terms = [] } = req.body ?? {};
    if (![service, professional, start, name, email, phone].every(value => typeof value === 'string') || !Array.isArray(terms) || !terms.every(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) { res.status(400).json({ error: 'Invalid booking' }); return; }
    const { error } = await db.rpc('book_public_appointment', { p_slug: req.params.slug, p_service: service, p_professional: professional, p_start: start, p_name: name, p_email: email, p_phone: phone, p_terms: terms });
    if (error?.code === 'PT409') { res.status(409).json({ error: 'Terms changed or not accepted', code: 'TERMS_CHANGED' }); return; }
    if (error) { res.status(error.code === '23P01' || error.code === 'P0001' ? 409 : 400).json({ error: 'Could not book appointment' }); return; }
    res.status(201).json({ success: true });
  });
  return router;
}
