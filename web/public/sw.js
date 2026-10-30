// Agent Console service worker: shows a pushed notification (a session finished, failed or needs
// you) when no page of the app is in view, and opens that session when the notification is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let n = {};
  try {
    n = e.data ? e.data.json() : {};
  } catch {}
  e.waitUntil(
    (async () => {
      const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // A page in view shows its own toast.
      if (pages.some((p) => p.visibilityState === 'visible')) return;
      await self.registration.showNotification(n.title || 'Agent Console', {
        body: n.body || '',
        tag: n.key || 'agent-console',
        renotify: true,
        icon: '/icon-192.png?v=3',
        data: { url: n.url || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    (async () => {
      const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const page = pages[0];
      if (page) {
        await page.focus();
        page.postMessage({ type: 'wa-open', url });
      } else await self.clients.openWindow(url);
    })(),
  );
});
