// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Services } from './Services';

vi.mock('../staff/BookingTermsEditor', () => ({ BookingTermsEditor: () => null }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('adds an existing center service and deletes only the staff offering', async () => {
  const catalog = [{ id: 'service-1', name: 'Consulta', description: 'Atención', price_clp: 30000, duration_minutes: 60 }];
  const request = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return { ok: true, json: async () => ({ ...catalog[0], price_clp: 25000, duration_minutes: 45 }) };
    if (options?.method === 'DELETE') return { ok: true, json: async () => ({ id: 'service-1' }) };
    return { ok: true, json: async () => url.endsWith('/service-catalog') ? catalog : [] };
  });
  vi.stubGlobal('fetch', request);
  render(<Services centerId="center" centerName="Centro" professionalName="Profesional" token="token" canEdit administrator={false} />);
  await screen.findByText('Aún no tienes servicios disponibles.');
  fireEvent.click(screen.getByRole('button', { name: 'Agregar servicio' }));
  fireEvent.change(screen.getByLabelText('Servicio del centro'), { target: { value: 'service-1' } });
  fireEvent.change(screen.getByLabelText('Duración (minutos)'), { target: { value: '45' } });
  fireEvent.change(screen.getByLabelText('Precio (CLP)'), { target: { value: '25000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByRole('heading', { name: 'Consulta' });
  const create = request.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(JSON.parse(String(create?.[1]?.body))).toEqual({ service_id: 'service-1', price_clp: 25000, duration_minutes: 45 });
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Consulta' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Eliminar servicio' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Confirmar eliminación' }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Consulta' })).toBeNull());
  expect(request.mock.calls.some(([url, options]) => url.endsWith('/services/service-1') && options?.method === 'DELETE')).toBe(true);
});
