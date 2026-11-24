import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import express from 'express';
import { authenticateStaff } from './middleware/auth.js';
import { platformRoutes } from './routes/platform.js';
import { publicRoutes } from './routes/public.js';
import { staffRoutes } from './routes/staff.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !key || !secret) throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required');

app.use(cors({ origin: webOrigin }));
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/public', publicRoutes(url, secret));
const publicDb = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
app.use('/staff', authenticateStaff(url, key), (_req, res, next) => { res.locals.publicDb = publicDb; next(); }, platformRoutes, staffRoutes);

app.listen(port, '127.0.0.1', () => console.log(`API listening on http://127.0.0.1:${port}`));
