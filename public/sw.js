const CACHE = 'convo-shell-v14';
const SHELL = ['/', '/manifest.webmanifest', '/escudo-ud-oliva.jpg'];
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('convo-shell-') && key !== CACHE).map((key) => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => { const copy=response.clone(); caches.open(CACHE).then((cache)=>cache.put('/',copy)); return response; }).catch(()=>caches.match('/')));
    return;
  }
  if (url.pathname.endsWith('.html')) {
    event.respondWith(fetch(event.request).then((response) => { if(response.ok) caches.open(CACHE).then((cache)=>cache.put(event.request,response.clone())); return response; }).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if(response.ok && url.origin===location.origin) caches.open(CACHE).then((cache)=>cache.put(event.request,response.clone())); return response; })));
});

async function currentPushBinding() {
  const response = await (await caches.open('convo-push-binding-v1')).match('/__convo_push_binding');
  return response ? response.json() : null;
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json() } catch { return }
    const binding = await currentPushBinding();
    if (!binding || payload?.accountId !== binding.accountId || payload?.bindingId !== binding.bindingId) return;
    // Re-check the server session when online: expired/deactivated/changed accounts get no details.
    try {
      const response = await fetch('/api/push', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || (await response.json()).accountId !== binding.accountId) return;
    } catch { /* An offline device may use its explicit, persisted binding. */ }
    const current = await currentPushBinding();
    if (current?.bindingId !== binding.bindingId) return;
    await self.registration.showNotification(payload.title, {
      body: payload.body, icon: '/escudo-ud-oliva.jpg', tag: payload.tag,
      data: { url: payload.url, accountId: binding.accountId, bindingId: binding.bindingId },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const binding = await currentPushBinding();
    const data = event.notification.data;
    if (!binding || data?.accountId !== binding.accountId || data?.bindingId !== binding.bindingId) return;
    const url = new URL(data.url || '/', self.location.origin);
    if (url.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((item) => new URL(item.url).origin === self.location.origin);
    if (client) { await client.navigate(url.href); await client.focus() }
    else await self.clients.openWindow(url.href);
  })());
});
