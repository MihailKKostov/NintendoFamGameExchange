/*
 * Keeps the app's own files on the device so reopening it doesn't wait for
 * GitHub Pages (which asks browsers to re-check every file after 10 minutes).
 *
 * - The page itself: served from the device straight away, then refreshed in
 *   the background, so a new release shows up the next time the app opens.
 * - /assets/* (file names change with every release): kept on the device.
 * - Anything else (Firebase, Nintendo images…) is left to the browser.
 */
const CACHE = 'fge-app-v1';
const SCOPE = self.registration.scope; // e.g. https://user.github.io/Repo/
const PAGE = SCOPE; // index.html
const ASSETS = SCOPE + 'assets/';

const assetsIn = (html) =>
  [...html.matchAll(/(?:href|src)="([^"]*\/assets\/[^"]+)"/g)].map((m) => new URL(m[1], SCOPE).href);

/** Fetch the latest page, store it with the files it needs, drop old files. */
async function refreshPage() {
  const res = await fetch(PAGE, { cache: 'no-cache' });
  if (!res.ok) return null;
  const html = await res.clone().text();
  const cache = await caches.open(CACHE);
  const previous = await cache.match(PAGE, { ignoreVary: true });
  const previousHtml = previous ? await previous.text() : '';
  if (html !== previousHtml) {
    const wanted = assetsIn(html);
    const saved = await Promise.all(
      wanted.map(async (url) => {
        if (await cache.match(url, { ignoreVary: true })) return true;
        const r = await fetch(url);
        if (r.ok) await cache.put(url, r);
        return r.ok;
      }),
    );
    // Only switch to the new page once every file it needs is on the device.
    if (saved.includes(false)) return null;
    // Keep this release's files and the previous release's (a page that is
    // already open may still need them); everything else can go.
    const keep = new Set([...wanted, ...assetsIn(previousHtml)]);
    for (const req of await cache.keys()) {
      if (req.url.startsWith(ASSETS) && !keep.has(req.url)) await cache.delete(req);
    }
  }
  await cache.put(PAGE, res);
  return html !== previousHtml && previousHtml ? 'updated' : 'same';
}

self.addEventListener('install', (event) => {
  event.waitUntil(refreshPage().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('fge-app-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(PAGE, { ignoreVary: true });
        const fresh = refreshPage().catch(() => null);
        if (cached) {
          event.waitUntil(fresh);
          return cached;
        }
        await fresh;
        return (await caches.match(PAGE, { ignoreVary: true })) ?? fetch(req);
      })(),
    );
    return;
  }

  if (req.url.startsWith(ASSETS)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req.url, { ignoreVary: true });
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(req.url, copy)));
        }
        return res;
      })(),
    );
  }
});
