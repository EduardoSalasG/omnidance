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
devuelven las reservas — comportamiento existente).

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
sola vez a nivel serie — `series.quorum` override del
`defaultQuorum` de la academia, `series.types` para las modalidades.
Los horarios semanales (slots) MUST NOT aceptar `capacity` ni `typeIds`
propios en la API ni exponerlos en la UI: un slot define `weekday`,
`startTime`, `endTime` e `instructorId` opcional (override docente del
horario).

Las columnas legacy (`ClassSlot.capacity`, `ClassSlotType`) MAY seguir
existiendo para datos históricos, pero el contrato nuevo no las
escribe — el quórum efectivo se resuelve `slot.capacity ?? series.quorum
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
(editar, desactivar, reactivar, eliminar, agregar/quitar horario) — el
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
instructor por defecto de la serie) o un admin de plataforma — el
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
`bookedCount` (quórum) y el crédito de su plan permanece consumido —
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
"Importar clases" — las páginas standalone `/academia/horarios` y
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
horario — `POST /academies/:id/series` (instructor de serie o de
slot), `PATCH /academies/:id/series/:seriesId` (cambio de instructor
de serie o `addSlots` con instructor) o importación de horarios — el
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
