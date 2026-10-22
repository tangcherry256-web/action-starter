/* ============================================================
   下班後行動啟動器 · Service Worker
   ------------------------------------------------------------
   數據安全承諾（重要）：
   本 SW 只管理 HTTP 快取（Cache Storage），
   絕不讀寫、絕不清除 IndexedDB / localStorage。
   使用者所有歷史資料存在 IndexedDB（ActionStarterDB），
   版本更新只會替換快取裡的網頁檔案，重新載入後資料原樣呈現。
   ============================================================ */
var CACHE = 'action-starter-v1';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

/* 安裝：離線時所需的應用外殼入快取（不自動跳過等待，由使用者確認更新） */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
    }).catch(function () { /* 單檔失敗不阻斷安裝 */ })
  );
});

/* 啟用：只清理舊版本的 HTTP 快取；IndexedDB 不在管轄範圍 */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 請求策略 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // 只處理同源資源

  if (req.mode === 'navigate') {
    /* 頁面導航：網路優先（保證拿到最新版），離線回退快取 */
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
      })
    );
    return;
  }

  /* 靜態資源：快取優先 + 背景更新（stale-while-revalidate） */
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});

/* 使用者於頁面點擊「更新」後，才讓新版本接管 */
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
