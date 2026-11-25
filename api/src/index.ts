import cors from 'cors';
import express from 'express';
import { createDatabase } from './db.js';
import { authenticateStaff } from './middleware/auth.js';
import { platformRoutes } from './routes/platform.js';
import { publicRoutes } from './routes/public.js';
import { staffRoutes } from './routes/staff.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
if (!url || !key || !databaseUrl) throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DATABASE_URL are required');
const parsedDatabaseUrl = new URL(databaseUrl);
for (const option of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
  if (parsedDatabaseUrl.searchParams.has(option)) throw new Error(`Configure TLS outside DATABASE_URL: ${option} overrides driver TLS settings`);
}
if (process.env.DB_SSL_MODE && !['disable', 'verify'].includes(process.env.DB_SSL_MODE)) throw new Error('DB_SSL_MODE must be verify or disable');
const db = createDatabase({ connectionString: databaseUrl, max: Number(process.env.DB_POOL_MAX ?? 5), connectionTimeoutMillis: Number(process.env.DB_ACQUIRE_TIMEOUT_MS ?? 5000), ssl: process.env.DB_SSL_MODE === 'disable' ? false : { rejectUnauthorized: true } }, Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15000));

app.use(cors({ origin: webOrigin }));
app.use(express.json({ limit: '128kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/public', publicRoutes(db));
app.use('/staff', authenticateStaff(url, key, db), (_req, res, next) => { res.locals.publicDb = db; next(); }, platformRoutes, staffRoutes);

const server = app.listen(port, '127.0.0.1', () => console.log(`API listening on http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  server.close(() => { void db.close().then(() => process.exit(0), () => process.exit(1)); });
});
