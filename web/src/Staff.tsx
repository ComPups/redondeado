import { useState } from 'react';
import { useLocation } from 'react-router';
import { LoginView } from './backoffice/views/LoginView';
import { CentersView } from './backoffice/views/CentersView';
import { BackofficeLayout } from './backoffice/components/BackofficeLayout';
import { PlatformAdmin } from './backoffice/staff/PlatformAdmin';
import { useStaffWorkspace } from './backoffice/staff/staffWorkspace';
import { formatPrice, useCenterProfile } from './public/centerProfile';

export function Staff() {
  const location = useLocation();
  const centerPage = location.pathname === '/staff/centro';
  const servicesPage = location.pathname === '/staff/servicios';
  const { configured, session, loading, centers, centersLoading, selected, role, appointments, agendaLoading, platformAdmin, displayName, centersError, platformError, roleError, agendaError, selectCenter, signIn, signOut, refreshCenters } = useStaffWorkspace();
  const [agendaFilter, setAgendaFilter] = useState<'upcoming' | 'past'>('upcoming');
  const selectedCenter = centers.find(c => c.center_id === selected);
  const profileResult = useCenterProfile(selectedCenter?.centers.slug ?? '');
  const profile = profileResult.status === 'ready' ? profileResult.profile : null;
  if (!configured) return <main><h1>Backoffice</h1><p>Supabase is not configured.</p></main>;
  if (loading) return <main>Checking session…</main>;
  if (!session) return <LoginView onSignIn={signIn} />;
  const now = Date.now();
  const visibleAppointments = appointments.filter(a => agendaFilter === 'upcoming' ? new Date(a.starts_at).getTime() >= now : new Date(a.starts_at).getTime() < now);
  if (agendaFilter === 'past') visibleAppointments.reverse();
  const roleLabel = { administrator: 'Administrador', member: 'Miembro', limited: 'Acceso limitado', platform_administrator: 'Administrador de plataforma' };
  return <BackofficeLayout page={centerPage ? 'center' : servicesPage ? 'services' : 'agenda'} onSignOut={signOut}>
    {centersError && <p className="notice error" role="alert">{centersError}</p>}
    {[platformError, roleError].filter(Boolean).map(error => <p className="notice error" key={error} role="alert">{error}</p>)}
    {centersLoading ? <div className="empty" role="status">Cargando centros…</div> : centers.length === 0 ? <div className="empty">No tienes centros disponibles.</div> : <>
      <div className="staff-context"><span>MI CENTRO</span><label>Centro <select value={selected} onChange={e => selectCenter(e.target.value)}>{centers.map(c => <option key={c.center_id} value={c.center_id}>{c.centers.name}</option>)}</select></label><button className="staff-signout" type="button" onClick={refreshCenters}>Actualizar centros</button></div>
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
    {platformAdmin && !centerPage && !servicesPage && <details className="staff-admin"><summary>Administración de plataforma</summary><CentersView token={session.access_token} centers={centers.map(c => c.centers)} loading={centersLoading} onCreated={refreshCenters} onSelect={id => { selectCenter(id); document.getElementById('agendamientos')?.scrollIntoView({ behavior: 'smooth' }); }} /><PlatformAdmin token={session.access_token} onCreated={refreshCenters} /></details>}
  </BackofficeLayout>;
}
