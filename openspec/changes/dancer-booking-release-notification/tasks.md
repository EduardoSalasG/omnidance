# Tasks: dancer-booking-release-notification

## API

- [x] 1. `releaseBookings(tx, classes, now)`: select previo de reservas
  BOOKED/WAITLIST de los classIds + `updateMany` a CANCELLED con
  `refunded=true` + `cancelledAt`; devuelve las filas afectadas (id,
  classId, personId, classDate). Doble filtro de estado en el update
  por carrera con un cancel concurrente.
- [x] 2. `notifyReleasedBookings(academyId, released, {seriesId,
  reason})`: best-effort post-commit; resuelve nombre de academia y
  serie; emite `notifySafe` por reserva con type
  `class.booking.released`, categoría SOCIAL, title/body con contexto
  y data completa (bookingId, classId, classDate, academyId, seriesId,
  seriesName, reason, refunded, path).
- [x] 3. Rewire de las 4 cascadas: `cancelClass` (reason
  `class.cancelled`, seriesId resuelto vía classSlotId), `deleteSlot`
  (`slot.deleted`), `updateSlot` rama scheduleChanged
  (`slot.rescheduled`), `deactivate` DELETE serie
  (`series.deactivated`).

## Tests

- [x] 4. `class-series.controller.spec.ts`: FakePrisma con
  `classBooking.findMany`, `updateMany` por id/classId/status,
  delegate `academy.findUnique`, `personId` en FakeBooking y `name`
  en FakeSeries. Casos: notificación por reserva en deactivate /
  deleteSlot / updateSlot(weekday) / updateSlot(date) / cancelClass;
  cero avisos a reservas CANCELLED; re-cancel notifica una sola vez;
  PATCH sin cambio de esquema no notifica.

## Cierre

- [x] 5. `pnpm exec vitest run
  src/academies/infrastructure/class-series.controller.spec.ts` verde
  + `pnpm exec tsc --noEmit -p tsconfig.json` limpio.
- [x] 6. `docs/qa-flows-inventory.md`: las entradas de cancelación de
  clase/slot/serie mencionan la notificación al alumno.
