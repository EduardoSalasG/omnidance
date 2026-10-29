# academies/class-series Specification

## Purpose
TBD - created by archiving change academy-owner-console-v2. Update Purpose after archive.

## Requirements

### Requirement: Serie vigente hasta su desactivación

Las series de clases SHALL ser ilimitadas: `month` en
`POST /academies/:id/series` pasa a opcional y deja de ser la vigencia
de la serie. Cuando se omite se persiste el mes actual como etiqueta de
origen (orden del listado); cuando se envía (clientes legacy / import)
se materializa además el resto de ese mes.

La vigencia real la da una **ventana rodante de materialización**: los
`Class` se crean desde hoy UTC hasta el último día del mes siguiente,
en create, al agregar horarios (`addSlots`), al reactivar una serie
inactiva y mediante un job diario `academies.class_materialization`
registrado en `ScheduledJob` (default cron `30 3 * * *`) que materializa
la ventana para todos los slots de series activas. La materialización
SHALL ser idempotente (descancela existentes, crea solo faltantes, sin
duplicar slot+fecha).

La serie solo deja de generar clases cuando `active=false`
(desactivación o eliminación de slot cancelan las clases futuras y
devuelven las reservas; comportamiento existente).

#### Scenario: crear sin mes

- **GIVEN** un owner que crea una serie sin `month`
- **WHEN** el POST se ejecuta
- **THEN** se materializan las clases de sus slots desde hoy hasta fin
  del mes siguiente y la serie queda activa sin vigencia límite

#### Scenario: rollover mensual

- **GIVEN** una serie activa con slot los martes creada en octubre
- **WHEN** corre el job diario en noviembre
- **THEN** existen clases de esa serie hasta fin de diciembre sin
  duplicar las ya creadas

#### Scenario: desactivar detiene la materialización

- **GIVEN** una serie con `active=false`
- **WHEN** corre el job diario
- **THEN** no se materializan clases nuevas para sus slots

### Requirement: Cupos y modalidad a nivel de serie

Los cupos (`quorum`) y las modalidades (`typeIds`) SHALL definirse una
sola vez a nivel serie; `series.quorum` override del
`defaultQuorum` de la academia, `series.types` para las modalidades.
Los horarios semanales (slots) MUST NOT aceptar `capacity` ni `typeIds`
propios en la API ni exponerlos en la UI: un slot define `weekday`,
`startTime`, `endTime` e `instructorId` opcional (override docente del
horario).

Las columnas legacy (`ClassSlot.capacity`, `ClassSlotType`) MAY seguir
existiendo para datos históricos, pero el contrato nuevo no las
escribe; el quórum efectivo se resuelve `slot.capacity ?? series.quorum
?? academy.defaultQuorum` como hoy.

#### Scenario: agregar segundo horario

- **GIVEN** una serie con un horario martes 19:00
- **WHEN** el owner agrega un horario jueves 20:00
- **THEN** el payload solo lleva `weekday`, `startTime`, `endTime` (+
  `instructorId` opcional) y el slot hereda cupos y modalidad de la
  serie

### Requirement: Formulario de nueva serie

El formulario de `/academia/series/nueva` MUST NOT incluir el input de
mes de vigencia ni el botón Cancelar (el regreso lo provee el chrome:
back del appbar/ConsoleHeader). El título contextual de la página SHALL
ser "Nueva serie de clases".

#### Scenario: crear serie

- **GIVEN** el owner en `/academia/series/nueva`
- **WHEN** la página carga
- **THEN** el título dice "Nueva serie de clases", no hay campo de mes,
  los horarios solo piden día/hora/instructor, y no existe botón
  Cancelar

### Requirement: Borrado lógico de series

`DELETE /academies/:id/series/:seriesId` SHALL realizar un borrado
lógico: persiste `deletedAt` y `active=false`, cancela las clases
futuras y devuelve las reservas BOOKED/WAITLIST (comportamiento de
cancelación existente). Una serie eliminada MUST NOT aparecer en
`GET /academies/:id/series` ni en los endpoints de detalle de consola
(`GET .../series/:seriesId`, `GET .../series/:seriesId/classes`
responden 404). La fila SHALL seguir existiendo para analítica y
auditoría; `PATCH {active:true}` la restaura (`deletedAt=null`) y
rematerializa la ventana rodante.

#### Scenario: eliminar clase

- **GIVEN** una serie activa con clases futuras
- **WHEN** el owner ejecuta DELETE
- **THEN** la serie queda `active=false` + `deletedAt` set, desaparece
  del listado de Clases y sus reservas futuras se cancelan con refund

#### Scenario: restaurar desde API

- **GIVEN** una serie con `deletedAt` set
- **WHEN** se ejecuta PATCH `{active:true}`
- **THEN** `deletedAt` vuelve a null, la serie reaparece en el listado
  y se rematerializa la ventana rodante

