# Handoff — 2026-09-22 — role-console-depth (consolas B2B)

## Qué se hizo

Mismo proceso que `dancer-academy-lens`, aplicado a los 4 roles de gestión
(spec §13): análisis de páginas vs spec, UX/accesibilidad, gaps reales.
Resultado: las consolas ya eran maduras — se cerraron gaps puntuales, no se
rediseñó.

### API

- `GET /dj/gigs/:eventId/rating` — agregado `music` con k-anonymity
  (`EXPOSURE_THRESHOLD=3` exportado desde `event-ratings.controller` y
  reutilizado). Solo DJ asignado al evento o `admin.access`.
- `GET /venues/:id/dashboard` += `tables` (reservas no canceladas de eventos
  futuros, con requester) + `flow` (histograma check-ins 30d, hora peak,
  permanencia media `outAt−inAt`).
- `GET /academies/:id/dashboard` += `todayClasses` (hora, serie, instructor
  — lookup manual porque `ClassSlot.instructorId` es escalar —, cupo,
  reservas) + `attendanceToday`.
- `GET /events/mine` += `stats {sold, grossClp, checkins}` por evento
  (3 groupBy paralelos sobre ids).
- `GET /events/:id/live` — ventas PRESALE/DOOR (count+amount), entradas
  manuales de puerta, check-ins total/última hora/histograma, capacidad,
  ocupación, pases activos. Owner/admin.

### Fix de wiring (bug preexistente encontrado en smoke)

`VenuesController` (`@Get(":id")` público) se registraba ANTES que
`VenueConsoleController` en `SocialModule` → `GET /venues/mine` matchaba
`:id` → 404 "Local no encontrado" — la consola del venue estaba rota en
runtime. Fix: reordenar controllers en `social.module.ts` + nota en
`docs/architecture.md` + spec nuevo `test/venue-routes-wiring.e2e.spec.ts`
que monta el `SocialModule` REAL (los specs existentes montaban controllers
sueltos y no podían ver la colisión).

### Web

- `/productor/eventos`: stats por card (vendidas · bruto · check-ins).
- `/productor/eventos/[id]`: sección "En vivo / Operación"
  (`live-section.tsx`) con ventas por canal y check-ins.
- `/dj`: badge de música agregada en gigs pasados (estado discreto bajo k).
- `/venue`: secciones Reservas de mesa + Flujo del público.
- `/academia`: dashboard "Clases de hoy" + card CRM (visible solo
  owner/ADMIN — CRM ya soportaba `actorType=ACADEMY`).
- `BottomNav`: `/crm` agregado al drawer de ACADEMY_OWNER.
- i18n en parts (`dj.json`, `venue.json`, `producer.json`,
  `academyExtras.json`).

### Seed

Ediciones pasadas con `EventDj` + `EventRating` (expuestas ≥3 y un caso
bajo umbral), check-ins con `outAt`, check-ins del evento LIVE
(scan + manual) + pago DOOR, mesa CONFIRMED junto a la REQUESTED,
sugerencias de canciones. Todo idempotente.

## Verificación

- API tsc + web tsc limpios.
- Suite completa: **42 archivos / 938 tests verdes** (incluye
  `role-console-depth` 11/11 y `venue-routes-wiring` 4/4).
- Smoke real API viva: DJ rating 4.5/6 evaluaciones · venue tables:2
  flow peak 21:00 permanencia 192min · events/mine con stats ·
  /events/:id/live door 4 $30.800 + 2 manual · academy todayClasses:1.
- Impeccable detect: sin hallazgos.
- `docs/openapi.json` + Postman regenerados (164 paths).
- `docs/architecture.md` actualizado (filas events/social + regla de orden
  de controllers con prefijo compartido).

## Pendiente / gaps conocidos

- Badge de la campana del appbar cuenta no-leídas globales (no por lente) —
  divergencia menor ya que entrar al centro marca todo como leído.
- `VenueConsoleController` usa `@RequireRoles` (escape hatch) — migrar a
  `@RequirePermissions` cuando haya permiso `venues.manage` en el catálogo.
- Producer hub `/productor` sigue siendo grilla de módulos sin KPIs propios
  (los datos ahora están en eventos/detalle) — candidato a dashboard real.
