// MyDesk Service Worker v3 - バックグラウンドプッシュ通知対応
const APP_URL = '/';

// インストール時: 即座にアクティブ化
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// アクティベート時: 既存クライアントを即時制御
self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// ── プッシュ通知受信（バックグラウンド・フォアグラウンド両対応）──────────
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let data = {};
  try { data = e.data.json(); }
  catch { data = { title: 'MyDesk', body: e.data.text() }; }

  const title = data.title || 'MyDesk';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'mydesk-notif',
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
    data: { url: data.url || APP_URL },
    actions: [
      { action: 'open', title: '開く' }
    ],
  };

  e.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── 通知クリック ───────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || APP_URL;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既にMyDeskが開いていればフォーカス
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // 開いていなければ新しいウィンドウで開く
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── 購読更新（ブラウザが自動で呼ぶ）────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (e) => {
  console.log('[SW] Push subscription changed - re-subscribing');
  // 購読が期限切れになった時の自動再購読
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then(sub => {
        // 再購読情報をアプリに送信
        return self.clients.matchAll().then(clients => {
          clients.forEach(c => c.postMessage({ type: 'PUSH_RESUBSCRIBED', subscription: sub.toJSON() }));
        });
      }).catch(err => console.warn('[SW] Re-subscribe failed:', err))
  );
});
