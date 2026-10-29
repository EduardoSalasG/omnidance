# Delta: academies/class-series

## ADDED Requirements

### Requirement: Notificación al alumno al liberar su reserva

Toda cascada de cancelación iniciada por la academia SHALL emitir una
notificación in-app por cada reserva BOOKED/WAITLIST liberada, al
`personId` de la reserva. Aplica a: cancelación de instancia
(`POST /academies/:id/classes/:classId/cancel`), eliminación de
horario (`DELETE /academies/:id/slots/:slotId`), reprogramación de
horario o taller (`PATCH /academies/:id/slots/:slotId` con cambio de
weekday/date) y desactivación/eliminación de serie
(`DELETE /academies/:id/series/:seriesId`).

La notificación SHALL usar el canal existente
(`NotificationsService.notifySafe`: persistencia in-app + fan-out
realtime/push, best-effort post-commit) con `type`
`class.booking.released` y `data` que incluya `bookingId`, `classId`,
`academyId`, `seriesId`/`seriesName` cuando se resuelva, `reason`,
`refunded: true` y `path` de deeplink. El copy MUST comunicar la
serie/academia afectada y la devolución del crédito.

La emisión SHALL ser idempotente: se notifica exactamente el set de
reservas BOOKED/WAITLIST capturado al momento de la cascada; una
reserva ya CANCELLED MUST NOT generar notificación (re-cancel o
cascada repetida no duplican avisos). Un fallo del centro de
notificaciones MUST NOT revertir ni impedir la cascada.

#### Scenario: eliminar horario con reservas

- **GIVEN** un slot con una clase futura con reservas BOOKED de dos
  alumnos y una reserva ya CANCELLED
- **WHEN** el owner elimina el horario
- **THEN** las dos reservas vivas pasan a CANCELLED + refunded y cada
  alumno recibe una notificación `class.booking.released` con el
  classId, la serie y la devolución del crédito; el tercero no recibe
  nada

#### Scenario: re-cancelar una instancia no duplica avisos

- **GIVEN** una clase ya cancelada por instancia cuyas reservas quedaron
  CANCELLED + refunded
- **WHEN** se llama de nuevo al endpoint de cancelación
- **THEN** responde OK, no toca las reservas y no emite notificaciones

#### Scenario: fallo del centro no revierte la cascada

- **GIVEN** una serie con clases futuras reservadas
- **WHEN** el owner la elimina y el centro de notificaciones falla
- **THEN** las clases quedan canceladas, las reservas refunded y el
  DELETE responde OK igual
