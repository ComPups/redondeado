import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton';
import { apiFetch } from '../../shared/requestCache';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { apiUrl } from '../../shared/api';
import type { Service } from '../../public/centerProfile';
import { ServiceActionButtons } from './ServiceActionButtons';

export function ServiceCatalog({ centerId, token, canManage }: { centerId: string; token: string; canManage: boolean }) {
  const [catalog, setCatalog] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/service-catalog`;
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(base, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json(); })
      .then(setCatalog).catch(() => { if (!controller.signal.aborted) setError('No pudimos cargar el catálogo.'); });
    return () => controller.abort();
  }, [base, token]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    const form = new FormData(event.currentTarget);
    const body = { name: form.get('name'), description: form.get('description'), ...(editing === 'new' ? { price_clp: Number(form.get('price')), duration_minutes: Number(form.get('duration')) } : {}) };
    setBusy(true); setError('');
    try {
      const response = await apiFetch(editing === 'new' ? base : `${base}/${editing.id}`, { method: editing === 'new' ? 'POST' : 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw Error(result.error || 'No pudimos guardar el servicio.'); }
      const saved: Service = await response.json();
      setCatalog(current => [...(current ?? []).filter(service => service.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'No pudimos guardar el servicio.'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return; setBusy(true); setError('');
    try {
      const response = await apiFetch(`${base}/${deleting.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw Error();
      setCatalog(current => current?.filter(service => service.id !== deleting.id) ?? null); setDeleting(null);
    } catch { setError('No pudimos eliminar el servicio del centro.'); } finally { setBusy(false); }
  }
  const item = editing === 'new' ? null : editing;
  return <section className="staff-section staff-page-section" aria-labelledby="catalog-heading">
    <div className="section-heading"><div><h2 id="catalog-heading">Catálogo del centro</h2><p>Administra los servicios disponibles para los profesionales del centro.</p></div>{canManage && <button className="button button-primary btn" type="button" onClick={() => { setError(''); setEditing('new'); }}>+ Agregar servicio</button>}</div>
    {error && !deleting && <p className="notice error" role="alert">{error}</p>}
    {editing && <form key={item?.id ?? 'new'} className="form-card service-form" onSubmit={save}>
      <h2>{item ? 'Editar servicio del centro' : 'Agregar servicio al centro'}</h2>
      <label>Nombre<input name="name" defaultValue={item?.name} required maxLength={120} /></label>
      <label>Descripción<textarea name="description" defaultValue={item?.description ?? ''} maxLength={400} /></label>
      {!item && <><label>Duración sugerida (minutos)<input name="duration" type="number" min="1" max="1440" defaultValue={60} required /></label><label>Precio sugerido (CLP)<input name="price" type="number" min="0" max="2147483647" defaultValue={0} required /></label><p className="form-help">Cada profesional puede definir su propio precio y duración.</p></>}
      <div className="service-actions"><button className="button button-primary btn" disabled={busy}>Guardar</button><button className="staff-signout" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancelar</button></div>
    </form>}
    {!catalog ? !error && <LoadingSkeleton label="Cargando catálogo…" /> : catalog.length ? <div className="staff-list">{catalog.map(service => <article className="staff-row catalog-service-row" key={service.id}><div><h3>{service.name}</h3><p>{service.description}</p></div>{canManage && <ServiceActionButtons name={service.name} disabled={busy} onEdit={() => { setError(''); setEditing(service); }} onDelete={() => { setError(''); setDeleting(service); }} />}</article>)}</div> : <div className="empty">El centro aún no tiene servicios.</div>}
    <Modal aria-labelledby="delete-catalog-service-title" show={!!deleting} onHide={() => { if (!busy) { setDeleting(null); setError(''); } }} centered className="confirm-delete-modal" backdropClassName="confirm-delete-backdrop"><Modal.Header closeButton={!busy}><Modal.Title id="delete-catalog-service-title">Eliminar servicio del centro</Modal.Title></Modal.Header><Modal.Body><p>¿Eliminar {deleting?.name}? Dejará de estar disponible para todos los profesionales. Las citas existentes se conservarán.</p>{error && <p className="notice error" role="alert">{error}</p>}</Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => { setDeleting(null); setError(''); }} disabled={busy}>Cancelar</Button><Button variant="danger" onClick={() => void remove()} disabled={busy}>Confirmar eliminación</Button></Modal.Footer></Modal>
  </section>;
}
