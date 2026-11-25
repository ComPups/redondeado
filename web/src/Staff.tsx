import { Team } from './backoffice/staff/Team';
import { BookingTermsEditor } from './backoffice/staff/BookingTermsEditor';
import { BrandLoader } from './shared/components/BrandLoader';
import { LoadingSkeleton } from './shared/components/LoadingSkeleton';
import { Agenda } from './backoffice/appointments/Agenda';
import { apiUrl } from './shared/api';
import { Link, useLocation } from 'react-router';
import { LoginView } from './backoffice/views/LoginView';
import { CentersView } from './backoffice/views/CentersView';
import { BackofficeLayout } from './backoffice/components/BackofficeLayout';
import { PlatformAdmin } from './backoffice/staff/PlatformAdmin';
import { useStaffWorkspace } from './backoffice/staff/staffWorkspace';
import { Services } from './backoffice/services/Services';
import { ServiceCatalog } from './backoffice/services/ServiceCatalog';
import { CenterSettings } from './backoffice/components/CenterSettings';
import { EditButton } from './backoffice/components/EditButton';
import { useEffect, useState } from 'react';

export function Staff() {
  const location = useLocation();
  const [platformCenterOpen, setPlatformCenterOpen] = useState(false);
  const centerPage = location.pathname === '/staff/centro';
  const servicesPage = location.pathname === '/staff/servicios';
  const { configured, session, loading, centers, centersLoading, selected, role, platformAdmin, platformResolved, displayName, centersError, platformError, roleError, selectCenter, signIn, signOut, updateCenterDetails, refreshCenters } = useStaffWorkspace();
  const selectedCenter = centers.find(c => c.center_id === selected);
  const profile = selectedCenter?.centers;
  const [editingCenter, setEditingCenter] = useState(false);
  const [centerSaved, setCenterSaved] = useState(false);
  useEffect(() => { setEditingCenter(false); setCenterSaved(false); }, [selected, location.pathname, session?.user.id]);
  if (!configured) return <main><h1>Backoffice</h1><p>Supabase is not configured.</p></main>;
  if (loading) return <BrandLoader label="Comprobando sesión…" />;
  if (!session) return <LoginView onSignIn={signIn} />;
  if (!platformResolved) return <BrandLoader />;
  if (platformError) return <BackofficeLayout page="platform" onSignOut={signOut}><p className="notice error" role="alert">{platformError}</p></BackofficeLayout>;
  if (platformAdmin && location.pathname === '/staff/registros') return <BackofficeLayout page="platform" platformPage="records" onSignOut={signOut} onCenters={() => setPlatformCenterOpen(false)}>
    <div className="staff-admin"><PlatformAdmin token={session.access_token} onCreated={refreshCenters} /></div>
  </BackofficeLayout>;
  if (centersLoading && !centers.length) return <BrandLoader />;
  if (platformAdmin) return <BackofficeLayout page="platform" onSignOut={signOut} onCenters={() => setPlatformCenterOpen(false)}>
    {centersError && <p className="notice error" role="alert">{centersError}</p>}
    <div className="staff-context"><span>ADMINISTRACIÓN DE PLATAFORMA</span><button className="staff-signout" type="button" onClick={refreshCenters}>Actualizar centros</button></div>
    {platformCenterOpen && selectedCenter ? <>
      <button type="button" className="staff-signout" onClick={() => setPlatformCenterOpen(false)}>← Volver a centros</button>
      <section className="staff-section"><div className="staff-center-heading"><h1>{selectedCenter.centers.name}</h1><EditButton name="centro" onClick={() => { setEditingCenter(true); setCenterSaved(false); }} disabled={editingCenter} /></div><p>{selectedCenter.centers.description || 'Consulta la información de este centro.'}</p>
        {centerSaved && <p className="notice" role="status">Configuración guardada.</p>}
        {editingCenter && <CenterSettings key={`${selected}-settings`} center={selectedCenter.centers} token={session.access_token} onCancel={() => setEditingCenter(false)} onSaved={center => { updateCenterDetails(center); setEditingCenter(false); setCenterSaved(true); }} />}
        <ServiceCatalog key={selected} centerId={selected} token={session.access_token} canManage />
        <div className="staff-section"><Team key={selected} centerId={selected} token={session.access_token} onMembershipChanged={refreshCenters} /></div>
        <BookingTermsEditor key={`${selected}-terms`} centerId={selected} centerName={selectedCenter.centers.name} professionalName={displayName ?? 'Administrador de plataforma'} services={[]} administrator token={session.access_token} />
        <Agenda key={`${selected}-center`} scope="center" role="platform_administrator" token={session.access_token} centerId={selected} apiUrl={apiUrl} />
      </section>
    </> : <div id="centros"><CentersView token={session.access_token} centers={centers.map(c => c.centers)} loading={centersLoading} onCreated={refreshCenters} onSelect={id => { selectCenter(id); setPlatformCenterOpen(true); }} /></div>}
  </BackofficeLayout>;
  const roleLabel = { administrator: 'Administrador', member: 'Miembro', limited: 'Acceso limitado', platform_administrator: 'Administrador de plataforma' };
  return <BackofficeLayout page={centerPage ? 'center' : servicesPage ? 'services' : 'agenda'} onSignOut={signOut}>
    {centersError && <p className="notice error" role="alert">{centersError}</p>}
    {[platformError, roleError].filter(Boolean).map(error => <p className="notice error" key={error} role="alert">{error}</p>)}
    {centersLoading ? <LoadingSkeleton label="Cargando centros…" /> : centers.length === 0 ? <div className="empty">No tienes centros disponibles.</div> : <>
      <div className="staff-context"><span>MI CENTRO</span><label>Centro <select value={selected} onChange={e => selectCenter(e.target.value)}>{centers.map(c => <option key={c.center_id} value={c.center_id}>{c.centers.name}</option>)}</select></label><button className="staff-signout" type="button" onClick={refreshCenters}>Actualizar centros</button></div>
      {centerPage ? <><section className="staff-hero" aria-labelledby="center-name">
        <div><div className="staff-center-heading"><p className="staff-kicker">MI CENTRO</p>
          {role === 'administrator' && <EditButton name="centro" onClick={() => { setEditingCenter(true); setCenterSaved(false); }} disabled={editingCenter} />}</div><h1 id="center-name">{selectedCenter?.centers.name}</h1>
          <p>{profile?.description || 'Consulta la actividad y los servicios de tu centro.'}</p>
          {selectedCenter?.centers.slug && <Link className="staff-public-link" to={`/${selectedCenter.centers.slug}`}>Ver página pública <span aria-hidden="true">↗</span></Link>}</div>
        <div className="staff-hero-meta"><div><span>TU ROL</span><strong>{role ? roleLabel[role] : 'Cargando…'}</strong></div><div><span>HORARIO DE ATENCIÓN</span><strong>{profile?.opens_at && profile.closes_at ? `${profile.opens_at.slice(0, 5)} – ${profile.closes_at.slice(0, 5)}` : 'No disponible'}</strong></div></div>
      </section>
      {centerSaved && <p className="notice" role="status">Configuración guardada.</p>}
      {editingCenter && role === 'administrator' && selectedCenter && <CenterSettings key={`${selected}-settings`} center={selectedCenter.centers} token={session.access_token} onCancel={() => setEditingCenter(false)} onSaved={center => { updateCenterDetails(center); setEditingCenter(false); setCenterSaved(true); }} />}
      {role && <ServiceCatalog key={selected} centerId={selected} token={session.access_token} canManage={role === 'administrator'} />}
      {role === 'administrator' && <div className="staff-section"><Team key={selected} centerId={selected} token={session.access_token} onMembershipChanged={refreshCenters} /></div>}
      {role === 'administrator' && <Agenda key={`${selected}-center`} scope="center" role={role} token={session.access_token} centerId={selected} apiUrl={apiUrl} />}
      </> : servicesPage ? <>
      {selectedCenter && <Services key={selected} centerId={selected} centerName={selectedCenter.centers.name} professionalName={displayName ?? 'Profesional'} token={session.access_token} canEdit={role === 'member' || role === 'administrator'} administrator={role === 'administrator'} />}</> : <>
      <div className="staff-welcome"><p className="eyebrow">TU ESPACIO DE TRABAJO</p><h1>{displayName ? `¡Hola, ${displayName.split(/\s+/)[0]}!` : '¡Hola!'}</h1><p>Revisa la agenda y los servicios de {selectedCenter?.centers.name}.</p></div>
      <Agenda key={`${selected}-personal`} role={role ?? 'limited'} token={session.access_token} centerId={selected} apiUrl={apiUrl} />
      </>}
    </>}

  </BackofficeLayout>;
}
