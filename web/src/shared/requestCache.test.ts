import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch, clearRequestCache } from './requestCache';
const profile = 'https://api.example/public/centers/arrayan';
const catalog = 'https://api.example/staff/centers/arrayan/service-catalog';
const json = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('caches proxied public and staff reads while leaving access checks uncached', async () => {
  clearRequestCache();
  const fetcher = vi.fn(async () => json([])); vi.stubGlobal('fetch', fetcher);
  for (const url of ['/api/public/centers/arrayan', '/api/staff/centers/arrayan/appointments', '/api/staff/me']) {
    await apiFetch(url); await apiFetch(url);
  }
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('shares in-flight requests and lets each consumer read its own response', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const first = apiFetch(profile); const second = apiFetch(profile);
  finish(json({ name: 'Arrayán' }));
  expect(await (await first).json()).toEqual(await (await second).json());
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not cancel a shared request when one consumer unmounts', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const first = apiFetch(profile, { signal: controller.signal });
  const second = apiFetch(profile);
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  finish(json({ name: 'Arrayán' }));
  expect(await (await second).json()).toEqual({ name: 'Arrayán' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('expires public profiles after five minutes and staff catalogs after one minute', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => json([])); vi.stubGlobal('fetch', fetcher);
  await apiFetch(profile); await apiFetch(catalog);
  vi.advanceTimersByTime(60_001);
  await apiFetch(profile); await apiFetch(catalog);
  expect(fetcher).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(240_000);
  await apiFetch(profile);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('isolates staff users, centers, and appointment scopes', async () => {
  const fetcher = vi.fn(async () => json([])); vi.stubGlobal('fetch', fetcher);
  const appointments = catalog.replace('service-catalog', 'appointments');
  await apiFetch(catalog, { headers: { Authorization: 'Bearer first' } });
  await apiFetch(catalog, { headers: { Authorization: 'Bearer second' } });
  await apiFetch(catalog.replace('arrayan', 'other'));
  await apiFetch(`${appointments}?scope=center`);
  await apiFetch(`${appointments}?scope=personal`);
  expect(fetcher).toHaveBeenCalledTimes(5);
});

it('never caches errors, availability, terms, or access checks', async () => {
  const fetcher = vi.fn(async () => new Response('{}', { status: 404 })); vi.stubGlobal('fetch', fetcher);
  await apiFetch(profile); await apiFetch(profile);
  fetcher.mockImplementation(async () => json([]));
  for (const url of [`${profile}/availability`, `${profile}/terms`, 'https://api.example/staff/me']) {
    await apiFetch(url); await apiFetch(url);
  }
  expect(fetcher).toHaveBeenCalledTimes(8);
});

it('invalidates after a mutation and rejects stale in-flight cache entries', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method) return json({ saved: true });
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  vi.stubGlobal('fetch', fetcher);
  const old = apiFetch(profile);
  const oldFinish = finish;
  await apiFetch(catalog, { method: 'PATCH' });
  oldFinish(json({ name: 'Old' })); await old;
  const fresh = apiFetch(profile); finish(json({ name: 'New' }));
  expect(await (await fresh).json()).toEqual({ name: 'New' });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('supports forced refresh and clearing the session cache', async () => {
  const fetcher = vi.fn(async () => json([])); vi.stubGlobal('fetch', fetcher);
  await apiFetch(profile); await apiFetch(profile, { cache: 'no-store' });
  clearRequestCache(); await apiFetch(profile);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
