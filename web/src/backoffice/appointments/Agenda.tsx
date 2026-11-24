import { useState, type FormEvent } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { NewAppointment } from './NewAppointment';

export type Appointment = { id: string; professional_user_id: string; service_name: string; patient_name: string; patient_email: string; patient_phone: string; starts_at: string; ends_at: string; professional_name?: string | null };
const santiagoParts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]));
const localInput = (value: string) => { const p = santiagoParts(new Date(value)); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
const format = (value: string) => new Date(value).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Santiago' });
// Convert a Santiago wall time to an instant, checking daylight-saving transitions.
function santiagoInstant(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const target = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const p = santiagoParts(new Date(instant));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    instant += target - represented;
  }
  const result = new Date(instant);
  return localInput(result.toISOString()) === value ? result : null;
}

export function Agenda({ appointments, role, token, centerId, apiUrl, refresh, loading, error, scope = 'personal' }: { appointments: Appointment[]; role: string; token: string; centerId: string; apiUrl: string; refresh: () => void; loading: boolean; error: string; scope?: 'personal' | 'center' }) {
  const [creating, setCreating] = useState(false);
  const [past, setPast] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const now = Date.now();
  const visible = appointments.filter(a => past ? new Date(a.starts_at).getTime() < now : new Date(a.starts_at).getTime() >= now).sort((a, b) => past ? Date.parse(b.starts_at) - Date.parse(a.starts_at) : Date.parse(a.starts_at) - Date.parse(b.starts_at));
  function close() { setSelected(null); setEditing(false); setMessage(''); setConfirmDelete(false); }
  async function request(method: string, body?: unknown) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/appointments/${selected!.id}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'No se pudo guardar la cita.'); }
      close(); refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudo guardar la cita.'); }
    finally { setBusy(false); }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const start = santiagoInstant(String(form.get('starts_at')));
    if (!start) { setMessage('Ingresa una fecha válida.'); return; }
    const duration = Date.parse(selected!.ends_at) - Date.parse(selected!.starts_at);
    void request('PATCH', { patient_name: form.get('patient_name'), patient_email: form.get('patient_email'), patient_phone: form.get('patient_phone'), starts_at: start.toISOString(), ends_at: new Date(start.getTime() + duration).toISOString() });
  }
  return <section className="staff-section" id="agendamientos"><div className="section-heading"><div><p className="eyebrow">{scope === 'center' ? 'AGENDA DEL CENTRO' : 'TU AGENDA'}</p><h2>{scope === 'center' ? 'Agendamientos del centro' : 'Agendamientos'}</h2><p>{scope === 'center' ? 'Revisa los agendamientos de tu centro.' : 'Revisa los agendamientos asignados a ti.'}</p></div><div className="agenda-actions"><span className="count">{visible.length}</span>{role !== 'limited' && <Button className="button-primary" onClick={() => setCreating(true)}>+ Agendar cita</Button>}</div></div>
    <div className="agenda-filters" aria-label="Filtrar citas"><button type="button" aria-pressed={!past} onClick={() => setPast(false)}>Próximas</button><button type="button" aria-pressed={past} onClick={() => setPast(true)}>Pasadas</button></div>
    {loading ? <p role="status">Cargando agendamientos…</p> : error ? <p role="alert">{error} <button onClick={refresh}>Reintentar</button></p> : visible.length ? <ul className="agenda-list">{visible.map(a => <li key={a.id}><button type="button" onClick={() => { setSelected(a); setMessage(''); }}><strong>{format(a.starts_at)}</strong> · {a.service_name} · {a.patient_name}{a.professional_name && <> · {a.professional_name}</>}</button></li>)}</ul> : <p>{past ? 'No hay citas pasadas.' : 'No hay citas próximas.'}</p>}
    <NewAppointment scope={scope} show={creating} onClose={() => setCreating(false)} onCreated={refresh} centerId={centerId} token={token} apiUrl={apiUrl} />
    <Modal show={!!selected} onHide={close} enforceFocus={!confirmDelete} centered><Modal.Header closeButton><Modal.Title>Detalle de la cita</Modal.Title></Modal.Header>{selected && <><Modal.Body>
      {message && <p role="alert">{message}</p>}
      {editing ? <form id="appointment-form" onSubmit={save} className="appointment-form">
        <label>Nombre <input name="patient_name" required defaultValue={selected.patient_name} /></label>
        <label>Correo <input name="patient_email" type="email" required defaultValue={selected.patient_email} /></label>
        <label>Teléfono <input name="patient_phone" required defaultValue={selected.patient_phone} /></label>
        <label>Fecha y hora (Santiago) <input name="starts_at" type="datetime-local" required defaultValue={localInput(selected.starts_at)} /></label>
        <p>La duración de la cita se mantiene al cambiar la hora.</p>
      </form> : <dl><dt>Paciente</dt><dd>{selected.patient_name}</dd><dt>Correo</dt><dd><a href={`mailto:${selected.patient_email}`}>{selected.patient_email}</a></dd><dt>Teléfono</dt><dd><a href={`tel:${selected.patient_phone}`}>{selected.patient_phone}</a></dd><dt>Fecha y hora</dt><dd>{format(selected.starts_at)} – {new Date(selected.ends_at).toLocaleTimeString('es-CL', { timeStyle: 'short', timeZone: 'America/Santiago' })}</dd><dt>Servicio</dt><dd>{selected.service_name}</dd>{selected.professional_name && <><dt>Profesional</dt><dd>{selected.professional_name}</dd></>}</dl>}
    </Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={close} disabled={busy}>Cerrar</Button>{role !== 'limited' && (editing ? <><Button variant="outline-secondary" onClick={() => setEditing(false)} disabled={busy}>Cancelar</Button><Button className="button-primary" type="submit" form="appointment-form" disabled={busy}>Guardar</Button></> : <><Button className="button-primary" onClick={() => setEditing(true)}>Reagendar</Button><Button variant="danger" onClick={() => { setMessage(''); setConfirmDelete(true); }}>Eliminar</Button></>)}</Modal.Footer></>}</Modal>
    <Modal show={confirmDelete} onHide={() => !busy && setConfirmDelete(false)} centered className="confirm-delete-modal" backdropClassName="confirm-delete-backdrop"><Modal.Header closeButton={!busy}><Modal.Title>Eliminar cita</Modal.Title></Modal.Header><Modal.Body><p>¿Eliminar esta cita? Esta acción no se puede deshacer.</p>{message && <p className="notice error" role="alert">{message}</p>}</Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancelar</Button><Button variant="danger" onClick={() => void request('DELETE')} disabled={busy}>Confirmar eliminación</Button></Modal.Footer></Modal>
  </section>;
}
