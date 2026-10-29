# Proposal: dancer-booking-release-notification

## Why

Cuando la academia libera reservas por cascada (cancela una instancia,
elimina o reprograma un horario/taller, desactiva/elimina una serie),
las reservas BOOKED/WAITLIST pasan a CANCELLED + `refunded=true` pero
el dancer **no se entera**: solo lo descubre al abrir "mis reservas".
La promesa del producto es que el alumno nunca pierde crédito por una
decisión de la academia; sin aviso, la experiencia se siente como
pérdida aunque el crédito vuelva.

## What Changes

- **Notificación por reserva liberada**: cada cascada existente emite
  una notificación in-app (`type class.booking.released`, categoría
  SOCIAL, con fan-out realtime + push vía `notifySafe`, mismo canal que
  `class.waitlist.promoted` / `class.series.resumed`) a cada
  `personId` con reserva BOOKED/WAITLIST afectada.
- **Helper compartido** en `class-series.controller`:
  `releaseBookings(tx, classes, now)` hace select previo del set
  afectado + `updateMany` CANCELLED/refunded y devuelve las filas
  liberadas; `notifyReleasedBookings` emite post-commit (best-effort:
  un fallo del centro no revierte la cascada). Aplicado en
  `cancelClass`, `deleteSlot`, `updateSlot` (scheduleChanged) y
  `deactivate` (DELETE serie, que cubre la eliminación lógica).
- **Contenido**: title "La academia canceló tu clase", body con
  serie + academia + fecha + "te devolvimos el crédito"; `data` lleva
  bookingId, classId, classDate, academyId, seriesId, seriesName,
  reason, refunded y `path: "/clases"` (deeplink vía fallback genérico
  de /notificaciones; la lente academy ya clasifica el prefix
  `class.*`).
- **Idempotente**: solo se notifica el set BOOKED/WAITLIST capturado
  antes del update; reservas ya CANCELLED nunca notifican (re-cancel
  o cascada repetida no duplica avisos).

## Capabilities

### Modified Capabilities

- `academies/class-series`: las cascadas de cancelación por la
  academia ya existen y devuelven crédito; ahora además notifican al
  alumno afectado.

## Impact

- API: `class-series.controller.ts` (2 helpers privados + rewire de
  las 4 cascadas). Sin cambios de contrato HTTP, schema ni migraciones.
- Web: sin cambios. El type nuevo cae en la lente academy
  (`class.*` prefix en `NOTIFICATION_LENS_TYPES`) y el deeplink se
  resuelve por `data.path` en el fallback de /notificaciones.
- Tests: `class-series.controller.spec.ts` cubre notificación por
  reserva en cada cascada y silencio ante reservas ya canceladas.
