const CACHE_NAME = "madrasa-shell-v5";
const OFFLINE_URL = "/offline.html";
const SHELL_ASSETS = [OFFLINE_URL, "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
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
    // Network-first: pages are gated behind login and render per-session content, so a
    // stale cached shell (e.g. from before a user was signed out, or from an older
    // deploy) must never be painted first. Only fall back to the last-cached shell (or
    // the offline page) when the network is actually unavailable.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          return cached || cache.match(OFFLINE_URL);
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
