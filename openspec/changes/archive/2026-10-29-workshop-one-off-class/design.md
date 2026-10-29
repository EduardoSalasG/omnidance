# Design; workshop-one-off-class

## Decisión de modelo

`ClassSlot.oneOffDate DateTime?` (default null). Alternativas
descartadas:

- **`Class` standalone sin slot**: rompe el invariante "todo slot
  pertenece a una serie / toda clase a un slot" y obliga a bifurcar
  reservas, asistencia, roster, cancelaciones y analítica. El slot es
  el contenedor correcto: un taller ES un horario, solo que no repite.
- **Flag `oneOff: Boolean`**: sin fecha propia habría que deducirla del
  weekday + ventana → ambiguo y frágil. La fecha explícita es
  auto-contenida.
- **`endDate` en slot recurrente**: es otra feature (series de temporada
  acotadas) - puede convivir después sobre el mismo campo si se quiere,
  pero hoy un taller es una fecha, no un rango.

`weekday` queda `Int` requerido: en un slot único guarda el día de
semana derivado de `oneOffDate` (dato informativo para vistas que
agrupan por día; la materialización lo ignora cuando `oneOffDate`
existe).

## Materialización

`materializeSlot` hoy filtra `dates.filter(getUTCDay === slot.weekday)`.
Nueva regla: `slot.oneOffDate ? [oneOffDate] ∩ dates : filter(weekday)`.
La intersección con la ventana hace que un taller pasado deje de
materializar gratis, sin branch extra en el job diario ni en
`runDaily` (que ya selecciona `deletedAt: null`).

Idempotencia intacta: revivir una clase cancelada del taller re-materia
la misma fecha (owner que canceló por error puede reactivar editando).

## Contrato

`CreateSlotDto`/`AddSeriesSlotDto`/`UpdateSlotDto` ganan
`date?: string` ("YYYY-MM-DD"). Reglas:

- `date` presente → slot único: `oneOffDate = Date.parse(date + "T00:00:00Z")`,
  `weekday` = `getUTCDay()` derivado. 400 si `date` es inválida o pasada
  en create/addSlots.
- `date` ausente → `oneOffDate = null` (recurrente; `weekday` requerido
  como hoy). `PATCH` con `date` convierte a único; `PATCH` sin `date`
  no lo des-convierte (un taller no se vuelve recurrente por edición -
  caso borde YAGNI).
- `weekday` y `date` pueden coexistir en payload; `date` gana.

## Cascadas (reusa la lógica de updateSlot)

`updateSlot` ya implementa "scheduleChanged → cancel stale + materialize
new + sync plantel". Generalizar: `scheduleChanged = weekdayChanged ||
oneOffDateChanged`. La comparación de `oneOffDate` es por timestamp.
Todo lo demás (plantel, delete, bookings, refund) sin cambios.

## UI

- `series-form`: radio/segmented "Serie semanal | Taller / clase única"
  arriba del fieldset de horarios. Modo taller: un solo bloque
  `input[type=date]` + `time` inicio/fin; sin "+ Agregar horario".
  Submit manda `slots: [{date, startTime, endTime, instructorIds}]`.
- Edit de serie (`?edit=`): hoy oculta slots - sin cambio; el tipo no
  se edita a nivel serie (un slot es único o no, por sí mismo).
- Ficha de serie: la fila del slot único muestra "15 nov · 19:00–21:00
  · Taller" en vez de weekday. Badge/chip "Taller" para distinguirla.
- Ficha de horario: `input[type=date]` en vez del select de weekday
  cuando `oneOffDate` existe.
- GET slot/series devuelven `oneOffDate` en el payload (el front lo
  necesita para el modo fecha; el tipo `Slot`/`Series` de `shared.ts`).

## Cancelación por instancia

`POST /academies/:id/classes/:classId/cancel` (cap schedule/classes
write, misma guard que updateSlot). Marca `Class.cancelled=true` +
`cancelledAt=now` y corre la cascada de reservas existente. Idempotente;
404 clase ajena, 400/404 si ya pasó.

**Por qué `cancelledAt`**: `materializeSlot` revive `cancelled=true` en
la ventana (así funciona el reactivar serie). Sin distinción, una clase
cancelada por feriado reviviría en el siguiente tick diario. Regla:
las acciones de instancia setean `cancelledAt`; las cascadas no.
`toRevive` pasa a `cancelled AND cancelledAt IS NULL`.

- Reactivar serie → reviven las canceladas por cascada (semántica
  actual), no las instancias.
- Sin endpoint de "descancelar instancia" por ahora (re-materializar no
  la toca; el owner puede eliminar y recrear el horario si se
  equivocó). Si se necesita después, es `PATCH {cancelled:false}` +
  limpiar `cancelledAt`.

## Edge cases

- Clase del taller con reservas + cambio de fecha: cascada de
  cancelación existente (reembolso) - la reserva no se traspasa, igual
  que weekday.
- `date` dentro de la ventana pero serie inactiva: materializa al
  reactivar si sigue vigente.
- Import CSV/legacy: sin cambio (slots siempre recurrentes; el campo
  `date` es opt-in del formulario/API).

## Fuera de scope

- Congresos multi-día / packs (task 13 de multipais-foundation).
- Transferencia de reservas al reprogramar (producto futuro).
- "Descancelar" una instancia individual (ver Cancelación por
  instancia).
