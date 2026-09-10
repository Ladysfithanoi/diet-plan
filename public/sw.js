// Service worker tối giản: đủ để trình duyệt coi web là app cài được,
// và giữ tài nguyên tĩnh cho lần mở sau nhanh hơn.
// Cố ý KHÔNG cache HTML/API vì đó là dữ liệu riêng của từng người dùng.

const CACHE = "diet-plan-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const STATIC_RE = /\.(?:png|svg|ico|webp|jpg|jpeg|woff2?)$/;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Mất mạng khi đang mở app → hiện một trang báo tử tế thay vì lỗi trắng của trình duyệt
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            `<!doctype html><html lang="vi"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mất kết nối</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f6f2ea;color:#14110e;font-family:system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:rgba(20,17,14,.55);margin:0}</style>
<div><h1>Đang mất kết nối mạng</h1><p>Bật lại mạng rồi mở lại Diet Plan nhé.</p></div>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
          )
      )
    );
    return;
  }

  const isStatic = url.pathname.startsWith("/_next/static/") || STATIC_RE.test(url.pathname);
  if (!isStatic) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })()
  );
});
