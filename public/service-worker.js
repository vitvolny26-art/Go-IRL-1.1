/* global self, caches, fetch, URL, Response */

const offlineCache = "go-irl-offline-v5";
const offlineUrl = "/offline.html";
const appShellUrls = ["/", "/activities", "/services", "/beauty", offlineUrl];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(offlineCache).then((cache) => cache.addAll(appShellUrls)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("go-irl-offline-") && key !== offlineCache).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(offlineCache).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => (await caches.match(event.request))
          || (event.request.url.includes("/beauty") ? caches.match("/beauty") : undefined)
          || caches.match(offlineUrl)),
    );
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.startsWith("/services/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && contentType.startsWith("image/")) {
            const copy = response.clone();
            void caches.open(offlineCache).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      void caches.open(offlineCache).then((cache) => cache.put(event.request, copy));
      return response;
    })),
  );
});
