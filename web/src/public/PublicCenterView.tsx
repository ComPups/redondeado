import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { BookingCalendar, type Slot } from '../shared/components/BookingCalendar';
import { PublicHeader } from './PublicComponents';
import { publicClient as db, useCenterProfile } from './centerProfile';

export function PublicNotFound() { return <div className="public-site" lang="es-CL"><PublicHeader /><main className="public-container public-message"><h1>Página no disponible</h1><p>Revisa el enlace o vuelve al inicio de Redondeado.</p><Link className="public-button public-button-outline" to="/">Volver al inicio</Link></main></div>; }

const dateFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full' });
const timeFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });

export function PublicCenterView() {
  const { slug = '' } = useParams();
  const profile = useCenterProfile(slug);
  const [service, setService] = useState('');
  const [professional, setProfessional] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    setSlots([]); setSlot(''); setBusy(false);
    if (!db || !service || !professional) return;
    setBusy(true);
    const client = db;
    async function loadSlots() {
      const all: Slot[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: err } = await client!.rpc('public_availability', { p_slug: slug, p_service: service, p_professional: professional }).range(from, from + 999);
        if (!active) return;
        if (err) { setError('No pudimos cargar los horarios.'); setBusy(false); return; }
        const page = (data ?? []) as Slot[];
        all.push(...page);
        if (page.length < 1000) break;
      }
      if (active) { setSlots(all); setBusy(false); }
    }
    void loadSlots();
    return () => { active = false; };
  }, [slug, service, professional, revision]);
  async function book(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!db || !slot) return;
    const form = new FormData(e.currentTarget); setBusy(true); setError('');
    const { error: err } = await db.rpc('book_public_appointment', { p_slug: slug, p_service: service, p_professional: professional, p_start: slot, p_name: form.get('name'), p_email: form.get('email'), p_phone: form.get('phone') });
    setBusy(false);
    if (err) { setError(err.code === '23P01' || err.code === 'P0001' ? 'Este horario ya no está disponible. Elige otro horario actualizado.' : 'No pudimos reservar. Revisa tus datos e inténtalo de nuevo.'); setRevision(v => v + 1); return; }
    setConfirmed(true);
  }
  const disabledReason = busy ? 'Espera mientras procesamos tu solicitud.' : !service ? 'Selecciona un servicio para continuar.' : !professional ? 'Selecciona un profesional para continuar.' : !slot ? 'Selecciona una fecha y hora para continuar.' : '';
  if (profile.status === 'loading') return <main className="public-page">Cargando centro…</main>;
  if (profile.status !== 'ready') return <main className="public-page"><h1>Centro no disponible</h1><p>{profile.status === 'missing' ? 'No encontramos este centro.' : 'No pudimos cargar el centro.'}</p></main>;
  const center = profile.profile;
  return <div className="public-site" lang="es-CL"><PublicHeader /><main className="public-page">
    <section className="public-intro"><p className="eyebrow">RESERVA TU ATENCIÓN</p><h1>{center.name}</h1><p>{center.description}</p></section>
    <div className="booking-grid"><section className="form-card"><h2>Servicios</h2>{center.services.length ? center.services.map(s => <div className="catalog-item" key={s.id}><strong>{s.name}</strong><span>{s.duration_minutes} min · {s.price_clp.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</span></div>) : <p>No hay servicios disponibles.</p>}
      <h2>Profesionales</h2>{center.professionals.length ? center.professionals.map(p => <div className="catalog-item" key={p.id}>{p.name}</div>) : <p>No hay profesionales disponibles.</p>}</section>
      <section className="form-card"><h2>Reserva una hora</h2>{confirmed ? <div className="success notice" role="status"><strong>¡Reserva confirmada!</strong><p>Tu hora quedó registrada para {dateFormat.format(new Date(slot))} a las {timeFormat.format(new Date(slot))}.</p></div> : <form onSubmit={e => void book(e)}>
        <p>Puedes elegir primero un servicio o un profesional.</p>
        <label htmlFor="service">Servicio</label><select id="service" required value={service} onChange={e => setService(e.target.value)}><option value="">Selecciona un servicio</option>{center.services.filter(s => !professional || center.professionals.find(p => p.id === professional)?.service_ids.includes(s.id)).map(s => <option value={s.id} key={s.id}>{s.name} · {s.duration_minutes} min</option>)}</select>
        <label htmlFor="professional">Profesional</label><select id="professional" required value={professional} onChange={e => setProfessional(e.target.value)}><option value="">Selecciona un profesional</option>{center.professionals.filter(p => !service || p.service_ids.includes(service)).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select>
        {service && professional && <BookingCalendar slots={slots} selected={slot} onSelect={setSlot} busy={busy} />}
        <label htmlFor="name">Nombre completo</label><input id="name" name="name" required minLength={2} maxLength={120} />
        <label htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" required maxLength={254} />
        <label htmlFor="phone">Teléfono</label><input id="phone" name="phone" type="tel" required pattern="\+?[0-9 ()-]{7,20}" />
        {error && <p className="error notice" role="alert">{error}</p>}<span className="booking-submit-wrap" tabIndex={disabledReason ? 0 : undefined} aria-describedby={disabledReason ? "booking-disabled-reason" : undefined}><button className="button booking-submit" disabled={Boolean(disabledReason)}>Confirmar reserva</button>{disabledReason && <span className="booking-disabled-reason" id="booking-disabled-reason" role="tooltip">{disabledReason}</span>}</span>
      </form>}</section></div></main></div>;
}
