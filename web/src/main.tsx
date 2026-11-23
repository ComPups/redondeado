import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
type Center = { id: string; name: string; slug: string; description: string; opens_at: string; closes_at: string };

function ApiStatus() {
  const [status, setStatus] = useState('Checking API…');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data: { status: string }) => setStatus(data.status === 'ok' ? 'API connected' : 'API unavailable'))
      .catch(() => { if (!controller.signal.aborted) setStatus('API unavailable'); });
    return () => controller.abort();
  }, []);
  return <p role="status">{status}</p>;
}

function PublicLayout({ slug }: { slug: string }) {
  return <main><h1>Redondeado — Public site</h1><p>Center: {slug}</p><ApiStatus /></main>;
}

function StaffLogin() {
  return <main><h1>Redondeado — Backoffice</h1><h2>Staff sign-in</h2><p>Staff sign-in is not available yet.</p><ApiStatus /></main>;
}

function Centers() {
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', opens_at: '09:00', closes_at: '18:00' });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/api/centers`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error((await response.json()).error || 'No se pudieron cargar los centros.');
      setCenters(await response.json() as Center[]);
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function createCenter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess(''); setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/api/centers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el centro.');
      setCenters(current => [...current, data as Center].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setForm({ name: '', description: '', opens_at: '09:00', closes_at: '18:00' });
      setSuccess('Centro creado correctamente.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el centro.'); }
    finally { setSubmitting(false); }
  }
  return <div className="shell">
    <aside className="sidebar"><a className="brand" href="/staff/centers"><span className="brand-mark">✳</span> redondeado</a><p className="sidebar-label">ESPACIO DE TRABAJO</p><nav aria-label="Navegación principal"><a className="nav-active" href="/staff/centers"><span aria-hidden="true">▦</span> Centros</a></nav><div className="sidebar-note"><strong>Tu espacio de trabajo</strong><p>Gestiona la información de tus centros desde un solo lugar.</p></div></aside>
    <main className="workspace"><header className="topbar"><span>Backoffice <span className="separator">/</span> Centros</span><span className="badge">Gestión local</span></header>
      <div className="content"><div className="page-heading"><div><p className="eyebrow">TU ORGANIZACIÓN</p><h1>Centros</h1><p className="lead">Todos tus espacios de atención, en un solo lugar.</p></div><Button className="button-primary" href="#nuevo-centro">+ Nuevo centro</Button></div>
      {error && <Alert className="notice" variant="danger" role="alert">{error}</Alert>}{success && <Alert className="notice" variant="success" role="status">{success}</Alert>}
      <div className="grid"><section aria-labelledby="centers-heading"><div className="section-heading"><div><h2 id="centers-heading">Centros existentes</h2><p>Revisa los centros registrados.</p></div><span className="count">{centers.length}</span></div>
        {loading ? <div className="empty">Cargando centros…</div> : centers.length === 0 ? <div className="empty"><strong>Aún no hay centros</strong><p>Crea el primero para comenzar.</p></div> : <div className="center-list">{centers.map(center => <article className="center-card" key={center.id}><div className="center-icon" aria-hidden="true">✳</div><div className="center-info"><h3>{center.name}</h3><p>{center.description || 'Sin descripción'}</p><div className="meta"><span>◷ &nbsp;{center.opens_at.slice(0, 5)} – {center.closes_at.slice(0, 5)}</span><span>/{center.slug}</span></div></div><span className="card-tag">Centro</span></article>)}</div>}
      </section><section className="form-card" id="nuevo-centro" aria-labelledby="form-heading"><p className="eyebrow">NUEVO ESPACIO</p><h2 id="form-heading">Crear un centro</h2><p>Agrega la información básica para comenzar.</p><Form onSubmit={createCenter}>
        <Form.Label htmlFor="name">Nombre del centro</Form.Label><Form.Control id="name" required maxLength={120} placeholder="Ej. Centro Bienestar Arrayán" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Form.Label htmlFor="description">Descripción <span>Opcional</span></Form.Label><Form.Control as="textarea" id="description" maxLength={400} rows={4} placeholder="Cuéntanos un poco sobre este centro" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /><div className="hint">{form.description.length}/400 caracteres</div>
        <div className="time-grid"><div><Form.Label htmlFor="opens">Apertura</Form.Label><Form.Control id="opens" type="time" required value={form.opens_at} onChange={e => setForm({ ...form, opens_at: e.target.value })} /></div><div><Form.Label htmlFor="closes">Cierre</Form.Label><Form.Control id="closes" type="time" required value={form.closes_at} onChange={e => setForm({ ...form, closes_at: e.target.value })} /></div></div><p className="form-help">El horario se aplica todos los días.</p>
        <Button type="submit" className="button-primary submit" disabled={submitting}>{submitting ? 'Creando…' : 'Crear centro'}</Button>
      </Form></section></div></div></main></div>;
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isStaff = path === '/staff' || path.startsWith('/staff/');
  const isCenters = path === '/staff/centers';
  useEffect(() => {
    if (isStaff && path !== '/staff/login' && !isCenters) window.location.replace('/staff/login');
  }, [isStaff, path, isCenters]);
  if (isCenters) return <Centers />;
  if (isStaff) return path === '/staff/login' ? <StaffLogin /> : null;
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 1) return <PublicLayout slug={segments[0]} />;
  return <main><h1>Redondeado</h1><p>Choose a center to book an appointment.</p></main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
