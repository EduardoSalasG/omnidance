# Events Hub Fase 2 — Implementation Plan

**Goal:** Completar el hub de eventos: vista calendario, "cerca de ti" (geolocalización opt-in) y guardados.

**Architecture:** SSR con links compartibles (mismo patrón que filtros fase 1). "Guardados" reutiliza el modelo `Rsvp` existente (INTERESTED/GOING) — no se crea `SavedEvent`. Calendario y saved son vistas autenticadas (`?view=`); anónimos siguen viendo solo la lista de la semana.

**Stack:** NestJS + Prisma / Next.js 14 App Router + Tailwind / i18n monolito `messages/es-CL.json` (namespace `events` ya existe ahí).

## Tareas

1. **API: venue.lat/lng en listado público** (TDD)
   - Test: fixture venue con lat/lng → `GET /api/events` expone `venue.lat/lng`.
   - Impl: `select.venue += { lat, lng }` en `list()` de `events.controller.ts`.

2. **Seed: coords reales aprox. de venues** — Orixas/Tierra Dura/Havana con lat/lng de Santiago; el helper `venue()` update los setea (idempotente).

3. **Web: `lib/geo.ts`** — `haversineKm(lat1,lng1,lat2,lng2)` pura + `formatKm`.

4. **Web: `SaveEventButton.tsx`** (client) — bookmark toggle optimista: null → PUT rsvp INTERESTED; GOING|INTERESTED → DELETE. `aria-pressed`, SVG bookmark, min-h-11.

5. **Web: `NearMeButton.tsx`** (client) — `navigator.geolocation` → `router.push` preservando params con `near=lat,lng`; estados pending/denied.

6. **Web: `page.tsx`**
   - `?view=list|calendar|saved` (default list; anon ignora view).
   - `?near=lat,lng` → sort por distancia + badge "a X km"; chip "Cerca de ti" (NearMeButton inactivo / link clear activo).
   - `?view=saved` → fetch SSR `/api/me/rsvp` con cookie → pool filtrado a mis eventos + badge Voy/Me interesa.
   - `?view=calendar&month=YYYY-MM` → grilla lunes-primero, chips de evento por día (link a detalle), prev/next preservando filtros, hoy destacado.
   - View switcher (solo authed): Lista / Calendario / Guardados.
   - SaveEventButton: sibling absoluto del Link del card (top-right, z-10) — HTML válido, card sigue clickeable.
   - SSR fetch de `/me/rsvp` con cookie para estado inicial de los botones.

7. **i18n** — keys nuevas en `events`: viewList/viewCalendar/viewSaved, savedEmpty, near, nearDenied, kmAway, prevMonth, nextMonth, more ("+{n}"), save/saved.

8. **Verificación** — typecheck web+api, e2e events, SSR probes (list/calendar/saved/near, anon intacto), seed, `architecture.md`, openapi/postman regen, commit → merge dev → push.

## Restricciones

- Ratings privados; contadores RSVP ya son solo agregados — no exponer personas.
- Anónimos: nada cambia (lista semana, sin detalle, sin chrome).
- Sin cambio de schema → sin migración.
- Timezone: mismo criterio actual (local runtime) — limitación conocida, documentar.
- Card: botón save es sibling absoluto del `<Link>` — nunca anidar interactivos.
