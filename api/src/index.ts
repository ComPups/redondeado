import cors from 'cors';
import express from 'express';
import { authenticateStaff } from './middleware/auth.js';
import { platformRoutes } from './routes/platform.js';
import { staffRoutes } from './routes/staff.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required');

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/staff', authenticateStaff(url, key), platformRoutes, staffRoutes);

app.listen(port, '127.0.0.1', () => console.log(`API listening on http://127.0.0.1:${port}`));
