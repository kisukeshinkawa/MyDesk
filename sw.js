// MyDesk Service Worker v2 - Push Notifications
// iOSおよびPC(Chrome/Edge)対応

const CACHE_NAME = 'mydesk-v2';
const APP_URL = '/';

// インストール時: 即座にアクティブ化
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// アクティベート時: 既存クライアントを即時制御
self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// ── プッシュ通知受信 ───────────────────────────────────────────────────────
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
    // iOS Safari対応: actions は iOS 16.4以上で対応
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

// ── プッシュ通知のキャンセル ───────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (e) => {
  // 購読が更新された場合の処理（ブラウザが自動で呼ぶ）
  console.log('[SW] Push subscription changed');
});
