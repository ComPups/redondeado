import cors from 'cors';
import express from 'express';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const managementEnabled = process.env.ENABLE_LOCAL_CENTER_MANAGEMENT === 'true';

// This temporary unauthenticated baseline is deliberately limited to the local
// Supabase stack. COM-9/COM-16 must replace it with verified staff access.
function localDatabaseUrl(): URL | null {
  if (!managementEnabled || !supabaseUrl || !secretKey) return null;
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/centers', async (_req, res) => {
  const base = localDatabaseUrl();
  if (!base) { res.status(503).json({ error: 'La gestión local de centros no está configurada.' }); return; }
  try {
    const url = new URL('/rest/v1/centers?select=id,name,slug,description,opens_at,closes_at&order=name.asc', base);
    const response = await fetch(url, { headers: { apikey: secretKey!, Authorization: `Bearer ${secretKey}` } });
    if (!response.ok) throw new Error('Database request failed');
    res.json(await response.json());
  } catch { res.status(502).json({ error: 'No se pudieron cargar los centros.' }); }
});

app.post('/api/centers', async (req, res) => {
  const base = localDatabaseUrl();
  if (!base) { res.status(503).json({ error: 'La gestión local de centros no está configurada.' }); return; }
  const { name, description, opens_at, closes_at } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || typeof description !== 'string' || description.length > 400 ||
      typeof opens_at !== 'string' || typeof closes_at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(opens_at) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closes_at) || opens_at >= closes_at) {
    res.status(400).json({ error: 'Revisa el nombre, la descripción y los horarios del centro.' }); return;
  }
  const slug = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug || slug === 'staff') { res.status(400).json({ error: 'Elige un nombre que genere una dirección válida.' }); return; }
  try {
    const response = await fetch(new URL('/rest/v1/centers?select=id,name,slug,description,opens_at,closes_at', base), {
      method: 'POST', headers: { apikey: secretKey!, Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ name: name.trim(), slug, description: description.trim(), opens_at, closes_at }),
    });
    if (response.status === 409) { res.status(409).json({ error: 'Ya existe un centro con esa dirección.' }); return; }
    if (!response.ok) throw new Error('Database request failed');
    const centers = await response.json() as unknown[];
    res.status(201).json(centers[0]);
  } catch { res.status(502).json({ error: 'No se pudo crear el centro.' }); }
});

app.listen(port, '127.0.0.1', () => console.log(`API listening on http://127.0.0.1:${port}`));
