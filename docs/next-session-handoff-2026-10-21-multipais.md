# Handoff 2026-10-21 — fundación multipaís + series engagement

## Desplegado a main (prod)

- **v1.4.0** niveles de baile nuevos (iniciacion/basico/intermedio/avanzado
  + migración), email "Verifica tu correo", actorData por rol, "Nueva
  academia" dentro del selector (ya no en cada página).
- **v1.5.0** soft delete de usuarios: `Person.deletedAt`, auth bloqueada
  (sesión/password/link/OTP), fuera de superficies públicas, email no
  liberado, `POST /admin/users/:id/reactivate`, badge "Desactivada" en
  admin, e2e 20/20.
- **v1.5.1/1.5.2** fix i18n zona de peligro (keys mal anidadas) + pickers
  internos filtran desactivados.
- **v1.6.0** series engagement: `SeriesReview` (score+comentario por
  check-in verificado, comentarios ANÓNIMOS al productor), `GET
  /events/series/:id/engagement` (stats agregadas: avg asistencia,
  género, leader/follower), cards en `/eventos/[id]` y productor.
- **v1.6.1** migración photoUrl legacy + spec notifySafe + docs.
- **v1.7.0** `Country`/`City`, `Venue.cityId`, `Event.currency`,
  `Person.phoneCountryCode` + backfill Santiago (ciudad 0).

## Acumulado en `dev` SIN DEPLOYAR (usuario pidió acumular)

- `Event.cityId`, `Academy.cityId`, `Ticket/Subscription.currency` +
  migración `city_denorm_currency` + backfill + seed-common.
- `CitiesController`: `GET /cities`, `/cities/:slug`,
  `/cities/near?lat&lng` (haversine).
- Página `/ciudades/[slug]` (eventos/academias/prácticas) + i18n 4 loc.
- `AdminRegion` + scoping regional en `validation-queue` y
  `academy-review-queue` (revisor sin regiones = global).
- `TierPrice` — price book `tier×country` para multi-moneda.

## Decisiones de producto tomadas

- Suscripción dancer = **Pase Social** (NO academias — el baile tiene
  trayectoria): créditos para sociales/prácticas/eventos + cargo de
  servicio en puerta (~$1.000) al no-suscriptor + siempre preventa
  al suscriptor. Sirve Chile hoy y viajero después.
- Refunds explícitamente **fuera** de alcance.
- Reviews de serie: score agregado público + comentarios privados
  anónimos (cumple regla ratings privados).
- Congresos = task 13 del roadmap (evento multi-día: full/day pass,
  tracks, workshops, socials).

## Próximos pasos (roadmap openspec/changes/multipais-foundation)

1. **Stripe adapter + port `PayoutRail`** — pieza grande, habilita
   cobrar fuera de Chile (gateway-registry ya es hexagonal).
2. Consent por jurisdicción (GDPR vs Ley 19.628).
3. City guides curadas, "Mi viaje" (trip planner), pases multi-día.
4. Pase Social (task 12) — suscripción + créditos + cargo puerta.
5. Congresos (task 13).

## Notas técnicas de la sesión

- `npx` fallaba por commit de memoria Windows agotado — workaround:
  `node node_modules/prisma/build/index.js generate` y
  `node node_modules/typescript/bin/tsc --noEmit` (spawn directo).
- Specs de controllers que importan SessionGuard requieren
  `import "../../auth/infrastructure/auth.controller"` primero
  (dependencia circular conocida).
- Skills verificadas en `~/.agents/skills/` (using-superpowers,
  impeccable, ui-ux-principles, etc.) — invocarlas por nombre; el
  search del repo no las encuentra porque viven fuera.
- `Checkin.event` es FK plana (no relación) — filtrar por `eventId in`
  tras resolver los eventos de la serie.
