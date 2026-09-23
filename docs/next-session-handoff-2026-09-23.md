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

---

## Segunda sesión — `/clases` prioriza las academias del alumno

OpenSpec `clases-enrolled-scope` (proposal + spec delta `academy-learner` +
design + tasks, todo completo). Decisiones del usuario: vigente =
ACTIVE/TRIAL/ONLINE (PAUSED/FROZEN no cuentan); gate de reserva en API;
reservadas solo badge + filtro (sin sección pineada).

### API (`academies/infrastructure/classes.controller.ts`)

- `GET /classes/browse?scope=enrolled` — acota a academias con
  Enrollment vigente del autenticado (sin scope = todas, compat). Cada
  item gana `enrolled: boolean`. `scope=enrolled` ∩ `academyId` no
  calzando → `[]`.
- `GET /classes/:id` — flag `enrolled` (misma regla).
- `POST /classes/:id/book` — **breaking**: exige inscripción vigente en
  la academia de la clase → 403 dentro de la tx. La academia inscribe;
  no hay auto-inscripción.
- Constante `BOOKABLE_ENROLLMENT` local al controller.

### Web `/clases`

- Vistas: `list | calendar | history | explore`. `list`/`calendar`
  consultan `browse?scope=enrolled`; `explore` (ícono brújula, ex
  marcador) carga todas las academias. `history` intacto (todas las
  pasadas, inscrito o no).
- Filtro segmentado **Todas | Reservadas** en list+calendar
  (`scope=reservadas`; `mias` legado = alias). Los dropdowns
  estilo/nivel también aplican en reservadas — client-side sobre
  `/classes/mine`, que ganó `weekday` + ids de estilo/nivel (el filtro
  de chips por día se eliminó; `weekday` sigue en el contrato browse).
  Los dropdowns estilo/nivel son `<select>` nativos (picker del SO en
  mobile — el `<details>`+`<ul>` custom desbordaba la pantalla) y sus
  opciones se derivan del set sin filtrar del scope (`facetClasses`,
  fetch extra solo con filtro activo; `mine` en reservadas) y son
  facetas dependientes: estilo se acota por nivel elegido y nivel por
  estilo — nunca ofrecen un valor sin resultados.
  Reservadas usa las cards wallet (badge + link QR) — absorbe la
  vista `mine`; `view=mine` legado redirige a list+reservadas.
- En explore, cards de academias sin inscripción muestran "Requiere
  inscripción" en vez del botón Reservar (flag `enrolled` del browse).
- `ClassBookingCta` (ficha) recibe `enrolled` y muestra el mismo estado.
- El card del explorador vive en `components/classes/class-card.tsx`
  (`ClassCard` + `ClassCardData` + `CancelBookingButton`); `/clases` y
  el home Academia lo comparten. `home/stats.nextClass` devuelve el
  shape completo del card (misma proyección que browse) y el home
  acepta `when` (día+hora) + reservar/cancelar con refetch de stats.
- Empty state sin inscripciones → CTA a explore. i18n: `viewExplore`,
  `scopeBooked`, `requiresEnrollment`, `emptyEnrolled`; tour `cl-mine`
  → `cl-explore` con textos nuevos.

### Verificación

- API tsc + web tsc limpios. Suite completa: 42 archivos / 941+38
  tests verdes (2 suites gamification dieron timeout de hook en el run
  completo — flake; aislados pasan 38/38).
- Unit nuevo: book gate (sin inscripción/PAUSED/otra academia → 403,
  TRIAL → BOOKED). E2E nuevo: scope=enrolled, enrolled flags, book
  403/201.
- Smoke API viva: browse enrolled 25 clases todas `enrolled:true`;
  outsider → `[]`; book outsider → 403; book inscrito → 201 BOOKED
  (reserva de prueba cancelada después).
- `docs/openapi.json` + Postman regenerados; `architecture.md` fila
  academies actualizada; `omni-dance.md` §9 documenta la regla.
- Commit aparte: fix del back link duplicado en `/clases/[id]`
  (ecaa01d).

### Candidatos (no pendientes)

- CTA "contactar academia" en cards de explore — no existe página
  pública de academia ni deep link de contacto.
- Explore podría ganar filtro por academia (el API ya acepta
  `academyId`) si el volumen lo justifica.
