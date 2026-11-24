// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const auth = vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key');
  return { listener: (_event: string, _session: unknown) => {}, role: 'member', session: null as null | { access_token: string; user: { id: string } }, signOutOptions: null as null | { scope: string }, revokeFails: false };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {
  getSession: async () => ({ data: { session: auth.session } }),
  onAuthStateChange: (callback: typeof auth.listener) => { auth.listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  signInWithPassword: async () => { window.history.replaceState({}, '', '/staff'); auth.session = { access_token: auth.role, user: { id: auth.role } }; auth.listener('SIGNED_IN', auth.session); return { error: null }; },
  signOut: async (options: { scope: string }) => { auth.signOutOptions = options; if (options.scope === 'local') { auth.session = null; window.history.replaceState({}, '', '/staff/login'); auth.listener('SIGNED_OUT', null); } return { error: auth.revokeFails ? new Error('offline') : null }; },
} }) }));
import { Staff } from './Staff';

type CenterRole = 'administrator' | 'member' | 'limited' | 'platform_administrator';
const originalCenters = [
  { center_id: 'a', role: 'member', centers: { id: 'a', name: 'Center A', slug: 'center-a', description: '', opens_at: '09:00', closes_at: '18:00' } },
  { center_id: 'b', role: 'member', centers: { id: 'b', name: 'Center B', slug: 'center-b', description: '', opens_at: '09:00', closes_at: '18:00' } },
];
let centers = originalCenters;
const appointment = (id: string) => [{ id, patient_name: `Patient ${id}`, service_name: 'Consultation', starts_at: '2026-11-24T13:00:00Z' }];
const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => data }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
let pendingAgenda: ReturnType<typeof deferred<Response>> | null;
let failRole: boolean;
function mockApi() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (path === '/staff/centers') return response(centers);
    if (path === '/staff/me') return response({ platformAdmin: auth.role === 'platform_administrator' });
    if (path === '/staff/platform/centers') return response([]);
    if (path === '/staff/centers/a') return response({ role: auth.role }, !failRole);
    if (path === '/staff/centers/b') return response({ role: auth.role });
    if (path === '/staff/centers/a/appointments') return pendingAgenda ? pendingAgenda.promise : response(appointment('A'));
    if (path === '/staff/centers/b/appointments') return response(appointment('B'));
    throw new Error(`Unexpected request ${path}`);
  }));
}
async function signIn(role: CenterRole) {
  auth.role = role;
  render(<MemoryRouter><Staff /></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('Correo electrónico'), { target: { value: `${role}@example.com` } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  await screen.findByText(`Role: ${role}`);
}
beforeEach(() => { window.history.replaceState({}, '', '/staff/login'); auth.session = null; auth.signOutOptions = null; auth.revokeFails = false; centers = originalCenters; pendingAgenda = null; failRole = false; mockApi(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('staff workspace through the screen', () => {
  for (const role of ['administrator', 'member', 'limited'] as const) {
    it(`signs in and displays the ${role} role and agenda`, async () => {
      await signIn(role);
      expect(await screen.findByText(/Patient A/)).toBeTruthy();
      expect((screen.getByLabelText('Center') as HTMLSelectElement).value).toBe('a');
    });
  }
  it('keeps the selected center on refresh and discards an old agenda after a switch', async () => {
    pendingAgenda = deferred<Response>();
    await signIn('member');
    fireEvent.change(screen.getByLabelText('Center'), { target: { value: 'b' } });
    expect(await screen.findByText(/Patient B/)).toBeTruthy();
    const requestsBeforeRefresh = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/staff/centers')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh centers' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/staff/centers')).length).toBe(requestsBeforeRefresh + 1));
    await waitFor(() => expect((screen.getByLabelText('Center') as HTMLSelectElement).value).toBe('b'));
    await act(async () => pendingAgenda!.resolve(response(appointment('A'))));
    expect(screen.queryByText(/Patient A/)).toBeNull();
    expect(screen.getByText(/Patient B/)).toBeTruthy();
  });
  it('clears and reloads the agenda if the selected membership role changes on refresh', async () => {
    auth.role = 'administrator';
    centers = originalCenters.map(c => ({ ...c, role: 'administrator' }));
    await signIn('administrator');
    expect(await screen.findByText(/Patient A/)).toBeTruthy();
    pendingAgenda = deferred<Response>();
    auth.role = 'member';
    centers = originalCenters;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh centers' }));
    await screen.findByText('Role: member');
    expect(screen.queryByText(/Patient A/)).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Loading appointments');
    await act(async () => pendingAgenda!.resolve(response(appointment('Member'))));
    expect(await screen.findByText(/Patient Member/)).toBeTruthy();
  });
  it('clears the agenda on sign out and ignores the outstanding response', async () => {
    pendingAgenda = deferred<Response>();
    await signIn('member');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Ingresar' });
    await act(async () => pendingAgenda!.resolve(response(appointment('A'))));
    expect(screen.queryByText(/Patient A/)).toBeNull();
  });
  it('signs out locally even when server revocation fails', async () => {
    auth.revokeFails = true;
    await signIn('member');
    expect(await screen.findByText(/Patient A/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Ingresar' });
    expect(auth.signOutOptions).toEqual({ scope: 'local' });
    expect(auth.session).toBeNull();
    expect(screen.queryByText(/Patient A/)).toBeNull();
    cleanup();
    render(<MemoryRouter><Staff /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeTruthy();
    expect(screen.queryByText(/Patient A/)).toBeNull();
  });
  it('refreshes platform center cards and the selector from the same list', async () => {
    await signIn('platform_administrator');
    expect(await screen.findByRole('heading', { name: 'Center B' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Center'), { target: { value: 'b' } });
    centers = originalCenters.map(c => c.center_id === 'b' ? { ...c, centers: { ...c.centers, name: 'Renamed Center B' } } : c);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh centers' }));
    const cards = screen.getByRole('region', { name: 'Centros existentes' });
    await waitFor(() => expect(within(cards).getByRole('heading', { name: 'Renamed Center B' })).toBeTruthy());
    expect(screen.getByRole('option', { name: 'Renamed Center B' })).toBeTruthy();
    expect((screen.getByLabelText('Center') as HTMLSelectElement).value).toBe('b');
    expect(screen.queryByRole('heading', { name: 'Center B' })).toBeNull();
  });
  it('keeps a role error when the agenda succeeds', async () => {
    failRole = true;
    auth.role = 'member';
    render(<MemoryRouter><Staff /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Correo electrónico'), { target: { value: 'member@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Could not load center access.')).toBeTruthy();
    expect(await screen.findByText(/Patient A/)).toBeTruthy();
    expect(screen.getByText('Could not load center access.')).toBeTruthy();
  });
});
