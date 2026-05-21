// Order system service worker.
// HTML / root: stale-while-revalidate — 開頁立刻給 cache（秒開），背景抓最新版，
//   有差異就 postMessage 通知頁面跳「有新版本」toast。兼顧「開頁快」+「拿得到最新」。
// 其他 shell asset: stale-while-revalidate
// Bumps cache version on every release; old caches cleaned up on activate.
const CACHE = "order-system-v161";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // 用 cache:'reload' 強制 install 時拿最新版 SHELL，避免被 browser HTTP cache 攔到舊資源
      Promise.all(SHELL.map((url) => c.add(new Request(url, { cache: "reload" })).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isHTMLRequest(req, url) {
  if (req.mode === "navigate") return true;
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/html")) return true;
  if (url.pathname === "/" || url.pathname.endsWith("/")) return true;
  if (url.pathname.endsWith(".html")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.search) return;

  if (isHTMLRequest(req, url)) {
    // Stale-while-revalidate for HTML — 立刻回 cache（秒開），背景抓最新比對
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = (await cache.match(req)) || (await cache.match("./index.html"));
        const networkUpdate = fetch(req)
          .then(async (res) => {
            if (res && res.status === 200) {
              const fresh = res.clone();
              // 跟舊 cache 比對 → 不同就通知頁面有新版
              if (cached) {
                try {
                  const [newText, oldText] = await Promise.all([res.clone().text(), cached.clone().text()]);
                  if (newText !== oldText) {
                    const cs = await self.clients.matchAll();
                    cs.forEach((c) => c.postMessage({ type: "new-version" }));
                  }
                } catch (_) {}
              }
              await cache.put(req, fresh).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        // 背景更新不阻塞回應，但 waitUntil 保 SW 活到 cache.put 完成
        event.waitUntil(networkUpdate.catch(() => {}));
        return cached || networkUpdate;
      })
    );
    return;
  }

  // Stale-while-revalidate for other shell assets
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const networkPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || networkPromise;
    })
  );
});
