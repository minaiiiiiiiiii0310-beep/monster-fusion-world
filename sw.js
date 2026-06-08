/* =========================================================================
 *  sw.js  —  Service Worker (オフライン対応キャッシュ)
 *  Stale-While-Revalidate 戦略：素早く表示しつつ、裏で最新を取得して
 *  次回起動に反映。バージョン更新時は古いキャッシュを破棄。
 * =======================================================================*/
const CACHE_VERSION = 'mfw-v4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './css/style.css',
  './js/vendor/three.min.js',
  './js/audio.js',
  './js/art.js',
  './js/data.js',
  './js/state.js',
  './js/story.js',
  './js/battle.js',
  './js/scene3d.js',
  './js/world.js',
  './js/arena.js',
  './js/online.js',
  './js/firebase-config.js',
  './js/ui.js',
  './js/main.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // 失敗するアセットがあっても続行
      Promise.all(STATIC_ASSETS.map((url) =>
        cache.add(url).catch((err) => console.warn('SW cache miss:', url, err))
      ))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // 同一オリジンのみキャッシュ対象（Firebase等の外部APIはネット経由）
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        // 成功したらキャッシュ更新
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);   // オフライン: キャッシュにフォールバック
      // 即座にキャッシュを返し、裏で更新
      return cached || network;
    })
  );
});
