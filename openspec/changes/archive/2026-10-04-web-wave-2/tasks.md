# Tasks — web-wave-2

## Implementado

- [x] F1 Landing conversión: hero 1-promesa/1-CTA, sección roles → una línea,
      eventos en vivo, cómo funciona, CTA final, footer mínimo.
- [x] F1 SEO: metadataBase, title template, OG/Twitter, robots.ts, sitemap.ts,
      JSON-LD (Organization + WebSite + ItemList de DanceEvent), canonicals
      por página, `app/icon.svg`, `opengraph-image.tsx` (ImageResponse).
- [x] F2 Consola productor: `/productor/eventos` (lista + crear),
      `/productor/eventos/[id]` (editar/publish/cancel + staff/pases/
      sugerencias/reservas/ratings), `/productor/pagos`.
- [x] F3 CRM UI: `/crm` people (scores/segmentos/tags/filtros/paginación),
      `/crm/campanas` (draft→send), `/crm/triggers` (CRUD + evaluate).
- [x] F4 Academia: private-lessons (request/confirm/cancel/done/reschedule
      por rol), videos con gate locked/unlocked + CRUD owner.
- [x] F5 Consumer: `TripMatches` en /viajes (overlap days + friend request),
      `SeriesPassCta` en evento (checkout + stub:// fallback dev).
- [x] F6 Realtime: `RealtimeProvider` (socket.io auth por cookie, room
      person:{id}), `NotificationToast`, `PushOptIn` + `public/sw.js`.
- [x] i18n: `src/i18n/messages.ts` deep-merge de parts/*.json — alimenta
      request.ts y layout.tsx (fix: el provider antes solo veía es-CL.json).
- [x] API gaps cerrados: `GET /events/mine` (todos los estados del productor),
      `GET /events/:id/table-reservations/manage` (id+status para gestión),
      `GET /events/:id` expone ids+caps, `series.id` en list+detail,
      `POST /push-tokens` persiste `keys` VAPID en payload,
      `assertProducerOrAdmin` → `roleKeysHavePermission` (sin rol literal).

## Pendiente conocido

- Web Push: keys VAPID de dev generadas y en `apps/api/.env` +
  `apps/web/.env.local` (gitignored); `.env.example` documenta cómo
  generarlas. Sender armado (sin warning en boot). Push real solo llega si
  el navegador concede permiso — el opt-in ya pide `Notification.permission`.
- [x] `/checkout/return` implementado — polling `/payments/:id` con estados
  verifying/paid/failed/stillPending/unauth/error (cierra el flujo Flow).
- [x] Badge de no-leídas en el tile `/notificaciones` de HomeHub
  (unreadCount inicial + `omnidance:notification` incrementa en vivo).
- [x] `GET /academies` — directorio autenticado (id+nombre+instructores con
  nombre); el form de clase particular ahora funciona para alumnos puros.
- [x] RBAC: todos los `roles.includes("ADMIN")` literales migrados a
  `roleKeysHavePermission` (academies, private-lessons, event-ratings,
  song-suggestions, table-reservations) — dominio recibe `isAdmin` flag.
- BottomNav sigue sin tab de notificaciones (el badge vive en HomeHub).
