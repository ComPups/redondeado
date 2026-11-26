// Session-only cache: never persist patient data or authorization headers to disk.
type Entry = { expires: number; response: Promise<Response> };
const entries = new Map<string, Entry>();
const MAX_ENTRIES = 100;

export function clearRequestCache() {
  entries.clear();
}

function lifetime(url: string) {
  const path = new URL(url, "http://localhost").pathname.replace(
    /^\/api(?=\/)/,
    "",
  );
  if (/^\/public\/centers\/[^/]+$/.test(path)) return 5 * 60_000;
  if (
    /^\/staff\/centers\/[^/]+\/(service-catalog|services|booking-options)$/.test(
      path,
    )
  )
    return 60_000;
  if (/^\/staff\/centers\/[^/]+\/appointments$/.test(path)) return 15_000;
  // Access checks, availability, and terms always go to the server.
  return 0;
}

function withSignal(
  response: Promise<Response>,
  signal?: AbortSignal | null,
): Promise<Response> {
  if (!signal) return response.then((value) => value.clone());
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("The request was aborted.", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    response
      .then((value) => {
        if (!signal.aborted) resolve(value.clone());
      }, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    clearRequestCache();
    try {
      return await fetch(url, options);
    } finally {
      clearRequestCache();
    }
  }
  const ttl = lifetime(url);
  if (!ttl || options.cache === "no-store" || options.cache === "reload")
    return fetch(url, options);
  if (options.signal?.aborted)
    throw new DOMException("The request was aborted.", "AbortError");
  // URL includes center, scope, period, and page; headers isolate each staff session.
  const key = JSON.stringify([
    url,
    [...new Headers(options.headers).entries()].sort(),
    options.credentials,
  ]);
  const now = Date.now();
  for (const [key, entry] of entries)
    if (entry.expires <= now) entries.delete(key);
  let entry = entries.get(key);
  if (!entry) {
    if (entries.size >= MAX_ENTRIES)
      entries.delete(entries.keys().next().value!);
    const created: Entry = {
      expires: Infinity,
      response: Promise.resolve(new Response()),
    };
    // A consumer unmounting must not abort another consumer's shared request.
    created.response = fetch(url, { ...options, signal: undefined })
      .then(async (response) => {
        if (!response.ok) {
          if (entries.get(key) === created) entries.delete(key);
          return response;
        }
        const data = await response.json();
        created.expires = Date.now() + ttl;
        return new Response(JSON.stringify(data), {
          status: response.status || 200,
          headers: { "Content-Type": "application/json" },
        });
      })
      .catch((error) => {
        if (entries.get(key) === created) entries.delete(key);
        throw error;
      });
    entry = created;
    entries.set(key, created);
  }
  return withSignal(entry.response, options.signal);
}
