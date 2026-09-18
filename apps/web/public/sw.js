/* Omnidance — service worker mínimo para Web Push.
 *
 * Payload que envía el backend (web-push.sender.ts):
 *   { type, title, body, data }
 * `data` es el JSON libre de la notificación; si trae `url` se usa al hacer
 * click, si no cae a /notificaciones (el centro in-app).
 *
 * Sin icon: public/ aún no tiene icon-192.png — agregar `icon` aquí cuando
 * exista el asset.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/";

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
