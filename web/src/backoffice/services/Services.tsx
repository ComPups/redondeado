import { useEffect, useState, type FormEvent } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { apiUrl } from '../../shared/api';
import { formatPrice, type Service } from '../../public/centerProfile';
import { BookingTermsEditor } from '../staff/BookingTermsEditor';

export function Services({ centerId, centerName, professionalName, token, canEdit, administrator }: { centerId: string; centerName: string; professionalName: string; token: string; canEdit: boolean; administrator: boolean }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [concepts, setConcepts] = useState<Service[]>([]);
  const [conceptId, setConceptId] = useState('');
  const [catalogEditing, setCatalogEditing] = useState<Service | null>(null);
  const [catalogDeleting, setCatalogDeleting] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/services`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(base, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(setServices).catch(() => { if (!controller.signal.aborted) setError('No pudimos cargar tus servicios.'); });
    fetch(`${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/service-catalog`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(setConcepts).catch(() => { if (!controller.signal.aborted) setError('No pudimos cargar el catálogo.'); });
    return () => controller.abort();
  }, [base, token, centerId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    const form = new FormData(event.currentTarget);
    const body = { price_clp: Number(form.get('price')), duration_minutes: Number(form.get('duration')) };
    setBusy(true); setError('');
    try {
      let serviceId = item?.id ?? conceptId;
      if (editing === 'new' && conceptId === 'new') {
        const catalogResponse = await fetch(`${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/service-catalog`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, name: form.get('name'), description: form.get('description') }) });
        if (!catalogResponse.ok) throw Error('No pudimos crear el servicio del centro.');
        const catalogService: Service = await catalogResponse.json(); serviceId = catalogService.id;
        setConcepts(current => [...current, catalogService]); setConceptId(serviceId);
      }
      const response = await fetch(editing === 'new' ? base : `${base}/${serviceId}`, { method: editing === 'new' ? 'POST' : 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...(editing === 'new' ? { service_id: serviceId } : {}) }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw Error(result.error || 'No pudimos guardar el servicio.'); }
      const saved: Service = await response.json();
      setServices(current => [...(current ?? []).filter(s => s.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name))); setEditing(null);

    } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos guardar el servicio.'); } finally { setBusy(false); }
  }
  async function remove(service: Service) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${base}/${service.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw Error();
      setServices(current => (current ?? []).filter(s => s.id !== service.id)); setDeleting(null);
    } catch { setError('No pudimos eliminar el servicio. Inténtalo nuevamente.'); } finally { setBusy(false); }
  }
  async function editCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!catalogEditing) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const response = await fetch(`${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/service-catalog/${catalogEditing.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), description: form.get('description') }) });
      if (!response.ok) throw Error();
      const saved: Service = await response.json();
      setConcepts(current => current.map(c => c.id === saved.id ? saved : c));
      setServices(current => current?.map(s => s.id === saved.id ? { ...s, name: saved.name, description: saved.description } : s) ?? null);
      setCatalogEditing(null);
    } catch { setError('No pudimos actualizar el servicio del centro.'); } finally { setBusy(false); }
  }
  async function deleteCatalog() {
    if (!catalogDeleting) return; setBusy(true); setError('');
    try {
      const response = await fetch(`${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/service-catalog/${catalogDeleting.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw Error();
      setConcepts(current => current.filter(c => c.id !== catalogDeleting.id));
      setServices(current => current?.filter(s => s.id !== catalogDeleting.id) ?? null);
      setCatalogDeleting(null);
    } catch { setError('No pudimos eliminar el servicio del centro.'); } finally { setBusy(false); }
  }
  const item = editing === 'new' ? null : editing;
  const concept = concepts.find(c => c.id === conceptId);
  return <><section className="staff-section staff-page-section" id="servicios"><div className="section-heading"><div><p className="eyebrow">TU CATÁLOGO</p><h1>Servicios ofrecidos</h1><p>Administra los servicios que ofreces en este centro.</p></div><div className="service-actions">{services && <span className="count">{services.length}</span>}{canEdit && <button className="service-add" aria-label="Agregar servicio" onClick={() => { setConceptId(''); setEditing('new'); }}>+</button>}</div></div>
    {error && !deleting && <p className="notice error" role="alert">{error}</p>}
    {editing && <form key={`${item?.id ?? 'new'}-${conceptId}`} className="form-card service-form" onSubmit={save}><h2>{item ? 'Editar servicio' : 'Agregar servicio'}</h2>{editing === 'new' ? <><label>Servicio del centro<select value={conceptId} required onChange={event => setConceptId(event.target.value)}><option value="">Selecciona un servicio</option>{concepts.filter(c => !services?.some(s => s.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}{administrator && <option value="new">Crear un servicio del centro</option>}</select></label>{conceptId === 'new' && <><label>Nombre<input name="name" required maxLength={120} /></label><label>Descripción<textarea name="description" maxLength={400} /></label></>}</> : <p>{item?.name}</p>}<label>Duración (minutos)<input name="duration" type="number" min="1" max="1440" required defaultValue={item?.duration_minutes ?? concept?.duration_minutes ?? 60} /></label><label>Precio (CLP)<input name="price" type="number" min="0" max="2147483647" required defaultValue={item?.price_clp ?? concept?.price_clp ?? 0} /></label><div className="service-actions"><button className="button button-primary btn" disabled={busy}>Guardar</button><button type="button" className="staff-signout" onClick={() => setEditing(null)}>Cancelar</button></div></form>}
    {!services ? !error && <div className="empty" role="status">Cargando servicios…</div> : services.length ? <div className="staff-list">{services.map(service => <article className="staff-row" key={service.id}><div className="staff-row-icon" aria-hidden="true">✳︎</div><div><h3>{service.name}</h3><p>{service.duration_minutes} minutos</p></div><strong>{formatPrice(service.price_clp)}</strong>{canEdit && <div className="service-actions"><button className="service-icon" aria-label={`Editar ${service.name}`} onClick={() => setEditing(service)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5H5v14h14v-8M12 15l1-4 6-6 3 3-6 6-4 1Z" /></svg></button><button className="service-icon service-delete" aria-label={`Eliminar ${service.name}`} disabled={busy} onClick={() => { setError(''); setDeleting(service); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7" /></svg></button></div>}</article>)}</div> : <div className="empty">Aún no tienes servicios disponibles.</div>}
    <Modal aria-labelledby="delete-service-title" show={!!deleting} onHide={() => { if (!busy) { setDeleting(null); setError(''); } }} centered className="confirm-delete-modal" backdropClassName="confirm-delete-backdrop"><Modal.Header closeButton={!busy}><Modal.Title id="delete-service-title">Eliminar servicio</Modal.Title></Modal.Header><Modal.Body><p>¿Eliminar {deleting?.name} de tus servicios? Esta acción no se puede deshacer.</p>{error && <p className="notice error" role="alert">{error}</p>}</Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => { setDeleting(null); setError(''); }} disabled={busy}>Cancelar</Button><Button variant="danger" onClick={() => { if (deleting) void remove(deleting); }} disabled={busy}>Confirmar eliminación</Button></Modal.Footer></Modal>
  </section>{administrator && <section className="staff-section"><div className="section-heading"><div><h2>Catálogo del centro</h2><p>Los cambios de nombre y descripción se aplican a todos los profesionales.</p></div></div>
    {catalogEditing && <form className="form-card service-form" onSubmit={editCatalog}><h2>Editar servicio del centro</h2><label>Nombre<input name="name" defaultValue={catalogEditing.name} required maxLength={120} /></label><label>Descripción<textarea name="description" defaultValue={catalogEditing.description ?? ''} maxLength={400} /></label><div className="service-actions"><button className="button button-primary btn" disabled={busy}>Guardar</button><button className="staff-signout" type="button" onClick={() => setCatalogEditing(null)}>Cancelar</button></div></form>}
    <div className="staff-list">{concepts.map(c => <article className="staff-row" key={c.id}><div><h3>{c.name}</h3><p>{c.description}</p></div><div className="service-actions"><button type="button" className="staff-signout" onClick={() => setCatalogEditing(c)}>Editar</button><button type="button" className="staff-signout service-delete" onClick={() => setCatalogDeleting(c)}>Eliminar</button></div></article>)}</div>
    <Modal aria-labelledby="delete-catalog-service-title" show={!!catalogDeleting} onHide={() => { if (!busy) setCatalogDeleting(null); }} centered className="confirm-delete-modal" backdropClassName="confirm-delete-backdrop"><Modal.Header closeButton={!busy}><Modal.Title id="delete-catalog-service-title">Eliminar servicio del centro</Modal.Title></Modal.Header><Modal.Body><p>¿Eliminar {catalogDeleting?.name}? Dejará de estar disponible para todos los profesionales. Las citas existentes se conservarán.</p>{error && <p className="notice error" role="alert">{error}</p>}</Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => setCatalogDeleting(null)} disabled={busy}>Cancelar</Button><Button variant="danger" onClick={() => void deleteCatalog()} disabled={busy}>Confirmar eliminación</Button></Modal.Footer></Modal>
  </section>}{services && canEdit && <BookingTermsEditor key={`${centerId}-${services.map(s => s.id).join(',')}`} centerId={centerId} token={token} centerName={centerName} professionalName={professionalName} services={services} administrator={administrator} />}</>;
}
