/* Omnidance - service worker: Web Push + cache mínimo para puerta offline.
 *
 * Push (web-push.sender.ts): { type, title, body, data }; `data.url`
 * decide la navegación al click (fallback /notificaciones).
 *
 * Cache (spec staff-offline-checkin):
 * - _next/static/* (JS/CSS con hash) → cache-first, sin límite de edad
 *   (el hash versiona el contenido).
 * - Documentos /staff/* → network-first con fallback a cache (la página
 *   de puerta debe abrir aunque el venue no tenga señal).
 * - Todo lo demás (incluido /api/*) → pasa directo a la red: el manifiesto
 *   y la cola viven en IndexedDB, no en el cache del SW.
 */

const STATIC_CACHE = "omnidance-static-v1";
const PAGES_CACHE = "omnidance-pages-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purga caches de versiones anteriores del SW.
      const keep = new Set([STATIC_CACHE, PAGES_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Assets inmutables de Next → cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) void cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Documentos de puerta → network-first con cache de respaldo.
  if (request.mode === "navigate" && url.pathname.startsWith("/staff")) {
    event.respondWith(
      caches.open(PAGES_CACHE).then(async (cache) => {
        try {
          const res = await fetch(request);
          if (res.ok) void cache.put(request, res.clone());
          return res;
        } catch {
          const hit = await cache.match(request);
          if (hit) return hit;
          throw new Error("offline");
        }
      }),
    );
    return;
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title =
    typeof payload.title === "string" && payload.title
      ? payload.title
      : "Omnidance";
  const data =
    payload.data && typeof payload.data === "object" ? payload.data : {};
  const url = typeof data.url === "string" ? data.url : "/notificaciones";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === "string" ? payload.body : "",
      icon: "/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/inicio";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Reusar una pestaña abierta de la app: focus + navegar a la URL.
        for (const client of windowClients) {
          if ("focus" in client) {
            return client.focus().then((c) =>
              c && "navigate" in c ? c.navigate(url) : c,
            );
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
