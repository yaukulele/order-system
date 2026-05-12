// Order system service worker.
// HTML / root: network-first (fall back to cache offline) — user 第一次 reload 就拿到最新版
// 其他 shell asset: stale-while-revalidate
// Bumps cache version on every release; old caches cleaned up on activate.
const CACHE = "order-system-v129";
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
    // Network-first for HTML — user reload 立刻看到最新版；斷線才 fallback cache
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
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
