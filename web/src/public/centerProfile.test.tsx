// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCenterProfile } from './centerProfile';
function Profile({ slug = 'navigation-test' }: { slug?: string }) {
  const result = useCenterProfile(slug);
  return <p>{result.status === 'ready' ? result.profile.name : result.status}</p>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('reuses the profile when navigating between pages', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ name: 'Cached center', services: [], professionals: [] })));
  vi.stubGlobal('fetch', fetcher);
  const first = render(<Profile />);
  await screen.findByText('Cached center');
  first.unmount();
  render(<Profile />);
  await screen.findByText('Cached center');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not request an unselected center', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  render(<Profile slug="" />);
  expect(fetcher).not.toHaveBeenCalled();
});

it('does not display the previous center while a different slug loads', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ name: 'First center', services: [], professionals: [] })));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<Profile slug="first" />);
  await screen.findByText('First center');
  fetcher.mockImplementation(() => new Promise(() => {}));
  view.rerender(<Profile slug="second" />);
  expect(screen.queryByText('First center')).toBeNull();
  expect(screen.getByText('loading')).toBeTruthy();
});
