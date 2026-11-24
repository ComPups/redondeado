import { LoginView } from './backoffice/views/LoginView';
import { CentersView } from './backoffice/views/CentersView';
import { PlatformAdmin } from './backoffice/staff/PlatformAdmin';
import { useStaffWorkspace } from './backoffice/staff/staffWorkspace';

export function Staff() {
  const { configured, session, loading, centers, centersLoading, selected, role, appointments, agendaLoading, platformAdmin, centersError, platformError, roleError, agendaError, selectCenter, signIn, signOut, refreshCenters } = useStaffWorkspace();
  if (!configured) return <main><h1>Backoffice</h1><p>Supabase is not configured.</p></main>;
  if (loading) return <main>Checking session…</main>;
  if (!session) return <LoginView onSignIn={signIn} />;
  return <main><h1>Backoffice</h1><button onClick={signOut}>Sign out</button>
    {[centersError, platformError, roleError, agendaError].filter(Boolean).map(error => <p key={error} role="alert">{error}</p>)}
    {centers.length === 0 ? <p>No centers available.</p> : <label>Center <select value={selected} onChange={e => selectCenter(e.target.value)}>{centers.map(c => <option key={c.center_id} value={c.center_id}>{c.centers.name}</option>)}</select></label>}
    <button type="button" onClick={refreshCenters}>Refresh centers</button>
    {platformAdmin && <CentersView token={session.access_token} centers={centers.map(c => c.centers)} loading={centersLoading} onCreated={refreshCenters} onSelect={id => { selectCenter(id); document.getElementById("center-appointments")?.scrollIntoView({ behavior: "smooth" }); }} />}
    {platformAdmin && <PlatformAdmin token={session.access_token} onCreated={refreshCenters} />}
    {selected && <section id="center-appointments"><h2>{centers.find(c => c.center_id === selected)?.centers.name}</h2><p><a href={`/${centers.find(c => c.center_id === selected)?.centers.slug}`}>Ver página pública del centro</a></p>{role && <><p>Role: {role}</p><p>{role === 'platform_administrator' ? 'You can administer all centers.' : role === 'administrator' ? 'You can view all center appointments. Settings management is coming soon.' : role === 'member' ? 'You can view your own appointments.' : 'You have read-only access to your own appointments.'}</p></>}
    <h2>Appointments</h2>{agendaLoading ? <p role="status">Loading appointments…</p> : agendaError ? null : appointments.length ? <ul>{appointments.map(a => <li key={a.id}>{new Date(a.starts_at).toLocaleString()} — {a.service_name} — {a.patient_name}</li>)}</ul> : <p>No appointments.</p>}</section>}
  </main>;
}
