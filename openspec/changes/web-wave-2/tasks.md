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

- Web Push activo requiere `WEB_PUSH_VAPID_*` (backend) y
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (frontend) en env.
- `/checkout/return` no existe aún — el `returnUrl` del gateway apunta ahí
  (gap preexistente del flujo de pago real).
- BottomNav no tiene tab de notificaciones; el entry point es el tile de
  HomeHub — el CustomEvent `omnidance:notification` queda listo para badge.
- Sin endpoint público de academias/instructores: el form de clase
  particular solo aparece en vista staff (decisión de producto pendiente).
