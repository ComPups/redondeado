import { createClient, type Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../shared/api';
import type { Center as CenterDetails } from '../centers';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;
export type Center = { center_id: string; role: 'platform_administrator' | 'administrator' | 'member' | 'limited'; centers: CenterDetails };
export async function staffFetch(path: string, token: string, signal?: AbortSignal) {
  const response = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

export function useStaffWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [centers, setCenters] = useState<Center[]>([]);
  const [centersLoading, setCentersLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const [role, setRole] = useState<Center['role'] | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [platformResolved, setPlatformResolved] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [centersError, setCentersError] = useState('');
  const [platformError, setPlatformError] = useState('');
  const [roleError, setRoleError] = useState('');
  const [revision, setRevision] = useState(0);
  const [centerRevision, setCenterRevision] = useState(0);
  const authVersion = useRef(0);
  const centerVersion = useRef(0);
  const sessionUser = useRef<string | null>(null);
  const selectedRef = useRef('');
  const centersRef = useRef<Center[]>([]);
  const clearCenter = useCallback(() => {
    centerVersion.current++;
    setRole(null); setRoleError('');
  }, []);
  const selectCenter = useCallback((id: string) => {
    if (id === selectedRef.current) return;
    clearCenter(); selectedRef.current = id; setSelected(id);
  }, [clearCenter]);
  const clearWorkspace = useCallback(() => {
    authVersion.current++; clearCenter(); selectedRef.current = ''; setSelected('');
    centersRef.current = []; setCenters([]); setCentersLoading(false); setPlatformAdmin(false); setPlatformResolved(false); setDisplayName(null); setCentersError(''); setPlatformError('');
  }, [clearCenter]);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    let authEvent = false;
    const apply = (next: Session | null) => {
      if (!active) return;
      const nextUser = next?.user.id ?? null;
      if (nextUser !== sessionUser.current) { clearWorkspace(); sessionUser.current = nextUser; }
      setSession(next); setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => { if (!authEvent) apply(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { authEvent = true; apply(next); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [clearWorkspace]);
  useEffect(() => {
    if (loading || signingOut) return;
    if (!session && location.pathname !== '/staff/login') location.replace('/staff/login');
    if (session && location.pathname === '/staff/login') location.replace('/staff');
  }, [session, loading, signingOut]);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setCentersLoading(true);
    const version = authVersion.current;
    const valid = () => !controller.signal.aborted && version === authVersion.current;
    staffFetch('/staff/centers', session.access_token, controller.signal).then((data: Center[]) => {
      if (!valid()) return;
      const previous = centersRef.current.find(c => c.center_id === selectedRef.current);
      const current = data.find(c => c.center_id === selectedRef.current);
      centersRef.current = data; setCenters(data); setCentersLoading(false); setCentersError('');
      if (!current) selectCenter(data[0]?.center_id ?? '');
      else if (previous && previous.role !== current.role) {
        clearCenter(); setCenterRevision(v => v + 1);
      }
    }).catch(() => { if (valid()) { setCentersError('Could not load your centers.'); setCentersLoading(false); } });
    staffFetch('/staff/me', session.access_token, controller.signal).then(data => {
      if (valid()) { setPlatformAdmin(data.platformAdmin); setPlatformResolved(true); setDisplayName(data.displayName); setPlatformError(''); }
    }).catch(() => { if (valid()) { setPlatformResolved(true); setPlatformError('No pudimos comprobar tu acceso.'); } });
    return () => controller.abort();
  }, [session, revision, selectCenter, clearCenter]);
  useEffect(() => {
    if (!session || !selected) return;
    const controller = new AbortController();
    const version = centerVersion.current;
    const valid = () => !controller.signal.aborted && version === centerVersion.current;
    const base = `/staff/centers/${encodeURIComponent(selected)}`;
    staffFetch(base, session.access_token, controller.signal).then(data => {
      if (valid()) { setRole(data.role); setRoleError(''); }
    }).catch(() => { if (valid()) setRoleError('Could not load center access.'); });
    return () => controller.abort();
  }, [session, selected, centerRevision]);
  async function signIn(email: string, password: string) {
    if (!supabase) return 'El servicio no está configurado.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? 'No pudimos iniciar sesión. Revisa tu correo y contraseña.' : null;
  }
  function signOut() {
    setSigningOut(true); clearWorkspace(); sessionUser.current = null; setSession(null);
    void supabase?.auth.signOut({ scope: 'local' }).catch(() => {}).finally(() => setSigningOut(false));
  }
  return { configured: !!supabase, session, loading, centers, centersLoading, selected, role, platformAdmin, platformResolved, displayName, centersError, platformError, roleError, selectCenter, signIn, signOut, refreshCenters: () => setRevision(v => v + 1) };
}
