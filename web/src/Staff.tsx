import { Agenda } from './backoffice/appointments/Agenda';
import { apiUrl } from './shared/api';
import { useLocation } from 'react-router';
import { LoginView } from './backoffice/views/LoginView';
import { CentersView } from './backoffice/views/CentersView';
import { BackofficeLayout } from './backoffice/components/BackofficeLayout';
import { PlatformAdmin } from './backoffice/staff/PlatformAdmin';
import { useStaffWorkspace } from './backoffice/staff/staffWorkspace';
import { Services } from './backoffice/services/Services';
import { ServiceCatalog } from './backoffice/services/ServiceCatalog';
import { useCenterProfile } from './public/centerProfile';

export function Staff() {
  const location = useLocation();
  const centerPage = location.pathname === '/staff/centro';
  const servicesPage = location.pathname === '/staff/servicios';
  const { configured, session, loading, centers, centersLoading, selected, role, platformAdmin, platformResolved, displayName, centersError, platformError, roleError, selectCenter, signIn, signOut, refreshCenters } = useStaffWorkspace();
  const selectedCenter = centers.find(c => c.center_id === selected);
  const profileResult = useCenterProfile(selectedCenter?.centers.slug ?? '');
  const profile = profileResult.status === 'ready' ? profileResult.profile : null;
  if (!configured) return <main><h1>Backoffice</h1><p>Supabase is not configured.</p></main>;
  if (loading) return <main>Checking session…</main>;
  if (!session) return <LoginView onSignIn={signIn} />;
  if (!platformResolved) return <main role="status">Cargando acceso…</main>;
  if (platformError) return <BackofficeLayout page="platform" onSignOut={signOut}><p className="notice error" role="alert">{platformError}</p></BackofficeLayout>;
  if (platformAdmin) return <BackofficeLayout page="platform" onSignOut={signOut}>
    {centersError && <p className="notice error" role="alert">{centersError}</p>}
    <div className="staff-context"><span>ADMINISTRACIÓN DE PLATAFORMA</span><button className="staff-signout" type="button" onClick={refreshCenters}>Actualizar centros</button></div>
    <div id="centros"><CentersView token={session.access_token} centers={centers.map(c => c.centers)} loading={centersLoading} onCreated={refreshCenters} /></div>
    <div id="registros" className="staff-admin"><PlatformAdmin token={session.access_token} onCreated={refreshCenters} /></div>
  </BackofficeLayout>;
  const roleLabel = { administrator: 'Administrador', member: 'Miembro', limited: 'Acceso limitado', platform_administrator: 'Administrador de plataforma' };
  return <BackofficeLayout page={centerPage ? 'center' : servicesPage ? 'services' : 'agenda'} onSignOut={signOut}>
    {centersError && <p className="notice error" role="alert">{centersError}</p>}
    {[platformError, roleError].filter(Boolean).map(error => <p className="notice error" key={error} role="alert">{error}</p>)}
    {centersLoading ? <div className="empty" role="status">Cargando centros…</div> : centers.length === 0 ? <div className="empty">No tienes centros disponibles.</div> : <>
      <div className="staff-context"><span>MI CENTRO</span><label>Centro <select value={selected} onChange={e => selectCenter(e.target.value)}>{centers.map(c => <option key={c.center_id} value={c.center_id}>{c.centers.name}</option>)}</select></label><button className="staff-signout" type="button" onClick={refreshCenters}>Actualizar centros</button></div>
      {centerPage ? <><section className="staff-hero" aria-labelledby="center-name">
        <div><p className="staff-kicker">MI CENTRO</p><h1 id="center-name">{selectedCenter?.centers.name}</h1>
          <p>{profile?.description || (profileResult.status === 'loading' ? 'Cargando información del centro…' : 'Consulta la actividad y los servicios de tu centro.')}</p>
          {selectedCenter?.centers.slug && <a className="staff-public-link" href={`/${selectedCenter.centers.slug}`}>Ver página pública <span aria-hidden="true">↗</span></a>}</div>
        <div className="staff-hero-meta"><div><span>TU ROL</span><strong>{role ? roleLabel[role] : 'Cargando…'}</strong></div><div><span>HORARIO DE ATENCIÓN</span><strong>{profile?.opens_at && profile.closes_at ? `${profile.opens_at.slice(0, 5)} – ${profile.closes_at.slice(0, 5)}` : 'No disponible'}</strong></div></div>
      </section>
      {role && <ServiceCatalog key={selected} centerId={selected} token={session.access_token} canManage={role === 'administrator'} />}
      {role === 'administrator' && <Agenda key={`${selected}-center`} scope="center" role={role} token={session.access_token} centerId={selected} apiUrl={apiUrl} />}
      </> : servicesPage ? <>
      {selectedCenter && <Services key={selected} centerId={selected} centerName={selectedCenter.centers.name} professionalName={displayName ?? 'Profesional'} token={session.access_token} canEdit={role === 'member' || role === 'administrator'} administrator={role === 'administrator'} />}</> : <>
      <div className="staff-welcome"><p className="eyebrow">TU ESPACIO DE TRABAJO</p><h1>{displayName ? `¡Hola, ${displayName.split(/\s+/)[0]}!` : '¡Hola!'}</h1><p>Revisa la agenda y los servicios de {selectedCenter?.centers.name}.</p></div>
      <Agenda key={`${selected}-personal`} role={role ?? 'limited'} token={session.access_token} centerId={selected} apiUrl={apiUrl} />
      </>}
    </>}

  </BackofficeLayout>;
}
