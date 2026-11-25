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
const appointment = (id: string) => [{ id, professional_user_id: auth.session?.user.id ?? auth.role, patient_name: `Patient ${id}`, service_name: 'Consultation', patient_email: 'patient@example.com', patient_phone: '+56912345678', starts_at: '2099-11-24T13:00:00Z', ends_at: '2099-11-24T14:00:00Z' }];
const agenda = (items: ReturnType<typeof appointment>, has_more = false) => ({ appointments: items, has_more });
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
    if (path === '/staff/me') return response({ platformAdmin: auth.role === 'platform_administrator', displayName: 'Camila Rojas' });
    if (path === '/staff/platform/editable-fields') return response({ centers: ['image_url'] });
    if (path === '/staff/platform/centers') return response([{ id: 'a', name: 'Center A', image_url: null }]);
    if (path === '/staff/centers/a') return response({ role: auth.role }, !failRole);
    if (path === '/staff/centers/b') return response({ role: auth.role });
    if (path === '/staff/centers/a/service-catalog' || path === '/staff/centers/b/service-catalog') return response([]);
    if (path === '/staff/centers/a/booking-options') return response({ professionals: [{ id: 'p', name: 'Camila' }], services: [{ id: 's', name: 'Consulta', duration_minutes: 60, professional_id: 'p' }] });
    if (path === '/staff/centers/a/appointments') return pendingAgenda ? pendingAgenda.promise : response(agenda(appointment('A')));
    if (path === '/staff/centers/b/appointments') return response(agenda(appointment('B')));
    throw new Error(`Unexpected request ${path}`);
  }));
}
async function signIn(role: CenterRole) {
  auth.role = role;
  render(<MemoryRouter><Staff /></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('Correo electrónico'), { target: { value: `${role}@example.com` } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  await screen.findByRole('heading', { name: role === 'platform_administrator' ? 'Centros' : 'Agendamientos' });
}
beforeEach(() => { window.history.replaceState({}, '', '/staff/login'); auth.session = null; auth.signOutOptions = null; auth.revokeFails = false; centers = originalCenters; pendingAgenda = null; failRole = false; mockApi(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('staff workspace through the screen', () => {
  it('greets the staff member and navigates between distinct pages', async () => {
    await signIn('member');
    expect(await screen.findByRole('heading', { name: '¡Hola, Camila!' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Servicios' }));
    expect(screen.getByRole('heading', { name: 'Servicios ofrecidos' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Agendamientos' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Mi centro' }));
    expect(screen.getByRole('heading', { name: 'Center A' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Servicios ofrecidos' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Catálogo del centro' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Agregar servicio' })).toBeNull();
  });

  for (const role of ['administrator', 'member', 'limited'] as const) {
    it(`signs in and displays the ${role} role and agenda`, async () => {
      await signIn(role);
      expect(await screen.findByText(/Patient A/)).toBeTruthy();
      expect((screen.getByLabelText('Centro') as HTMLSelectElement).value).toBe('a');
    });
  }
  it('separates an administrator’s appointments from the center agenda', async () => {
    auth.role = 'administrator';
    mockApi();
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname === '/staff/centers/a/appointments') {
        return response(agenda(new URL(String(input)).searchParams.get('scope') === 'center' ? [...appointment('Own'), { ...appointment('Other')[0], professional_user_id: 'another-professional' }] : appointment('Own')));
      }
      return originalFetch(input, init);
    });
    await signIn('administrator');
    expect(await screen.findByText(/Patient Own/)).toBeTruthy();
    expect(screen.queryByText(/Patient Other/)).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Mi centro' }));
    expect(screen.getByRole('heading', { name: 'Agendamientos del centro' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Catálogo del centro' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Agregar servicio' })).toBeTruthy();
    expect(await screen.findByText(/Patient Own/)).toBeTruthy();
    expect(await screen.findByText(/Patient Other/)).toBeTruthy();
  });
  it('loads 50-item pages and resets the page when changing filters', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/staff/centers/a/appointments') {
        const page = url.searchParams.get('page');
        const period = url.searchParams.get('period');
        return response(agenda(appointment(`${period}-${page}`), period === 'upcoming' && page === '1'));
      }
      return originalFetch(input, init);
    });
    await signIn('member');
    expect(await screen.findByText(/Patient upcoming-1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText(/Patient upcoming-2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pasadas' }));
    expect(await screen.findByText(/Patient past-1/)).toBeTruthy();
  });
  it('does not show the center agenda to members', async () => {
    await signIn('member');
    fireEvent.click(screen.getByRole('link', { name: 'Mi centro' }));
    expect(screen.queryByRole('heading', { name: 'Agendamientos del centro' })).toBeNull();
  });
  it('opens manual booking with the center options', async () => {
    await signIn('member');
    fireEvent.click(screen.getByRole('button', { name: '+ Agendar cita' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'Consulta · 60 min' })).toBeTruthy();
    expect(screen.queryByLabelText('Profesional')).toBeNull();
  });
  it('lets administrators select a professional when booking from the center page', async () => {
    await signIn('administrator');
    fireEvent.click(screen.getByRole('link', { name: 'Mi centro' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Agendar cita' }));
    expect(await screen.findByRole('option', { name: 'Camila' })).toBeTruthy();
    expect(screen.getByLabelText('Profesional')).toBeTruthy();
  });
  it('opens a separate confirmation before deleting', async () => {
    await signIn('administrator');
    fireEvent.click(await screen.findByRole('button', { name: /Patient A/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('¿Eliminar esta cita? Esta acción no se puede deshacer.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Detalle de la cita')).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  });
  it('does not offer manual booking to limited users', async () => {
    await signIn('limited');
    expect(screen.queryByRole('button', { name: '+ Agendar cita' })).toBeNull();
  });
  it('keeps the selected center on refresh and discards an old agenda after a switch', async () => {
    pendingAgenda = deferred<Response>();
    await signIn('member');
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'b' } });
    expect(await screen.findByText(/Patient B/)).toBeTruthy();
    const requestsBeforeRefresh = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/staff/centers')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar centros' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/staff/centers')).length).toBe(requestsBeforeRefresh + 1));
    await waitFor(() => expect((screen.getByLabelText('Centro') as HTMLSelectElement).value).toBe('b'));
    await act(async () => pendingAgenda!.resolve(response(agenda(appointment('A')))));
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
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar centros' }));
    await screen.findByText('Revisa los agendamientos asignados a ti.');
    expect(screen.queryByText(/Patient A/)).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Cargando agendamientos');
    await act(async () => pendingAgenda!.resolve(response(agenda(appointment('Member')))));
    expect(await screen.findByText(/Patient Member/)).toBeTruthy();
  });
  it('clears the agenda on sign out and ignores the outstanding response', async () => {
    pendingAgenda = deferred<Response>();
    await signIn('member');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('button', { name: 'Ingresar' });
    await act(async () => pendingAgenda!.resolve(response(agenda(appointment('A')))));
    expect(screen.queryByText(/Patient A/)).toBeNull();
  });
  it('signs out locally even when server revocation fails', async () => {
    auth.revokeFails = true;
    await signIn('member');
    expect(await screen.findByText(/Patient A/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('button', { name: 'Ingresar' });
    expect(auth.signOutOptions).toEqual({ scope: 'local' });
    expect(auth.session).toBeNull();
    expect(screen.queryByText(/Patient A/)).toBeNull();
    cleanup();
    render(<MemoryRouter><Staff /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeTruthy();
    expect(screen.queryByText(/Patient A/)).toBeNull();
  });
  it('opens platform administration directly and refreshes center cards', async () => {
    await signIn('platform_administrator');
    expect(screen.queryByRole('heading', { name: 'Agendamientos' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Mi centro' })).toBeNull();
    expect(screen.queryByText('Tu espacio de trabajo')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Center B' })).toBeTruthy();
    centers = originalCenters.map(c => c.center_id === 'b' ? { ...c, centers: { ...c.centers, name: 'Renamed Center B' } } : c);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar centros' }));
    const cards = screen.getByRole('region', { name: 'Centros existentes' });
    await waitFor(() => expect(within(cards).getByRole('heading', { name: 'Renamed Center B' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Center B' })).toBeNull();
  });
  it('uses the API field list to populate the platform editor', async () => {
    await signIn('platform_administrator');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Editable fields (JSON)' });
    expect(JSON.parse(editor.value)).toEqual({ image_url: null });
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
