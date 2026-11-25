import { useEffect, useState, type FormEvent } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { BookingCalendar, type Slot } from '../../shared/components/BookingCalendar';
import { fetchAvailability } from '../../shared/api';

type Options = { professionals: { id: string; name: string }[]; services: { id: string; name: string; duration_minutes: number; professional_id: string }[] };
export function NewAppointment({ show, onClose, onCreated, centerId, token, apiUrl, scope }: { show: boolean; onClose: () => void; onCreated: () => void; centerId: string; token: string; apiUrl: string; scope: 'personal' | 'center' }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [service, setService] = useState('');
  const [professional, setProfessional] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!show) return;
    const controller = new AbortController();
    setOptions(null); setService(''); setProfessional(''); setSlots([]); setSlot(''); setError('');
    fetch(`${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/booking-options?scope=${scope}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data: Options) => { setOptions(data); if (data.professionals.length === 1) setProfessional(data.professionals[0].id); })
      .catch(() => { if (!controller.signal.aborted) setError('No se pudieron cargar los servicios y profesionales. Cierra e intenta nuevamente.'); });
    return () => controller.abort();
  }, [show, centerId, token, apiUrl, scope]);
  useEffect(() => {
    setSlots([]); setSlot('');
    if (!show || !service || !professional) return;
    const controller = new AbortController(); setLoading(true); setError('');
    fetchAvailability(centerId, service, professional, token, controller.signal)
      .then(data => { setSlots(data); setLoading(false); })
      .catch(() => { if (!controller.signal.aborted) { setLoading(false); setError('No se pudieron cargar los horarios disponibles.'); } });
    return () => controller.abort();
  }, [show, service, professional, centerId, token]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const response = await fetch(`${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/appointments`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: service, professional_id: professional, scope, starts_at: slot, patient_name: form.get('name'), patient_email: form.get('email'), patient_phone: form.get('phone') }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'No se pudo crear la cita.'); }
      onClose(); onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear la cita.'); }
    finally { setBusy(false); }
  }
  return <Modal show={show} onHide={busy ? undefined : onClose} centered><Modal.Header closeButton={!busy}><Modal.Title>Agendar una cita</Modal.Title></Modal.Header><Modal.Body>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!options ? !error && <p role="status">Cargando opciones…</p> : <Form id="new-appointment-form" className="appointment-form" onSubmit={submit}>
      {scope === 'center' && <Form.Group><Form.Label htmlFor="new-professional">Profesional</Form.Label><Form.Select id="new-professional" required value={professional} onChange={e => { setProfessional(e.target.value); setService(''); }}><option value="">Selecciona un profesional</option>{options.professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Form.Select></Form.Group>}
      <Form.Group><Form.Label htmlFor="new-service">Servicio</Form.Label><Form.Select id="new-service" required disabled={!professional} value={service} onChange={e => setService(e.target.value)}><option value="">Selecciona un servicio</option>{options.services.filter(s => s.professional_id === professional).map(s => <option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} min</option>)}</Form.Select></Form.Group>
      {scope === 'personal' && options.professionals.length === 0 && <p role="alert">No tienes un perfil profesional disponible para agendar en este centro.</p>}
      {service && professional && <BookingCalendar key={`${service}-${professional}`} slots={slots} selected={slot} onSelect={setSlot} busy={loading || busy} />}
      <Form.Group><Form.Label htmlFor="new-name">Nombre del paciente</Form.Label><Form.Control id="new-name" name="name" required minLength={2} maxLength={120} /></Form.Group>
      <Form.Group><Form.Label htmlFor="new-email">Correo</Form.Label><Form.Control id="new-email" name="email" type="email" required maxLength={254} /></Form.Group>
      <Form.Group><Form.Label htmlFor="new-phone">Teléfono</Form.Label><Form.Control id="new-phone" name="phone" type="tel" required placeholder="+56912345678" /></Form.Group>
    </Form>}
  </Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button className="button-primary" type="submit" form="new-appointment-form" disabled={!options || !slot || busy}>{busy ? 'Agendando…' : 'Agendar cita'}</Button></Modal.Footer></Modal>;
}
