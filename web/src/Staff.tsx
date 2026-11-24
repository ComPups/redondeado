import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent } from 'react';
import { LoginView } from './backoffice/views/LoginView';
import { CentersView } from './backoffice/views/CentersView';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;
type Center = { center_id: string; role: 'platform_administrator' | 'administrator' | 'member' | 'limited'; centers: { id: string; name: string } };
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
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [centers, setCenters] = useState<Center[]>([]);
  const [selected, setSelected] = useState('');
  const [role, setRole] = useState<Center['role'] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [centersRevision, setCentersRevision] = useState(0);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (loading) return;
    if (!session && location.pathname !== '/staff/login') location.replace('/staff/login');
    if (session && location.pathname === '/staff/login') location.replace('/staff');
  }, [session, loading]);
  useEffect(() => {
    setCenters([]); setSelected(''); setRole(null); setAppointments([]); setPlatformAdmin(false);
    if (!session) return;
    let active = true;
    staffFetch('/staff/centers', session.access_token).then((data: Center[]) => {
      if (active) { setCenters(data); setSelected(data[0]?.center_id ?? ''); }
    }).catch(() => { if (active) setError('Could not load your centers.'); });
    staffFetch('/staff/me', session.access_token).then(data => { if (active) setPlatformAdmin(data.platformAdmin); }).catch(() => { if (active) setError('Could not load your role.'); });
    return () => { active = false; };
  }, [session, centersRevision]);
  useEffect(() => {
    setRole(null); setAppointments([]);
    if (!session || !selected) return;
    let active = true;
    const base = `/staff/centers/${encodeURIComponent(selected)}`;
    Promise.all([staffFetch(base, session.access_token), staffFetch(`${base}/appointments`, session.access_token)])
      .then(([membership, rows]) => { if (active) { setRole(membership.role); setAppointments(rows); setError(''); } })
      .catch(() => { if (active) setError('Could not load center access or appointments.'); });
    return () => { active = false; };
  }, [session, selected]);
  async function signIn(email: string, password: string) {
    const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password });
    return signInError ? 'No pudimos iniciar sesión. Revisa tu correo y contraseña.' : null;
  }
  if (!supabase) return <main><h1>Backoffice</h1><p>Supabase is not configured.</p></main>;
  if (loading) return <main>Checking session…</main>;
  if (!session) return <LoginView onSignIn={signIn} />;
  return <main><h1>Backoffice</h1><button onClick={() => void supabase.auth.signOut()}>Sign out</button>
    {error && <p role="alert">{error}</p>}
    {centers.length === 0 ? <p>No centers available.</p> : <label>Center <select value={selected} onChange={e => setSelected(e.target.value)}>{centers.map(c => <option key={c.center_id} value={c.center_id}>{c.centers.name}</option>)}</select></label>}
    {platformAdmin && <CentersView token={session.access_token} onCreated={() => setCentersRevision(v => v + 1)} />}
    {platformAdmin && <PlatformAdmin token={session.access_token} onCreated={() => setCentersRevision(v => v + 1)} />}
    {role && <><p>Role: {role}</p><p>{role === 'platform_administrator' ? 'You can administer all centers.' : role === 'administrator' ? 'You can view all center appointments. Settings management is coming soon.' : role === 'member' ? 'You can view your own appointments.' : 'You have read-only access to your own appointments.'}</p>
    <h2>Appointments</h2>{appointments.length ? <ul>{appointments.map(a => <li key={a.id}>{new Date(a.starts_at).toLocaleString()} — {a.service_name} — {a.patient_name}</li>)}</ul> : <p>No appointments.</p>}</>}
  </main>;
}
