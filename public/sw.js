// public/sw.js - MyDesk Service Worker (PWA強化版)
const CACHE_NAME = 'mydesk-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// Install: キャッシュに静的アセットを保存
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate: 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: ネットワーク優先、失敗時はキャッシュから
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase / API calls はキャッシュしない
  if (url.hostname.includes('supabase') ||
      url.pathname.startsWith('/api/') ||
      url.pathname.includes('anthropic')) {
    return;
  }

  // ナビゲーション (HTML): キャッシュ優先でオフライン対応
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then(r => r || fetch(event.request))
      )
    );
    return;
  }

  // 静的アセット: キャッシュ優先
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// Push通知受信
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'mydesk-notif',
    data: { url: data.url || '/' },
    requireInteraction: false,
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'MyDesk', options)
  );
});

// 通知クリック時
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
