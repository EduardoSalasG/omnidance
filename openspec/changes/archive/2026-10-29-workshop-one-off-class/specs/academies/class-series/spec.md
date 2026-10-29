# Delta: academies/class-series

## ADDED Requirements

### Requirement: Horario de fecha única (taller)

Un `ClassSlot` SHALL admitir una modalidad de instancia única mediante
`oneOffDate` (medianoche UTC, misma convención que `Class.date`).
`oneOffDate = null` es el comportamiento recurrente actual (default,
sin migración de datos).

Un slot con `oneOffDate` SHALL materializar **solo esa fecha** en la
ventana rodante: `materializeSlot` crea la `Class` de ese día si está
dentro de la ventana y aún no existe, y el job diario no genera
instancias adicionales una vez pasada la fecha (nunca recurre). Su
`weekday` persiste el día de semana derivado de `oneOffDate` como dato
informativo, sin efecto en la materialización.

Los payloads de slot de `POST /academies/:id/series`, `addSlots` y
`PATCH /academies/:id/slots/:slotId` SHALL aceptar `date` ("YYYY-MM-DD")
como forma alternativa de programación: con `date` el slot queda de
fecha única; sin ella, recurrente por `weekday`. `date` inválida o en
el pasado al momento de crear responde 400.

Cambiar la `date` de un slot único SHALL correr la misma cascada que
cambiar el `weekday` de uno recurrente: cancela la clase vigente de la
fecha vieja (reservas BOOKED/WAITLIST → CANCELLED + refunded) y
materializa la fecha nueva. Editar hora/plantel propaga igual que en
slots recurrentes. Eliminar un slot único corre la cascada existente
(cancela su clase futura + reembolsa; borrado lógico con historial).

#### Scenario: crear taller de un día

- **GIVEN** un owner que crea una serie con un slot `{date: "2026-11-15"}`
- **WHEN** el POST se ejecuta
- **THEN** se materializa una sola `Class` el 15 de noviembre y el job
  diario no crea instancias de otras fechas para ese slot

#### Scenario: reprogramar el taller

- **GIVEN** un taller con clase el 15 y una reserva BOOKED
- **WHEN** el owner edita el slot a `{date: "2026-11-22"}`
- **THEN** la clase del 15 queda cancelada, la reserva CANCELLED +
  refunded y se materializa la clase del 22

#### Scenario: fecha pasada no materializa

- **GIVEN** un slot único cuya `oneOffDate` ya pasó
- **WHEN** corre el job diario o se rematerializa la serie
- **THEN** no se crean clases nuevas para ese slot

### Requirement: Selector de tipo en el formulario de clase

`/academia/series/nueva` SHALL ofrecer un selector de tipo con dos
opciones: "Serie semanal" (default, comportamiento actual) y "Taller /
clase única". En modo taller el fieldset de horarios pide **una fecha +
hora inicio/fin** (no `weekday`), exactamente un horario, y el resto
del formulario (estilo, nivel, roster, quórum, precio suelta,
modalidades) funciona igual.

La ficha de serie SHALL mostrar el slot único con su fecha puntual en
la fila de horarios (no "Lunes 19:00"); la ficha del horario edita
`date` en vez de `weekday` en ese caso.

#### Scenario: crear taller desde el form

- **GIVEN** el owner en `/academia/series/nueva` elige "Taller / clase
  única" e ingresa fecha + hora
- **WHEN** envía el formulario
- **THEN** se crea la serie con un slot único y aparece en el listado
  con su fecha en la fila de horarios

### Requirement: Cancelación de una instancia de clase

La academia SHALL poder cancelar una `Class` individual sin afectar el
resto del horario ni la serie: `POST /academies/:id/classes/:classId/cancel`
(cap schedule/classes write) marca `cancelled=true` + `cancelledAt`,
cancela las reservas BOOKED/WAITLIST → CANCELLED + `refunded=true` y es
idempotente (re-cancelar responde OK sin efecto extra). Responde 404 si
la clase no pertenece a la academia o ya pasó.

`Class.cancelledAt` SHALL distinguir la baja individual de la baja por
cascada (desactivar serie, eliminar/reprogramar slot): las cascadas la
dejan `null`. `materializeSlot` MUST NOT revivir instancias con
`cancelledAt` set - solo descancela las `cancelled AND cancelledAt IS
NULL` (reactivación de serie mantiene su semántica actual).

La consola SHALL ofrecer la acción por instancia en el listado de
próximas clases de la ficha de serie (ConfirmSheet, misma pauta que el
delete de horario). Una clase cancelada así desaparece de `/clases`,
`/classes/mine` queda con estado cancelado y el historial la conserva.

#### Scenario: feriado puntual

- **GIVEN** una serie martes 19:00 con clase el 21 oct (feriado) y una
  reserva BOOKED
- **WHEN** el owner cancela esa instancia
- **THEN** solo esa `Class` queda cancelada + `cancelledAt`, la reserva
  refunded, las demás fechas intactas y el job diario no la revive

#### Scenario: instancia pasada no cancelable

- **GIVEN** una clase cuya fecha ya pasó
- **WHEN** se llama al endpoint de cancelación
- **THEN** responde 404/400 sin tocar el historial
