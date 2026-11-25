// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Team } from './Team';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const member = { user_id: 'u1', display_name: 'Camila', role: 'administrator', active: true, services: ['Consulta'], upcoming_appointments: 2 };
function api() { return vi.fn(async (url: string, init?: RequestInit) => { if (init?.method) return response({}); if (url.endsWith('/service-catalog')) return response([{ id: 's1', name: 'Psicología', price_clp: 35000, duration_minutes: 60 }]); return response({ members: [member] }); }); }
it('creates a member with password, default role, and selected service', async () => {
  const fetcher = api(); vi.stubGlobal('fetch', fetcher); vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' });
  render(<Team centerId="c1" token="token" />); const checkbox = await screen.findByRole('checkbox', { name: /Psicología.*35.000.*60 min/ });
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana Pérez' } }); fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@example.com' } }); fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'New-password!' } }); fireEvent.click(checkbox); fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/team/members'), expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Idempotency-Key': '00000000-0000-4000-8000-000000000001' }), body: JSON.stringify({ display_name: 'Ana Pérez', email: 'ana@example.com', password: 'New-password!', role: 'member', service_ids: ['s1'] }) })));
});
it('reuses the idempotency key when a committed response is lost', async () => {
  let attempts = 0;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && attempts++ === 0) throw new Error('network timeout');
    if (init?.method) return response({});
    if (url.endsWith('/service-catalog')) return response([{ id: 's1', name: 'Psicología', price_clp: 35000, duration_minutes: 60 }]);
    return response({ members: [member] });
  });
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000002' });
  render(<Team centerId="c1" token="token" />); const checkbox = await screen.findByRole('checkbox', { name: /Psicología.*35.000.*60 min/ });
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana Pérez' } }); fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@example.com' } }); fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'New-password!' } }); fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' })); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' })); await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2));
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'); expect((posts[0][1] as RequestInit).headers).toEqual(expect.objectContaining({ 'Idempotency-Key': '00000000-0000-4000-8000-000000000002' })); expect((posts[1][1] as RequestInit).headers).toEqual(expect.objectContaining({ 'Idempotency-Key': '00000000-0000-4000-8000-000000000002' }));
});
it('warns about upcoming appointments before deactivation', async () => {
  const fetcher = api(); vi.stubGlobal('fetch', fetcher); const confirm = vi.fn(() => true); vi.stubGlobal('confirm', confirm); render(<Team centerId="c1" token="token" />);
  expect(await screen.findByText(/2 citas próximas/)).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Desactivar' })); expect(confirm).toHaveBeenCalledWith(expect.stringContaining('2 citas próximas')); await waitFor(() => expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/team/members/u1'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'administrator', active: false }) })));
});