### Requirement: Filtros ampliados del listado

`GET /academies/:id/series` SHALL aceptar además `levelId` y `typeId`
(exactos; `typeId` matchea `types.some`). La UI de Clases muestra
**solo activas por defecto** (`status=active` inicial) y los filtros
de modalidad y nivel junto a la búsqueda.

#### Scenario: filtrar por modalidad

- **GIVEN** series con modalidades distintas
- **WHEN** el owner filtra `typeId=<shines>`
- **THEN** solo listan las series que incluyen esa modalidad

### Requirement: Detalle de clase (serie)

El card de clase en el listado MUST NOT mostrar acciones visibles
(editar, desactivar, reactivar, eliminar, agregar/quitar horario); el
tap navega al detalle `/academia/series/[id]`, que concentra: datos,
edición (formulario existente), gestión de horarios (agregar/quitar),
desactivar/reactivar/eliminar, próximas clases con reservas y clases
pasadas con asistencia + profesor efectivo.

`GET /academies/:id/series/:seriesId/classes` SHALL devolver
`upcoming` (futuras no canceladas, asc) y `past` (desc), cada una con
`bookedCount`, `attendanceCount` e `instructorName` (override clase >
slot > serie).

#### Scenario: entrar a una clase

- **GIVEN** el listado de Clases
- **WHEN** el owner toca un card
- **THEN** navega a su detalle con acciones, horarios, próximas clases
  con reservas e historial con asistencia

### Requirement: Asistencia la marca el profesor

Marcar presente SHALL ser exclusivo del instructor efectivo de la
clase (cualquier instructor del plantel: `class.instructorId`,
`ClassInstructor`, `slot.instructorId`, `ClassSlotInstructor` o el
instructor por defecto de la serie) o un admin de plataforma; el
owner de la academia MUST NOT registrar asistencia.
`POST /classes/:id/attendance {personId}` exige que el alumno tenga
reserva `BOOKED` en esa clase; duplicado → 409.
`POST /academies/:id/attendance` (legacy) aplica la misma regla de
instructor/admin sobre el slot.

La asistencia SHALL poder marcarse únicamente dentro de la ventana
`[inicio - 30min, inicio + 30min]` donde `inicio` es
`classStart(class.date, slot.startTime)`. Fuera de la ventana
`POST /classes/:id/attendance` SHALL responder 400
`attendance.out_of_window`. `GET /classes/:id/roster` SHALL incluir
`canMark` (caller es instructor del plantel o admin), `attended` por
reserva y `attendanceWindow {opensAt, closesAt}` para que la consola
habilite el control solo dentro de la ventana. Cada alumno reservado
en el roster SHALL enlazar a su ficha `/academia/alumnos/:personId`.

Una reserva sin asistencia marcada SHALL permanecer `BOOKED`: el
alumno figura como no confirmado, pero su cupo sigue contando en
`bookedCount` (quórum) y el crédito de su plan permanece consumido;
la asistencia nunca libera cupo.

#### Scenario: profe marca presente

- **GIVEN** el instructor de la clase en su roster con reservas BOOKED
  y la hora actual dentro de `[inicio-30min, inicio+30min]`
- **WHEN** marca "Presente" sobre un alumno
- **THEN** se crea la asistencia; un segundo intento responde 409

#### Scenario: marcación fuera de ventana

- **GIVEN** una clase que empieza en más de 30 minutos (o empezó hace
  más de 30)
- **WHEN** el instructor intenta registrar asistencia
- **THEN** la API responde 400 `attendance.out_of_window` y el roster
  no muestra el control habilitado

#### Scenario: ausente sin marcar conserva cupo

- **GIVEN** un alumno BOOKED que nunca fue marcado presente
- **WHEN** la ventana de asistencia cierra
- **THEN** la reserva sigue `BOOKED`, el cupo quedó consumido y la UI
  lo muestra como no confirmado

#### Scenario: owner no puede marcar

- **GIVEN** el owner de la academia en el roster de una clase
- **WHEN** intenta registrar asistencia
- **THEN** la API responde 403 y la UI no muestra el control
  (`canMark=false`)

### Requirement: Importar clases desde Clases

La carga masiva CSV de horarios (ImportCard kind="schedule") SHALL
vivir en la página de Clases junto a los filtros como acción
"Importar clases"; las páginas standalone `/academia/horarios` y
`/academia/asistencia` se eliminan (redirect a `/academia/series`).

#### Scenario: importar desde Clases

- **GIVEN** el owner en Clases
- **WHEN** abre "Importar clases" y sube el CSV
- **THEN** las series se crean/actualizan agrupadas por nombre y se
  materializan en la ventana rodante

### Requirement: Plantel multi-profesor por horario y clase

