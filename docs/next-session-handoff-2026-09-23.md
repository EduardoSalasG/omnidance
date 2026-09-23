# Handoff — 2026-09-23 — cierre de pendientes del 09-22

## Qué se hizo

Se revisaron los 3 gaps declarados en `next-session-handoff-2026-09-22.md`
contra el código real — los 3 seguían vigentes — y se cerraron.

### 1. Badge de la campana por lente (era: contaba no-leídas globales)

- `notificationLens` movido a `@omnidance/shared`
  (`NOTIFICATION_LENS_TYPES`, `NOTIFICATION_LENSES`,
  `NotificationLensFilter`, `notificationLens(type)`) — misma regla
  front/back. `apps/web/src/lib/notification-lens.ts` ahora re-exporta
  (no rompe imports existentes).
- `GET /api/notifications` acepta `?lens=social|academy`: acota la lista
  **y** el `unreadCount`. El filtro es por exclusión del dominio opuesto
  — los tipos "any" (`account.*`, `crm.*`, `lead.*`) cuentan en ambas
  lentes. `lens` inválido → 400.
- `NotificationsRepo.listNotifications` ahora toma
  `ResolvedListOptions` (Omit + unread/limit concretos — `Required<>`
  pelaba el `| undefined` de `lens`); `countUnread(personId, lens?)`.
- `BottomNav`: el badge fetchea `/notifications?limit=1&lens=` con la
  lente activa (academyLens → academy, resto → social), espera a `/me`
  antes de pedir, refetchea al cambiar de lente, y el incremento por
  socket solo cuenta si `notificationLens(detail.type)` calza la lente
  (o es "any").
- `/notificaciones` también delega el filtro al servidor (`?lens=` en
  el fetch, refetch al cambiar de lente) — el filter client-side queda
  como red de seguridad para "any".

### 2. `VenueConsoleController` migrado a permisos (era: `@RequireRoles`)

- Nuevo permiso `venues.manage` en `PERMISSION_CATALOG` + grant
  `VENUE_MANAGER: ["venues.manage"]` en `ROLE_GRANTS` (seed-common).
- Controller: `@RequirePermissions("venues.manage")` — ADMIN pasa por
  isSuperuser igual que antes; el bypass de ownership interno sigue con
  `roleKeysHavePermission(admin.access)`. Con esto la afirmación de
  architecture.md ("ningún controller usa @RequireRoles") vuelve a ser
  cierta — se actualizó la fila social y la de notifications.
- **Re-seed necesario** para que el grant exista en DBs vivas:
  `pnpm db:seed` (idempotente; ya corrido en dev).

### 3. `/productor` con KPIs (era: grilla de módulos sin datos)

- Nuevo `components/producer/producer-pulse.tsx`: agrega stats de
  `GET /events/mine` sobre eventos PUBLISHED/LIVE con `endsAt` a futuro
  — próximos, entradas vendidas, recaudación bruta, check-ins. Tiles
  neon mismas que /venue; skeleton `.page-loading` (anti-flash 200ms);
  error → sección omitida (el hub es navegación).
- Montado sobre el ModuleGrid dentro del `ProducerGate`. i18n en
  `producer.kpi.*`.

## Verificación

- `shared` build + `pnpm db:seed` (8 permisos, grant aplicado).
- API tsc + web tsc limpios.
- Tests: **suite completa API 42 archivos / 969 tests verdes**
  (incluye notifications.service.spec +2 lens, notifications.e2e +2
  lens, venue-routes-wiring 4/4 con el grant nuevo).
- Smoke API viva: `/venues/mine` VENUE_MANAGER→200 / DANCER→403;
  `?lens=social`→2, `?lens=academy`→2, sin lens→3, lens inválido→400.
- `docs/openapi.json` + Postman regenerados (168 paths; `lens` quedó
  documentado).

## Pendiente / gaps conocidos

- **Handoff del 22 PM reconstruido**: `next-session-handoff-2026-09-22b.md`
  cubre la sesión de tarde (mesas en checkout, emails, tours, home
  academia, /clases) reconstruida desde git log — marcado como
  reconstrucción, no documento original.
- El unreadCount por lente depende de `NOTIFICATION_LENS_TYPES` — al
  crear un `type` de notificación nuevo, clasificarlo ahí si tiene
  dominio de lente (los no clasificados cuentan en ambas).
- ProducerPulse agrega solo eventos próximos/en vivo — un productor sin
  eventos activos ve la fila en 0 (correcto, pero vacío de información;
  candidato: "últimos 30d" como segunda vista).
