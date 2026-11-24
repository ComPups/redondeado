// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PublicCenterView } from './PublicCenterView';

const request = vi.fn();

const date = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const startsAt = `${date.slice(0, 7)}-01T13:00:00Z`;
const nextDayStartsAt = `${date.slice(0, 7)}-02T13:00:00Z`;
const profile = {
  name: 'Centro Arrayán',
  description: 'Atención en Santiago',
  opens_at: '09:00:00',
  closes_at: '18:00:00',
  services: [
    { id: 'psychology', name: 'Psicología', description: 'Apoyo emocional', price_clp: 35000, duration_minutes: 60 },
    { id: 'nutrition', name: 'Nutrición', description: 'Plan de alimentación', price_clp: 30000, duration_minutes: 45 },
  ],
  professionals: [
    { id: 'camila', name: 'Camila Rojas', description: 'Atiende a personas adultas' },
    { id: 'matias', name: 'Matías Soto', description: 'Trabaja con familias' },
  ],
};

beforeEach(() => {
  request.mockReset();
  vi.stubGlobal('fetch', request);
  request.mockImplementation(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return { ok: true, status: 201, json: async () => ({ success: true }) };
    if (url.includes('/availability?')) return { ok: true, status: 200, json: async () => [{ starts_at: startsAt }, { starts_at: nextDayStartsAt }] };
    return { ok: true, status: 200, json: async () => profile };
  });
});

afterEach(cleanup);

async function openCenter() {
  render(
    <MemoryRouter initialEntries={['/arrayan']}>
      <Routes><Route path="/:slug" element={<PublicCenterView />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Centro Arrayán' });
}

it('filters the service catalog and books after choosing any center professional', async () => {
  await openCenter();
  expect(screen.getByRole('link', { name: 'Agendar una hora' }).getAttribute('href')).toBe('#agenda');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar servicios' }), { target: { value: 'psicologia' } });
  expect(screen.queryByRole('heading', { name: 'Nutrición' })).toBeNull();
  expect(screen.getByText('Apoyo emocional')).toBeTruthy();
  expect(screen.getByText('$35.000')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Reservar Psicología' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Psicología' }));
  expect(dialog.queryByRole('group', { name: 'Elige una fecha y hora' })).toBeNull();
  expect(dialog.getByRole('option', { name: 'Camila Rojas' })).toBeTruthy();
  fireEvent.change(dialog.getByRole('combobox', { name: 'Profesional' }), { target: { value: 'matias' } });

  const calendar = within(await dialog.findByRole('group', { name: 'Elige una fecha y hora' }));
  const [firstDay, nextDay] = calendar.getAllByRole('button', { name: /, con horas disponibles$/ });
  fireEvent.click(firstDay);
  fireEvent.click(calendar.getByRole('button', { name: /^\d\d:\d\d$/ }));
  fireEvent.change(dialog.getByLabelText('Nombre completo'), { target: { value: 'Paciente Demo' } });
  fireEvent.change(dialog.getByLabelText('Correo electrónico'), { target: { value: 'paciente@example.com' } });
  expect(dialog.getByText('+56')).toBeTruthy();
  const phone = dialog.getByRole<HTMLInputElement>('textbox', { name: 'Teléfono' });
  fireEvent.change(phone, { target: { value: '9555012' } });
  expect(phone.checkValidity()).toBe(false);
  fireEvent.change(phone, { target: { value: '95550123' } });
  expect(phone.checkValidity()).toBe(true);

  fireEvent.click(nextDay);
  expect(dialog.getByRole('group', { name: 'Tus datos' })).toBeTruthy();
  expect(phone.value).toBe('95550123');
  expect(phone.matches(':disabled')).toBe(false);
  const confirm = dialog.getByRole<HTMLButtonElement>('button', { name: 'Confirmar reserva' });
  expect(confirm.disabled).toBe(true);
  fireEvent.click(calendar.getByRole('button', { name: /^\d\d:\d\d$/ }));
  expect(confirm.disabled).toBe(false);

  fireEvent.change(dialog.getByRole('combobox', { name: 'Profesional' }), { target: { value: 'camila' } });
  expect(dialog.queryByRole('button', { name: 'Confirmar reserva' })).toBeNull();
  const updatedCalendar = within(await dialog.findByRole('group', { name: 'Elige una fecha y hora' }));
  fireEvent.click(updatedCalendar.getAllByRole('button', { name: /, con horas disponibles$/ })[0]);
  fireEvent.click(updatedCalendar.getByRole('button', { name: /^\d\d:\d\d$/ }));
  expect((dialog.getByLabelText<HTMLInputElement>('Nombre completo')).value).toBe('Paciente Demo');
  expect((dialog.getByLabelText<HTMLInputElement>('Correo electrónico')).value).toBe('paciente@example.com');
  expect(dialog.getByRole<HTMLInputElement>('textbox', { name: 'Teléfono' }).value).toBe('95550123');
  fireEvent.click(dialog.getByRole('button', { name: 'Confirmar reserva' }));

  const confirmation = await screen.findByRole('heading', { name: '¡Reserva confirmada!' });
  expect(document.activeElement).toBe(confirmation);
  const booking = request.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(booking?.[0]).toContain('/public/centers/arrayan/bookings');
  expect(JSON.parse(booking?.[1].body)).toEqual({
    professional: 'camila', service: 'psychology', start: startsAt,
    name: 'Paciente Demo', email: 'paciente@example.com', phone: '+5695550123',
  });
});

it('shows the full center catalog for a professional and loads a service calendar', async () => {
  await openCenter();
  fireEvent.click(screen.getByRole('tab', { name: 'Por profesional' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar profesionales' }), { target: { value: 'matias' } });
  expect(screen.queryByRole('heading', { name: 'Camila Rojas' })).toBeNull();
  expect(screen.getByText('Trabaja con familias')).toBeTruthy();
  const services = within(screen.getByRole('list', { name: 'Servicios de Matías Soto' }));
  expect(services.getByText('Nutrición')).toBeTruthy();
  expect(services.getByText('Psicología')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Reservar con Matías Soto' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Matías Soto' }));
  expect(dialog.queryByRole('group', { name: 'Elige una fecha y hora' })).toBeNull();
  expect(dialog.getByRole('option', { name: /Psicología/ })).toBeTruthy();
  fireEvent.change(dialog.getByRole('combobox', { name: 'Servicio' }), { target: { value: 'nutrition' } });

  expect(await dialog.findByRole('group', { name: 'Elige una fecha y hora' })).toBeTruthy();
  expect(request.mock.calls.some(([url]) => url.includes('/availability?service=nutrition&professional=matias'))).toBe(true);
  fireEvent.click(dialog.getByRole('button', { name: 'Cerrar' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
