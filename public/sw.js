// MyDesk Service Worker（修正版）
// 主な修正:
//  - chrome-extension:// スキームをキャッシュしない
//  - SpeechRecognition / WebSocket / 音声ストリームの通信を邪魔しない
//  - GET 以外のメソッドはキャッシュしない
//  - Cross-origin（Google APIs等）はキャッシュしない

const CACHE_NAME = 'mydesk-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── キャッシュ可否判定（重要：SpeechRecognition等を邪魔しない）──
function isCacheable(request) {
  // GET 以外は対象外
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  // http(s) 以外は無視（chrome-extension://, data:, blob:, ws:, wss: 等）
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // 自分のオリジンのみ
  if (url.origin !== self.location.origin) return false;
  // /api/ 配下は動的なのでキャッシュしない
  if (url.pathname.startsWith('/api/')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // キャッシュ対象外のリクエストには respondWith せず、ブラウザ標準のネットワーク経路に任せる
  // → SpeechRecognition の WebSocket / fetch も影響を受けない
  if (!isCacheable(req)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // キャッシュがあれば即返却し、裏で更新（stale-while-revalidate）
        fetch(req).then((res) => {
          if (res && res.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, res.clone()).catch(() => {});
            });
          }
        }).catch(() => {});
        return cached;
      }
      // キャッシュなし → ネットワーク取得 + キャッシュに保存
      return fetch(req).then((res) => {
        if (res && res.ok) {
          // res は一度しか consume できないため clone してキャッシュ
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, clone).catch(() => {});
          });
        }
        return res;
      }).catch(() => cached || Response.error());
    })
  );
});

// ── Web Push 受信 ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const title = payload.title || 'MyDesk';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'mydesk',
    renotify: true,
    data: payload.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ('focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
