import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { LoginView } from './backoffice/views/LoginView';
import { CentersView } from './backoffice/views/CentersView';
import { BackofficeLayout } from './backoffice/components/BackofficeLayout';
import { formatPrice, useCenterProfile } from './public/centerProfile';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;
type Center = { center_id: string; role: 'platform_administrator' | 'administrator' | 'member' | 'limited'; centers: { id: string; name: string; slug: string } };
type Appointment = { id: string; service_name: string; patient_name: string; starts_at: string };
async function staffFetch(path: string, token: string) {
  const response = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}
function PlatformAdmin({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [entity, setEntity] = useState('centers');
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [editing, setEditing] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const path = entity === 'memberships' ? '/staff/platform-memberships' : `/staff/platform/${entity}`;
  useEffect(() => {
    let active = true;
    staffFetch(path, token).then(rows => { if (active) setRecords(rows); }).catch(() => { if (active) setMessage('Could not load records.'); });
    return () => { active = false; };
  }, [path, token, revision]);
  async function save(record: Record<string, unknown>, form: HTMLFormElement) {
    try {
      const changes = JSON.parse(new FormData(form).get('changes') as string);
      const id = entity === 'staff_profiles' ? record.professional_id : record.id;
      const target = entity === 'memberships' ? `${path}/${record.center_id}/${record.user_id}` : `${path}/${id}`;
      const response = await fetch(`${apiUrl}${target}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      if (!response.ok) throw new Error('Update failed');
      setMessage('Record updated.'); setEditing(''); setRevision(v => v + 1); if (entity === 'centers') onCreated();
    } catch { setMessage('Could not save. Check the editable fields and values.'); }
  }
  const fields: Record<string, string[]> = { centers: ['name', 'slug', 'description', 'opens_at', 'closes_at'], services: ['name', 'price_clp', 'duration_minutes', 'active'], appointments: ['professional_user_id', 'service_id', 'service_name', 'patient_name', 'patient_email', 'patient_phone', 'starts_at', 'ends_at'], staff_profiles: ['display_name'], memberships: ['role'] };
  return <section><h2>Platform administration</h2>
    <h3>Edit records</h3><label>Entity <select value={entity} onChange={e => { setEntity(e.target.value); setEditing(''); setRecords([]); }}>{Object.keys(fields).map(k => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}</select></label>
    {message && <p role="status">{message}</p>}
    <ul>{records.map(record => { const id = String(record.id ?? record.professional_id ?? `${record.center_id}/${record.user_id}`); return <li key={id}>
      <pre>{JSON.stringify(record, null, 2)}</pre><button onClick={() => setEditing(id)}>Edit</button>
      {editing === id && <form onSubmit={e => { e.preventDefault(); void save(record, e.currentTarget); }}><label>Editable fields (JSON)<br /><textarea name="changes" rows={8} cols={50} defaultValue={JSON.stringify(Object.fromEntries(fields[entity].map(k => [k, record[k]])), null, 2)} /></label><br /><button>Save</button><button type="button" onClick={() => setEditing('')}>Cancel</button></form>}
    </li>; })}</ul>
  </section>;
}
export function Staff() {
  const location = useLocation();
  const centerPage = location.pathname === '/staff/centro';
  const servicesPage = location.pathname === '/staff/servicios';
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [centersError, setCentersError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [agendaError, setAgendaError] = useState('');
  const [centers, setCenters] = useState<Center[]>([]);
  const [selected, setSelected] = useState('');
  const [role, setRole] = useState<Center['role'] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [agendaFilter, setAgendaFilter] = useState<'upcoming' | 'past'>('upcoming');
  const [centersRevision, setCentersRevision] = useState(0);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const selectedCenter = centers.find(c => c.center_id === selected);
  const profileResult = useCenterProfile(selectedCenter?.centers.slug ?? '');
  const profile = profileResult.status === 'ready' ? profileResult.profile : null;
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (loading) return;
    if (!session && location.pathname !== '/staff/login') window.location.replace('/staff/login');
    if (session && location.pathname === '/staff/login') window.location.replace('/staff');
  }, [session, loading]);
  useEffect(() => {
    setCenters([]); setSelected(''); setRole(null); setAppointments([]); setPlatformAdmin(false); setDisplayName(null); setCentersError(''); setProfileError(''); setAgendaError('');
    if (!session) return;
    let active = true;
    staffFetch('/staff/centers', session.access_token).then((data: Center[]) => {
      if (active) { setCenters(data); setSelected(data[0]?.center_id ?? ''); }
    }).catch(() => { if (active) setCentersError('No pudimos cargar tus centros.'); });
    staffFetch('/staff/me', session.access_token).then(data => { if (active) { setPlatformAdmin(data.platformAdmin); setDisplayName(data.displayName); } }).catch(() => { if (active) setProfileError('No pudimos cargar tu perfil.'); });
    return () => { active = false; };
  }, [session, centersRevision]);
  useEffect(() => {
    setRole(null); setAppointments([]); setAgendaLoading(false); setAgendaError('');
    if (!session || !selected) return;
    setAgendaLoading(true);
    let active = true;
    const base = `/staff/centers/${encodeURIComponent(selected)}`;
    Promise.all([staffFetch(base, session.access_token), staffFetch(`${base}/appointments`, session.access_token)])
      .then(([membership, rows]) => { if (active) { setRole(membership.role); setAppointments(rows); setAgendaLoading(false); } })
      .catch(() => { if (active) { setAgendaError('No pudimos cargar los agendamientos.'); setAgendaLoading(false); } });
    return () => { active = false; };
  }, [session, selected]);
  async function signIn(email: string, password: string) {
    const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password });
    return signInError ? 'No pudimos iniciar sesión. Revisa tu correo y contraseña.' : null;
  }
  if (!supabase) return <main><h1>Backoffice</h1><p>Supabase is not configured.</p></main>;
  if (loading) return <main>Checking session…</main>;
  if (!session) return <LoginView onSignIn={signIn} />;
  const now = Date.now();
  const visibleAppointments = appointments.filter(a => agendaFilter === 'upcoming' ? new Date(a.starts_at).getTime() >= now : new Date(a.starts_at).getTime() < now);
  if (agendaFilter === 'past') visibleAppointments.reverse();
  const roleLabel = { administrator: 'Administrador', member: 'Miembro', limited: 'Acceso limitado', platform_administrator: 'Administrador de plataforma' };
  return <BackofficeLayout page={centerPage ? 'center' : servicesPage ? 'services' : 'agenda'} onSignOut={() => void supabase.auth.signOut()}>
    {centersError && <p className="notice error" role="alert">{centersError}</p>}
    {profileError && <p className="notice error" role="alert">{profileError}</p>}
    {centers.length === 0 ? <div className="empty">No tienes centros disponibles.</div> : <>
      <div className="staff-context"><span>MI CENTRO</span><label>Centro <select value={selected} onChange={e => setSelected(e.target.value)}>{centers.map(c => <option key={c.center_id} value={c.center_id}>{c.centers.name}</option>)}</select></label></div>
      {centerPage ? <section className="staff-hero" aria-labelledby="center-name">
        <div><p className="staff-kicker">MI CENTRO</p><h1 id="center-name">{selectedCenter?.centers.name}</h1>
          <p>{profile?.description || (profileResult.status === 'loading' ? 'Cargando información del centro…' : 'Consulta la actividad y los servicios de tu centro.')}</p>
          {selectedCenter?.centers.slug && <a className="staff-public-link" href={`/${selectedCenter.centers.slug}`}>Ver página pública <span aria-hidden="true">↗</span></a>}</div>
        <div className="staff-hero-meta"><div><span>TU ROL</span><strong>{role ? roleLabel[role] : 'Cargando…'}</strong></div><div><span>HORARIO DE ATENCIÓN</span><strong>{profile?.opens_at && profile.closes_at ? `${profile.opens_at.slice(0, 5)} – ${profile.closes_at.slice(0, 5)}` : 'No disponible'}</strong></div></div>
      </section> : servicesPage ? <>
      <section className="staff-section staff-page-section" id="servicios"><div className="section-heading"><div><p className="eyebrow">CATÁLOGO DEL CENTRO</p><h1>Servicios ofrecidos</h1><p>Todos los profesionales ofrecen estos servicios.</p></div>{profile && <span className="count">{profile.services.length}</span>}</div>
        {profileResult.status === 'loading' ? <div className="empty" role="status">Cargando servicios…</div> : !profile ? <div className="empty" role="alert">No pudimos cargar los servicios.</div> : profile.services.length ? <div className="staff-list">{profile.services.map(service => <article className="staff-row" key={service.id}><div className="staff-row-icon" aria-hidden="true">✳︎</div><div><h3>{service.name}</h3><p>{service.duration_minutes} minutos</p></div><strong>{formatPrice(service.price_clp)}</strong></article>)}</div> : <div className="empty">Este centro aún no tiene servicios disponibles.</div>}
      </section></> : <>
      <div className="staff-welcome"><p className="eyebrow">TU ESPACIO DE TRABAJO</p><h1>{displayName ? `¡Hola, ${displayName.split(/\s+/)[0]}!` : '¡Hola!'}</h1><p>Revisa la agenda y los servicios de {selectedCenter?.centers.name}.</p></div>
      <section className="staff-section" id="agendamientos"><div className="section-heading"><div><p className="eyebrow">TU AGENDA</p><h2>Agendamientos</h2><p>{role === 'administrator' || role === 'platform_administrator' ? 'Revisa los agendamientos de tu centro.' : 'Revisa los agendamientos asignados a ti.'}</p></div><span className="count">{visibleAppointments.length}</span></div>
        <div className="agenda-filters" role="group" aria-label="Filtrar agendamientos"><button type="button" aria-pressed={agendaFilter === 'upcoming'} onClick={() => setAgendaFilter('upcoming')}>Próximos</button><button type="button" aria-pressed={agendaFilter === 'past'} onClick={() => setAgendaFilter('past')}>Anteriores</button></div>
        {agendaLoading ? <div className="empty" role="status">Cargando agendamientos…</div> : agendaError ? <div className="notice error" role="alert">{agendaError}</div> : visibleAppointments.length ? <div className="staff-list">{visibleAppointments.map(a => <article className="staff-row" key={a.id}><div className="staff-row-icon" aria-hidden="true">▦</div><div><h3>{a.patient_name}</h3><p>{a.service_name}</p></div><time dateTime={a.starts_at}>{new Date(a.starts_at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' })}</time></article>)}</div> : <div className="empty">{agendaFilter === 'upcoming' ? 'No tienes próximos agendamientos.' : 'No hay agendamientos anteriores.'}</div>}
      </section>
      </>}
    </>}
    {platformAdmin && !centerPage && !servicesPage && <details className="staff-admin"><summary>Administración de plataforma</summary><CentersView token={session.access_token} onCreated={() => setCentersRevision(v => v + 1)} onSelect={id => { setSelected(id); document.getElementById('agendamientos')?.scrollIntoView({ behavior: 'smooth' }); }} /><PlatformAdmin token={session.access_token} onCreated={() => setCentersRevision(v => v + 1)} /></details>}
  </BackofficeLayout>;
}
