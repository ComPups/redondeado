import { useEffect, useRef, useState, type FormEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import { BookingCalendar, dateFormat, timeFormat, type Slot } from './BookingCalendar';
import { apiUrl } from '../shared/api';
import { formatPrice, type CenterProfile, type Professional, type Service } from './centerProfile';

const phoneCountryCode = '+56';

export type BookingChoice =
  | { kind: 'service'; service: Service }
  | { kind: 'professional'; professional: Professional };

type Availability =
  | { status: 'loading' | 'unavailable' }
  | { status: 'ready'; slots: Slot[] };

type ContactDraft = { name: string; email: string; phone: string };

function AppointmentForm({ slug, service, professional, contact, onContactChange, submitting, setSubmitting, onConfirm }: {
  slug: string;
  service: Service;
  professional: Professional;
  contact: ContactDraft;
  onContactChange: (field: keyof ContactDraft, value: string) => void;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onConfirm: (slot: string) => void;
}) {
  const [availability, setAvailability] = useState<Availability>({ status: 'loading' });
  const [slot, setSlot] = useState('');
  const [contactVisible, setContactVisible] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const loadSlots = async () => {
      try {
        const query = new URLSearchParams({ service: service.id, professional: professional.id });
        const response = await fetch(`${apiUrl}/public/centers/${encodeURIComponent(slug)}/availability?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Could not load availability');
        const slots: Slot[] = await response.json();
        if (!controller.signal.aborted) setAvailability({ status: 'ready', slots });
      } catch {
        if (!controller.signal.aborted) setAvailability({ status: 'unavailable' });
      }
    };

    void loadSlots();
    return () => controller.abort();
  }, [slug, service.id, professional.id, revision]);

  function refreshSlots() {
    setSlot('');
    setAvailability({ status: 'loading' });
    setRevision(value => value + 1);
  }

  async function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot || submitting) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/public/centers/${encodeURIComponent(slug)}/bookings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: service.id, professional: professional.id, start: slot,
          name: form.get('name'), email: form.get('email'), phone: `${phoneCountryCode}${form.get('phone')}` }),
      });
      if (response.status === 409) {
        setError('Este horario ya no está disponible. Elige otro horario actualizado.');
        refreshSlots();
      } else if (!response.ok) {
        throw new Error('Could not book');
      } else {
        onConfirm(slot);
      }
    } catch {
      setError('No pudimos reservar. Revisa tus datos e inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={event => void book(event)}>
      {availability.status === 'loading' && <p className="booking-feedback" role="status">Cargando horarios…</p>}
      {availability.status === 'unavailable' && (
        <div className="booking-feedback">
          <p role="alert">No pudimos cargar los horarios.</p>
          <button type="button" className="public-button public-button-outline" onClick={refreshSlots}>Reintentar</button>
        </div>
      )}
      {availability.status === 'ready' && (
        <BookingCalendar slots={availability.slots} selected={slot} onSelect={value => {
          setSlot(value);
          if (value) {
            setContactVisible(true);
            setError('');
          }
        }} disabled={submitting} />
      )}
      {error && <p className="error notice" role="alert">{error}</p>}
      <fieldset className="booking-contact" hidden={!contactVisible} disabled={!contactVisible || submitting}>
        <legend>Tus datos</legend>
        <label>Nombre completo
          <input name="name" autoComplete="name" required minLength={2} maxLength={120}
            value={contact.name} onChange={event => onContactChange('name', event.target.value)} />
        </label>
        <label>Correo electrónico
          <input name="email" autoComplete="email" type="email" required maxLength={254}
            value={contact.email} onChange={event => onContactChange('email', event.target.value)} />
        </label>
        <label className="booking-phone-label" htmlFor="booking-phone">Teléfono</label>
        <div className="input-group booking-phone">
          <span className="input-group-text" id="booking-phone-prefix">{phoneCountryCode}</span>
          <input className="form-control" id="booking-phone" name="phone" type="tel" inputMode="numeric"
            autoComplete="tel-national" required pattern="[0-9]{8,18}" maxLength={18}
            value={contact.phone} onChange={event => onContactChange('phone', event.target.value)}
            aria-describedby="booking-phone-prefix booking-phone-hint" />
        </div>
        <small className="booking-phone-hint" id="booking-phone-hint">Ingresa al menos 8 dígitos.</small>
        <button type="submit" className="public-button booking-submit" disabled={!slot || submitting}>
          {submitting ? 'Confirmando…' : 'Confirmar reserva'}
        </button>
      </fieldset>
    </form>
  );
}

export function BookingModal({ center, slug, choice, onClose }: {
  center: CenterProfile;
  slug: string;
  choice: BookingChoice;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState('');
  const [contact, setContact] = useState<ContactDraft>({ name: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmedSlot, setConfirmedSlot] = useState('');
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const service = choice.kind === 'service' ? choice.service : center.services.find(service => service.id === selection);
  const professional = choice.kind === 'professional' ? choice.professional : center.professionals.find(person => person.id === selection);
  const title = choice.kind === 'service' ? choice.service.name : choice.professional.name;

  useEffect(() => {
    if (confirmedSlot) confirmationHeading.current?.focus();
  }, [confirmedSlot]);

  function changeContact(field: keyof ContactDraft, value: string) {
    setContact(draft => ({ ...draft, [field]: value }));
  }

  return (
    <Modal show centered scrollable animation={false} lang="es-CL" contentClassName="booking-modal"
      aria-labelledby="booking-title" keyboard={!submitting} backdrop={submitting ? 'static' : true}
      onHide={() => { if (!submitting) onClose(); }}>
      <Modal.Header closeButton={!submitting} closeLabel="Cerrar">
        <Modal.Title as="h2" id="booking-title" ref={confirmationHeading} tabIndex={confirmedSlot ? -1 : undefined}>
          {confirmedSlot ? '¡Reserva confirmada!' : title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {confirmedSlot ? (
          <>
            <p role="status">Tu hora quedó registrada para {dateFormat.format(new Date(confirmedSlot))} a las {timeFormat.format(new Date(confirmedSlot))}.</p>
            <p>{service?.name} · {professional?.name}</p>
            <button type="button" className="public-button" onClick={onClose}>Listo</button>
          </>
        ) : (
          <>
            {service && <p className="center-service-meta"><strong>{formatPrice(service.price_clp)}</strong><span>{service.duration_minutes} min</span></p>}
            {choice.kind === 'service' ? (
              <label>Profesional
                <select value={selection} onChange={event => setSelection(event.target.value)} disabled={submitting}>
                  <option value="">Selecciona un profesional</option>
                  {center.professionals.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
            ) : (
              <label>Servicio
                <select value={selection} onChange={event => setSelection(event.target.value)} disabled={submitting}>
                  <option value="">Selecciona un servicio</option>
                  {center.services.map(item => <option key={item.id} value={item.id}>{item.name} · {item.duration_minutes} min · {formatPrice(item.price_clp)}</option>)}
                </select>
              </label>
            )}
            {service && professional && (
              <AppointmentForm key={selection} slug={slug} service={service} professional={professional}
                contact={contact} onContactChange={changeContact}
                submitting={submitting} setSubmitting={setSubmitting} onConfirm={setConfirmedSlot} />
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
