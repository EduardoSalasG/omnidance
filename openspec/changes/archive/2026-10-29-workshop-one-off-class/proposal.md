# Proposal; workshop-one-off-class

## Why

La academia no tiene forma de publicar una actividad puntual: un taller
de un solo día, una clase especial con invitado, una masterclass. El
modelo exige que toda `Class` nazca de un `ClassSlot` **semanal
recurrente**, así que hoy el dueño tendría que crear una serie +
horario (materializa ~8 semanas), confiar en que nadie reserve las
instancias de otras fechas y acordarse de eliminar el horario después.
Es parche que modela mal la intención y genera fricción real: la escena
vive de talleres puntuales.

Tampoco existe cancelación por instancia: la unidad mínima de baja es
el horario completo.

## What Changes

- **`ClassSlot` admite fecha única**: nuevo campo `oneOffDate`
  (medianoche UTC, misma convención que `Class.date`). Un slot con
  `oneOffDate` materializa **solo esa fecha**; el job diario y la
  rematerialización lo ignoran una vez pasada (nunca recurre).
- **Contrato**: los payloads de slot (`POST /series`, `addSlots`,
  `PATCH /slots/:slotId`) aceptan `date` ("YYYY-MM-DD") como alternativa
  al `weekday` recurrente. Cambiar la fecha de un taller corre la misma
  cascada que cambiar el `weekday` de un slot recurrente: cancela la
  clase vieja (reembolsa reservas) y materializa la nueva.
- **Form**: selector de tipo en `/academia/series/nueva` - "Serie
  semanal" vs "Taller / clase única". En modo taller el fieldset de
  horarios pide una fecha + hora única en vez de weekday.
- **Consola**: en la ficha de serie el slot único muestra su fecha (no
  "todos los lunes"); la ficha del horario edita fecha en vez de día de
  semana; eliminar = misma cascada existente.
- **Dancer**: la clase aparece en `/clases` como cualquier clase
  (mismo card, venta suelta por `dropInPrice` = orderType WORKSHOP que
  ya existe). Sin cambios de surface pública.
- **Cancelación por instancia**: la academia puede cancelar **una sola
  clase** de una serie recurrente (feriado, profe enfermo) sin tocar el
  horario: `POST /academies/:id/classes/:classId/cancel` marca
  `cancelled` + `cancelledAt` y corre la cascada de reservas existente
  (BOOKED/WAITLIST → CANCELLED + refunded). `cancelledAt` distingue la
  baja individual de la de cascada: el materializador **no revive**
  instancias canceladas así (hoy descancela todo lo cancelado en la
  ventana, y un feriado volvería solito al día siguiente).

## Capabilities

### Modified Capabilities

- `academies/class-series`: el horario deja de ser exclusivamente
  semanal recurrente - admite instancia única por fecha; la
  materialización, la edición y la eliminación se especifican para
  ambos modos.

## Impact

- Schema: `ClassSlot.oneOffDate DateTime?` y `Class.cancelledAt
  DateTime?` (migración versionada, sin backfill - null = comportamiento
  actual; las cancelaciones de cascada no la setean para que la
  reactivación siga reviviendo).
- API: `class-series.controller` (DTOs de slot, updateSlot),
  `class-series-materialize.service` (wanted = [oneOffDate]).
- Web: `series-form.tsx` (selector de tipo), ficha de serie y ficha de
  horario (fecha vs weekday), i18n ×4.
- Sin cambios en reservas, asistencia, créditos ni analítica: un taller
  es una clase más para todo lo downstream.
