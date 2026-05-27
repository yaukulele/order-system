// Order system service worker.
// HTML / root: stale-while-revalidate — 開頁立刻給 cache（秒開），背景抓最新版，
//   有差異就 postMessage 通知頁面跳「有新版本」toast。兼顧「開頁快」+「拿得到最新」。
// 其他 shell asset: stale-while-revalidate
// Bumps cache version on every release; old caches cleaned up on activate.
const CACHE = "order-system-v194";
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
  if (req.method !== "GET") return;

  // Firebase SDK from gstatic CDN — 版本化 URL，cache-first 安全永遠用 cache
  // 省每次開頁 3 個 ~300KB 的網路請求（雖然瀏覽器本身有 HTTP cache，SW cache 比較可靠）
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
          return res;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.search) return;

  if (isHTMLRequest(req, url)) {
    // Stale-while-revalidate for HTML — 立刻回 cache（秒開），背景抓最新比對
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = (await cache.match(req)) || (await cache.match("./index.html"));
        // 比對用 clone — return cached 會消耗 body，背景再讀就失敗。先 clone 留著比對。
        const cachedForCompare = cached ? cached.clone() : null;
        const networkUpdate = fetch(req)
          .then(async (res) => {
            if (res && res.status === 200) {
              let changed = false;
              if (cachedForCompare) {
                try {
                  const [newText, oldText] = await Promise.all([res.clone().text(), cachedForCompare.text()]);
                  changed = newText !== oldText;
                } catch (_) {}
              }
              // 先把新版寫進 cache — 確保用戶點「立即更新」reload 時拿到的是新版
              await cache.put(req, res.clone()).catch(() => {});
              // cache 已更新才通知頁面 → 用戶點 reload 不會再拿到舊的
              if (changed) {
                const cs = await self.clients.matchAll();
                cs.forEach((c) => c.postMessage({ type: "new-version" }));
              }
            }
            return res;
          })
          .catch(() => cached && cached.clone());
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
