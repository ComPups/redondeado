import { Router } from 'express';
import type { createDatabase } from '../db.js';
import { availability } from '../services/availability.js';
import { bookPublicAppointment } from '../services/booking.js';
import { publicBookingTerms } from '../services/bookingTerms.js';
import { publicCenterProfile } from '../services/publicProfile.js';
import { errorCode } from '../services/workflowErrors.js';

type Database = ReturnType<typeof createDatabase>;
const publicIdentity = { kind: 'public' } as const;

export function publicRoutes(db: Database) {
  const router = Router();
  router.get('/centers/:slug', async (req, res) => {
    try {
      const data = await db.workflowTransaction(publicIdentity, client => publicCenterProfile(client, req.params.slug));
      if (!data) { res.status(404).json({ error: 'Center not found' }); return; }
      res.json(data);
    } catch { res.status(500).json({ error: 'Could not load center' }); }
  });
  router.get('/centers/:slug/availability', async (req, res) => {
    const { service, professional } = req.query;
    if (typeof service !== 'string' || typeof professional !== 'string') { res.status(400).json({ error: 'Invalid selection' }); return; }
    try {
      const slots = await db.workflowTransaction(publicIdentity, client => availability(client, req.params.slug, service, professional));
      res.json(slots);
    } catch { res.status(400).json({ error: 'Could not load availability' }); }
  });
  router.get('/centers/:slug/terms', async (req, res) => {
    const { service, professional } = req.query;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof service !== 'string' || !uuid.test(service) || typeof professional !== 'string' || !uuid.test(professional)) { res.status(400).json({ error: 'Invalid selection' }); return; }
    try {
      const data = await db.workflowTransaction(publicIdentity, client => publicBookingTerms(client, req.params.slug, service, professional));
      res.json(data);
    } catch { res.status(500).json({ error: 'Could not load terms' }); }
  });
  router.post('/centers/:slug/bookings', async (req, res) => {
    const { service, professional, start, name, email, phone, expected_price_clp, terms = [] } = req.body ?? {};
    if (![service, professional, start, name, email, phone].every(value => typeof value === 'string') || !Number.isSafeInteger(expected_price_clp) || expected_price_clp < 0 || expected_price_clp > 2147483647 || !Array.isArray(terms) || !terms.every(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) { res.status(400).json({ error: 'Invalid booking' }); return; }
    try {
      await db.workflowTransaction(publicIdentity, client => bookPublicAppointment(client, { slug: req.params.slug, serviceId: service, professionalId: professional, start, name, email, phone, terms, expectedPrice: expected_price_clp }));
      res.status(201).json({ success: true });
    } catch (error) {
      const code = errorCode(error);
      if (code === 'P0002') { res.status(409).json({ error: 'Price changed', code: 'PRICE_CHANGED' }); return; }
      if (code === 'PT409') { res.status(409).json({ error: 'Terms changed or not accepted', code: 'TERMS_CHANGED' }); return; }
      res.status(code === '23P01' || code === 'P0001' ? 409 : 400).json({ error: 'Could not book appointment' });
    }
  });
  return router;
}
