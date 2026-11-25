import { LoadingSkeleton } from '../shared/components/LoadingSkeleton';
import { apiFetch } from '../shared/requestCache';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import { BookingCalendar, dateFormat, timeFormat, type Slot } from './BookingCalendar';
import { apiUrl } from '../shared/api';
import { formatPrice, type CenterProfile, type Professional, type Service } from './centerProfile';

const phoneCountryCode = '+56';

export type BookingChoice =
  | { kind: 'service'; service: Service; versions: Service[] }
  | { kind: 'professional'; professional: Professional };

type Availability =
  | { status: 'loading' | 'unavailable' }
  | { status: 'ready'; slots: Slot[] };

type Terms = { id: string; kind: 'center' | 'professional'; body: string };

type ContactDraft = { name: string; email: string; phone: string };

function AppointmentForm({ slug, service, professional, contact, onContactChange, submitting, setSubmitting, onConfirm, onRefreshPrice }: {
  slug: string;
  service: Service;
  professional: Professional;
  contact: ContactDraft;
  onContactChange: (field: keyof ContactDraft, value: string) => void;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onConfirm: (slot: string) => void;
  onRefreshPrice: () => Promise<boolean>;
}) {
  const [availability, setAvailability] = useState<Availability>({ status: 'loading' });
  const [slot, setSlot] = useState('');
  const [contactVisible, setContactVisible] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [priceChanged, setPriceChanged] = useState(false);
  const [terms, setTerms] = useState<Terms[] | null>(null);
  const [termsError, setTermsError] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [termsRevision, setTermsRevision] = useState(0);
  const termsDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setTerms(null); setTermsError(false); setAccepted(false);
    const query = new URLSearchParams({ service: service.id, professional: professional.id });
    apiFetch(`${apiUrl}/public/centers/${encodeURIComponent(slug)}/terms?${query}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Could not load terms'); return response.json(); })
      .then((data: Terms[]) => { if (!controller.signal.aborted) setTerms(data); })
      .catch(() => { if (!controller.signal.aborted) setTermsError(true); });
    return () => controller.abort();
  }, [slug, service.id, professional.id, termsRevision]);

  useEffect(() => {
    const controller = new AbortController();

    const loadSlots = async () => {
      try {
        const query = new URLSearchParams({ service: service.id, professional: professional.id });
        const response = await apiFetch(`${apiUrl}/public/centers/${encodeURIComponent(slug)}/availability?${query}`, { signal: controller.signal });
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
    if (!slot || submitting || priceChanged || !terms || (terms.length > 0 && !accepted)) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError('');
    try {
      const response = await apiFetch(`${apiUrl}/public/centers/${encodeURIComponent(slug)}/bookings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: service.id, professional: professional.id, start: slot,
          name: form.get('name'), email: form.get('email'), phone: `${phoneCountryCode}${form.get('phone')}`, expected_price_clp: service.price_clp, terms: terms.map(term => term.id) }),
      });
      const result = await response.json();
      if (response.status === 409 && result.code === 'PRICE_CHANGED') {
        setPriceChanged(true);
        setError('El precio cambió. Actualízalo y revisa el nuevo valor antes de reservar.');
      } else if (response.status === 409 && result.code === 'TERMS_CHANGED') {
        setError('Los términos cambiaron. Léelos y acéptalos nuevamente.');
        setTermsRevision(value => value + 1);
      } else if (response.status === 409) {
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
      {availability.status === 'loading' && <LoadingSkeleton label="Cargando horarios…" variant="calendar" />}
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
      {priceChanged && <button type="button" className="public-button public-button-outline" disabled={submitting} onClick={() => {
        setSubmitting(true);
        void onRefreshPrice().then(ok => {
          if (ok) { setPriceChanged(false); refreshSlots(); setError('Precio actualizado. Revísalo y elige un horario nuevamente.'); }
          else setError('No pudimos actualizar el precio. Inténtalo de nuevo o cierra la reserva.');
        }).finally(() => setSubmitting(false));
      }}>Actualizar precio</button>}
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
        {termsError && <p role="alert">No pudimos cargar los términos. <button type="button" className="booking-terms-link" onClick={() => setTermsRevision(value => value + 1)}>Reintentar</button></p>}
        {terms && terms.length > 0 && <section className="booking-terms" aria-labelledby="terms-heading">
          <h3 id="terms-heading">Términos y condiciones</h3>
          <p className="booking-terms-intro">Lee los términos aplicables antes de confirmar tu reserva.</p>
          <button className="booking-terms-link" type="button" onClick={() => termsDialog.current?.showModal()}>Ver términos y condiciones</button>
          <dialog className="booking-terms-dialog" ref={termsDialog} aria-labelledby="terms-dialog-title">
            <div className="booking-terms-dialog-header"><div><p className="booking-terms-dialog-kicker">TU RESERVA</p><h2 id="terms-dialog-title">Términos y condiciones</h2></div><button className="booking-terms-close" type="button" aria-label="Cerrar términos y condiciones" onClick={() => termsDialog.current?.close()}>×</button></div>
            <div className="booking-terms-text">{terms.map(term => <article key={term.id}><h3>{term.kind === 'center' ? 'Términos del centro' : 'Términos del profesional y servicio'}</h3><p>{term.body}</p></article>)}</div>
            <div className="booking-terms-dialog-actions"><button className="booking-terms-done" type="button" onClick={() => termsDialog.current?.close()}>Cerrar</button></div>
          </dialog>
          <label className="booking-terms-accept"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Acepto los términos y condiciones de la reserva</span></label>
          <p className="booking-terms-note">La aceptación de estos términos es independiente de la información de privacidad y del consentimiento clínico.</p>
        </section>}
        <button type="submit" className="public-button booking-submit" disabled={!slot || submitting || priceChanged || !terms || (terms.length > 0 && !accepted)}>
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
  const [offerings, setOfferings] = useState(center.services);
  const [contact, setContact] = useState<ContactDraft>({ name: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmedSlot, setConfirmedSlot] = useState('');
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const professional = choice.kind === 'professional' ? choice.professional : center.professionals.find(person => person.id === selection);
  const service = offerings.find(item => item.id === (choice.kind === 'service' ? choice.service.id : selection) && (item.professional_id ? item.professional_id === professional?.id : professional?.service_ids?.includes(item.id)));
  async function refreshPrice() {
    try {
      const response = await apiFetch(`${apiUrl}/public/centers/${encodeURIComponent(slug)}`, { cache: 'no-store' });
      if (!response.ok) return false;
      const profile: CenterProfile = await response.json();
      if (!profile.services.some(item => item.id === service?.id && (item.professional_id ? item.professional_id === professional?.id : professional?.service_ids?.includes(item.id)))) return false;
      setOfferings(profile.services); return true;
    } catch { return false; }
  }
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
                  {center.professionals.filter(person => choice.versions.some(version => (version.professional_id ? version.professional_id === person.id : person.service_ids?.includes(version.id)))).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
            ) : (
              <label>Servicio
                <select value={selection} onChange={event => setSelection(event.target.value)} disabled={submitting}>
                  <option value="">Selecciona un servicio</option>
                  {offerings.filter(item => (item.professional_id ? item.professional_id === choice.professional.id : choice.professional.service_ids?.includes(item.id))).map(item => <option key={item.id} value={item.id}>{item.name} · {item.duration_minutes} min · {formatPrice(item.price_clp)}</option>)}
                </select>
              </label>
            )}
            {service && professional && (
              <AppointmentForm key={selection} slug={slug} service={service} professional={professional}
                contact={contact} onContactChange={changeContact}
                submitting={submitting} setSubmitting={setSubmitting} onConfirm={setConfirmedSlot} onRefreshPrice={refreshPrice} />
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
