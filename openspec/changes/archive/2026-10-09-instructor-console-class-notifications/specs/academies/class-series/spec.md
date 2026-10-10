# Delta: academies/class-series

## MODIFIED Requirements

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

## ADDED Requirements

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
