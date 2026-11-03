// Hydor service worker: shows a pushed notification (a session finished, failed or needs
// you) when no page of the app is in view, and opens that session when the notification is tapped.
// A session waiting on a plain yes or no gets Approve and Deny buttons, answered from here.
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
      const a = n.kind === 'waiting' && n.approval && n.approval.approve && n.approval.deny ? n.approval : null;
      await self.registration.showNotification(n.title || 'Hydor', {
        body: n.body || '',
        tag: n.key || 'hydor',
        renotify: true,
        icon: '/icon-192.png?v=4',
        actions: a ? [{ action: 'approve', title: a.approve.label }, { action: 'deny', title: a.deny.label }] : [],
        data: { url: n.url || '/', api: n.api || '', key: n.key || '', approval: a },
      });
    })(),
  );
});

/** Opens the app at `url`, in a window of it that is open already when there is one. */
async function open(url) {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const page = pages[0];
  if (page) {
    await page.focus();
    page.postMessage({ type: 'wa-open', url });
  } else await self.clients.openWindow(url);
}

/** Answers the approval with the choice under the button; false when that did not work (signed out, already answered). */
async function answer(d, choice) {
  try {
    const r = await fetch(`${d.api}/api/sessions/${encodeURIComponent(d.key)}/approvals/${encodeURIComponent(d.approval.id)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: choice.id }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const url = d.url || '/';
  const a = d.approval;
  const choice = a && (e.action === 'approve' ? a.approve : e.action === 'deny' ? a.deny : null);
  e.waitUntil(
    (async () => {
      if (!choice) return open(url);
      // Answered here; when it cannot be, the session opens to answer it there.
      if (!(await answer(d, choice))) return open(url);
      await self.registration.showNotification(e.notification.title, { body: `${choice.label}: ${a.title}`, tag: d.key || 'hydor', icon: '/icon-192.png?v=4', silent: true, data: { url } });
    })(),
  );
});
