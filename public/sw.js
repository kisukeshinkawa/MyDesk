// MyDesk Service Worker v5
const APP_URL = '/';

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });

self.addEventListener('push', (e) => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'MyDesk', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'MyDesk', {
      body: data.body || '',
      tag: data.tag || 'mydesk',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || APP_URL },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || APP_URL;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          c.navigate(url); return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// pushsubscriptionchange: oldSubscriptionがnullの場合を考慮
self.addEventListener('pushsubscriptionchange', (e) => {
  if (!e.oldSubscription) return; // nullの場合は何もしない
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then(sub => self.clients.matchAll().then(cs =>
        cs.forEach(c => c.postMessage({ type: 'PUSH_RESUBSCRIBED', subscription: sub.toJSON() }))
      )).catch(err => console.warn('[SW] Re-subscribe failed:', err))
  );
});
