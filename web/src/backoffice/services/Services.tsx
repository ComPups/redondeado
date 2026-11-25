import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton';
import { apiFetch } from '../../shared/requestCache';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { apiUrl } from '../../shared/api';
import { formatPrice, type Service } from '../../public/centerProfile';
import { BookingTermsEditor } from '../staff/BookingTermsEditor';
import { ServiceActionButtons } from './ServiceActionButtons';

export function Services({ centerId, centerName, professionalName, token, canEdit, administrator }: { centerId: string; centerName: string; professionalName: string; token: string; canEdit: boolean; administrator: boolean }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [catalog, setCatalog] = useState<Service[]>([]);
  const [catalogId, setCatalogId] = useState('');
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/services`;
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(base, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(setServices).catch(() => { if (!controller.signal.aborted) setError('No pudimos cargar tus servicios.'); });
    apiFetch(`${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/service-catalog`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(setCatalog).catch(() => { if (!controller.signal.aborted) setError('No pudimos cargar el catálogo.'); });
    return () => controller.abort();
  }, [base, token, centerId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    const form = new FormData(event.currentTarget);
    const body = { price_clp: Number(form.get('price')), duration_minutes: Number(form.get('duration')) };
    setBusy(true); setError('');
    try {
      const serviceId = item?.id ?? catalogId;
      const response = await apiFetch(editing === 'new' ? base : `${base}/${serviceId}`, { method: editing === 'new' ? 'POST' : 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...(editing === 'new' ? { service_id: serviceId } : {}) }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw Error(result.error || 'No pudimos guardar el servicio.'); }
      const saved: Service = await response.json();
      setServices(current => [...(current ?? []).filter(s => s.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name))); setEditing(null);

    } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos guardar el servicio.'); } finally { setBusy(false); }
  }
  async function remove(service: Service) {
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`${base}/${service.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw Error();
      setServices(current => (current ?? []).filter(s => s.id !== service.id)); setDeleting(null);
    } catch { setError('No pudimos eliminar el servicio. Inténtalo nuevamente.'); } finally { setBusy(false); }
  }
  const item = editing === 'new' ? null : editing;
  const catalogService = catalog.find(c => c.id === catalogId);
  return <><section className="staff-section staff-page-section" id="servicios"><div className="section-heading"><div><p className="eyebrow">TU CATÁLOGO</p><h1>Servicios ofrecidos</h1><p>Administra los servicios que ofreces en este centro.</p></div><div className="service-actions">{services && <span className="count">{services.length}</span>}{canEdit && <button className="service-add" aria-label="Agregar servicio" onClick={() => { setCatalogId(''); setEditing('new'); }}>+</button>}</div></div>
    {error && !deleting && <p className="notice error" role="alert">{error}</p>}
    {editing && <form key={`${item?.id ?? 'new'}-${catalogId}`} className="form-card service-form" onSubmit={save}><h2>{item ? 'Editar servicio' : 'Agregar servicio'}</h2>{editing === 'new' ? <><label>Servicio del centro<select value={catalogId} required onChange={event => setCatalogId(event.target.value)}><option value="">Selecciona un servicio</option>{catalog.filter(c => !services?.some(s => s.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></> : <p>{item?.name}</p>}<label>Duración (minutos)<input name="duration" type="number" min="1" max="1440" required defaultValue={item?.duration_minutes ?? catalogService?.duration_minutes ?? 60} /></label><label>Precio (CLP)<input name="price" type="number" min="0" max="2147483647" required defaultValue={item?.price_clp ?? catalogService?.price_clp ?? 0} /></label><div className="service-actions"><button className="button button-primary btn" disabled={busy}>Guardar</button><button type="button" className="staff-signout" onClick={() => setEditing(null)}>Cancelar</button></div></form>}
    {!services ? !error && <LoadingSkeleton label="Cargando servicios…" /> : services.length ? <div className="staff-list">{services.map(service => <article className="staff-row" key={service.id}><div className="staff-row-icon" aria-hidden="true">✳︎</div><div><h3>{service.name}</h3><p>{service.duration_minutes} minutos</p></div><strong>{formatPrice(service.price_clp)}</strong>{canEdit && <ServiceActionButtons name={service.name} disabled={busy} onEdit={() => setEditing(service)} onDelete={() => { setError(''); setDeleting(service); }} />}</article>)}</div> : <div className="empty">Aún no tienes servicios disponibles.</div>}
    <Modal aria-labelledby="delete-service-title" show={!!deleting} onHide={() => { if (!busy) { setDeleting(null); setError(''); } }} centered className="confirm-delete-modal" backdropClassName="confirm-delete-backdrop"><Modal.Header closeButton={!busy}><Modal.Title id="delete-service-title">Eliminar servicio</Modal.Title></Modal.Header><Modal.Body><p>¿Eliminar {deleting?.name} de tus servicios? Esta acción no se puede deshacer.</p>{error && <p className="notice error" role="alert">{error}</p>}</Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => { setDeleting(null); setError(''); }} disabled={busy}>Cancelar</Button><Button variant="danger" onClick={() => { if (deleting) void remove(deleting); }} disabled={busy}>Confirmar eliminación</Button></Modal.Footer></Modal>
  </section>{services && canEdit && <BookingTermsEditor key={`${centerId}-${services.map(s => s.id).join(',')}`} centerId={centerId} token={token} centerName={centerName} professionalName={professionalName} services={services} administrator={administrator} />}</>;
}
