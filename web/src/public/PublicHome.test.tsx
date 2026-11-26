// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { PublicHome } from './PublicHome';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function showHome(response: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => response }));
  render(<MemoryRouter><PublicHome /></MemoryRouter>);
}

it('shows real centers in groups of three and links to each profile', async () => {
  showHome(['Uno', 'Dos', 'Tres', 'Cuatro'].map((name, index) => ({ name, slug: `centro-${index}`, description: `Descripción ${name}`, image_url: null })));
  expect(await screen.findByRole('heading', { name: 'Uno' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ver centro Uno' }).getAttribute('href')).toBe('/centro-0');
  expect(screen.getByText('Descripción Uno')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Cuatro' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
  expect(screen.getByRole('heading', { name: 'Cuatro' })).toBeTruthy();
  expect(screen.getByText('Página 2 de 2')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Anterior/ }));
  expect(screen.getByRole('heading', { name: 'Uno' })).toBeTruthy();
});

it('explains when no centers are available', async () => {
  showHome([]);
  expect(await screen.findByText('Aún no hay centros disponibles.')).toBeTruthy();
});

it('distinguishes a loading error from an empty catalog', async () => {
  showHome(null, false);
  expect(await screen.findByText(/No pudimos cargar los centros/)).toBeTruthy();
  expect(within(screen.getByRole('status')).queryByText('Aún no hay centros disponibles.')).toBeNull();
});