Un `ClassSlot` SHALL admitir un plantel de uno o más instructores
(`ClassSlotInstructor`: `slotId` + `personId`), además del instructor
principal (`instructorId`, que se conserva como el profesor referente
para comisiones, encuestas y liquidación).

Al materializar clases desde el slot SHALL copiarse el plantel completo
a la instancia (`ClassInstructor`: `classId` + `personId`), de modo que
cada clase refleje a todos sus profesores y no solo al principal.

La consola del instructor SHALL listar las clases donde la persona es
instructora principal O co-instructora (por `Class.instructorId`,
`ClassInstructor`, `ClassSlot.instructorId`, `ClassSlotInstructor` o el
instructor por defecto de la serie).

Las lecturas que exponen el profesor de una clase/serie SHALL incluir la
lista completa de instructores (principal primero), sin romper el campo
singular existente para clientes que solo muestran uno.

#### Scenario: co-teaching en un slot

- **GIVEN** un slot sábado 17:00 con María como instructora principal y
  Eduardo como co-instructor
- **WHEN** se materializan las clases del slot
- **THEN** cada `Class` tiene `instructorId` = María y un
  `ClassInstructor` por cada uno (María y Eduardo)

#### Scenario: mis clases del co-instructor

- **GIVEN** Eduardo es co-instructor (no principal) del slot de sábado
- **WHEN** consulta su consola de instructor
- **THEN** las clases de sábado aparecen en su listado de "mis clases"

#### Scenario: lecturas singulares intactas

- **GIVEN** una clase con dos instructores
- **WHEN** se calcula la comisión del mes o la encuesta de instructor
- **THEN** el sistema usa el instructor principal (`instructorId`), sin
  duplicar ni repartir montos/evaluaciones

### Requirement: Notificación al asignar instructor

Cuando una persona queda asignada como instructora de una serie u
horario; `POST /academies/:id/series` (instructor de serie o de
slot), `PATCH /academies/:id/series/:seriesId` (cambio de instructor
de serie o `addSlots` con instructor) o importación de horarios; el
sistema SHALL emitir una notificación `class.instructor_assigned` al
instructor asignado con título `Te asignaron una clase` y body
`{serie} · {academia}`.

Solo las asignaciones nuevas notifican: un PATCH que no cambia el
instructor SHALL NOT re-notificar. La notificación SHALL ser
best-effort post-commit (`notifySafe`) y MUST NOT abortar la
operación de escritura.

#### Scenario: asignación por PATCH

- **GIVEN** una serie cuyo instructor cambia de A a B
- **WHEN** el PATCH se confirma
- **THEN** B recibe `class.instructor_assigned` con la serie y
  academia; A no recibe nada

#### Scenario: import masivo

- **GIVEN** un CSV de horarios con instructor por línea
- **WHEN** el import crea los slots
- **THEN** cada instructor distinto recibe una notificación por serie
  asignada

### Requirement: Recordatorios previos a la clase

Un job `academies.class_reminders` registrado en `ScheduledJob`
(cron `* * * * *`) SHALL notificar a los destinatarios de cada clase
no cancelada a los 30 y a los 10 minutos del inicio real
(`classStart(class.date, slot.startTime)`).

Destinatarios: el plantel completo (instructor principal +
co-instructores de clase, slot y default de serie) y los alumnos con
reserva `BOOKED` (WAITLIST/ATTENDED/cancelados MUST NOT ser
notificados). Una clase ya iniciada MUST NOT generar recordatorios.

La notificación SHALL usar `type="class.reminder"` con
`data {classId, minutes, url}` donde `url` es `/academia/clases/:id`
para instructores y `/clases/:id` para alumnos. El título SHALL ser
`Faltan {minutes} minutos para tu clase` y el body `{serie} {nivel}
en {academia}` (nivel omitido si la serie no lo tiene).

El envío SHALL ser idempotente por `(personId, classId, minutes)`:
una segunda corrida dentro de la misma ventana MUST NOT duplicar
notificaciones.

#### Scenario: 30 minutos antes

- **GIVEN** una clase que empieza en 25 minutos con un instructor y
  dos alumnos BOOKED
- **WHEN** corre el job
- **THEN** instructor y ambos alumnos reciben
  `Faltan 30 minutos para tu clase` con serie, nivel y academia en el
  body; la alumna en WAITLIST no recibe nada

#### Scenario: dedupe por corrida

- **GIVEN** una clase cuyo recordatorio de 30 minutos ya fue enviado
- **WHEN** el job corre de nuevo dentro de la misma ventana
- **THEN** no se emiten notificaciones nuevas para ese offset

#### Scenario: 10 minutos también llega

- **GIVEN** una clase que empieza en 8 minutos
- **WHEN** corre el job
- **THEN** emite los recordatorios de 10 min (y el de 30 si aún no se
  envió)

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
