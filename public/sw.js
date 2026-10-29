const CACHE_NAME = "madrasa-shell-v7";
const OFFLINE_URL = "/offline.html";
const SHELL_ASSETS = [OFFLINE_URL, "/favicon.svg"];

const emergencyOfflinePage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f2f4f5"><title>Madrasa is offline</title>
<style>:root{color:#26323a;background:#f2f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;box-sizing:border-box}main{width:min(360px,100%);box-sizing:border-box;border:1px solid #dfe5e7;border-radius:20px;background:#fff;padding:28px}h1{margin:0 0 10px;font-size:24px}p{margin:0 0 22px;color:#657078;line-height:1.5}button{width:100%;border:0;border-radius:12px;background:#176b57;color:#fff;padding:13px 18px;font:inherit;font-weight:700}</style>
</head><body><main><h1>You are offline</h1><p>Check your connection, then try again.</p><button onclick="location.reload()">Try again</button></main>
<script>addEventListener("online",()=>location.reload())</script></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // A secondary icon failing to download must not prevent the offline page
      // or the new service worker from being installed.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.includes("stripe")) {
    return;
  }

  if (request.mode === "navigate") {
    // Authenticated HTML must never be written to Cache Storage. Replaying an old
    // document can expose stale profile or role information after an app reinstall.
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) || new Response(emergencyOfflinePage, {
          status: 503,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/favicon.svg") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || "Madrasa", {
      body: data.body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: {
        url: data.url || "/",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(targetUrl));
});
