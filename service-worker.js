---
---
// Cache-first service worker. Freshness is handled separately by main.js's version.json
// check + update banner, not by racing the network here -- this file just needs to make
// the app (100% static data) work offline after one successful visit.
const BUILD_REVISION = "{{ site.github.build_revision | default: 'dev' }}";
const CACHE_PREFIX = 'cubadvscope-';
const CACHE_NAME = CACHE_PREFIX + BUILD_REVISION;

const CORE_ASSETS = [
    './',
    'index.html',
    `main.js?v=${BUILD_REVISION}`,
    `styles.css?v=${BUILD_REVISION}`,
    'manifest.json',
    'version.json',
    'graphics/icon-192.png',
    'graphics/icon-512.png',
    'graphics/apple-touch-icon.png'
];

const DATA_ASSETS = [
    'data/adventure.yml',
    'data/ranks/lion.yml',
    'data/ranks/tiger.yml',
    'data/ranks/wolf.yml',
    'data/ranks/bear.yml',
    'data/ranks/webelos.yml',
    'data/ranks/aol.yml'
].map(url => `${url}?v=${BUILD_REVISION}`);

const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css',
    'https://cdn.jsdelivr.net/npm/ractive@1.4.4/ractive.min.js',
    'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            // Core shell: hard requirement -- fail install if these don't cache cleanly.
            await cache.addAll(CORE_ASSETS);
        } catch (err) {
            // Install is about to fail (the old SW/cache stays in control) -- tell any open
            // pages so they can show something instead of silently doing nothing forever.
            const clients = await self.clients.matchAll();
            clients.forEach(client => client.postMessage({ type: 'SW_INSTALL_FAILED', error: String(err) }));
            throw err;
        }
        // Data + CDN: soft -- one flaky fetch shouldn't sink the whole install.
        await Promise.allSettled(
            DATA_ASSETS.map(url => fetch(url).then(res => res.ok && cache.put(url, res)))
        );
        await Promise.allSettled(
            CDN_ASSETS.map(url => fetch(url, { mode: 'cors' }).then(res => cache.put(url, res)))
        );
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                .map(key => caches.delete(key))
        );
        await self.clients.claim();
    })());
});

function isPinnedCdn(url) {
    return url.hostname === 'cdn.jsdelivr.net';
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const fresh = await fetch(request, { mode: request.mode === 'navigate' ? undefined : 'cors' });
    if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(request, fresh.clone());
    return fresh;
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // version.json must always come from the network -- it's the freshness ground truth.
    if (url.origin === self.location.origin && url.pathname.endsWith('/version.json')) return;

    if (url.origin === self.location.origin || isPinnedCdn(url)) {
        event.respondWith(cacheFirst(request));
    }
    // Anything else (e.g. the QR code image from api.qrserver.com) passes through untouched.
});
