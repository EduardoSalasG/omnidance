# academies/course-surveys Specification

## Purpose
TBD - created by archiving change academy-console-v3. Update Purpose after archive.

## Requirements

### Requirement: Encuesta mensual de curso y profesor

El sistema SHALL ofrecer una encuesta mensual por alumno × serie cursada,
análoga a la encuesta post-evento: puntaje del curso (1-5, obligatorio),
puntaje del profesor (1-5, opcional) y observaciones (texto opcional,
máx. 500 caracteres). Una respuesta por alumno/serie/mes
(`@@unique([personId, seriesId, month])`); re-envíos son idempotentes
(upsert). La elegibilidad exige al menos una asistencia registrada a una
clase no cancelada de la serie dentro del mes evaluado.

#### Scenario: Job mensual notifica a alumnos elegibles

- **GIVEN** el job `academies.course_surveys` corre el día 1 a las 10:00
- **WHEN** un alumno asistió a ≥1 clase no cancelada de una serie el mes
  anterior
- **THEN** recibe una notificación `academy.courseSurvey` por cada serie
  cursada con `academyId`, `seriesId`, `seriesName` y `month`
- **AND** las encuestas ya respondidas no se re-notifican

#### Scenario: El alumno responde la encuesta

- **GIVEN** el alumno tiene asistencias a la serie en el mes evaluado
- **WHEN** POST `/me/course-surveys` con `seriesId`, `month` (YYYY-MM),
  `course` 1-5 y opcional `instructor` 1-5 + `comment`
- **THEN** se persiste la encuesta con `instructorId` resuelto del slot
  más frecuente (override clase > slot > serie)
- **AND** un segundo POST para la misma serie/mes actualiza la respuesta
  (upsert)

#### Scenario: Alumno sin asistencias en el mes

- **WHEN** POST `/me/course-surveys` para una serie sin asistencias del
  alumno en ese mes
- **THEN** responde 403

### Requirement: Resultados agregados y anónimos (owner/admin)

Los resultados SHALL ser visibles solo para el owner de la academia o
ADMIN, SIEMPRE agregados por mes × serie: promedio del curso, promedio
del profesor (cuando exista), conteo de respuestas y lista de
comentarios. NINGÚN endpoint expone `personId`, nombre ni identidad del
evaluador.

Ambos listados aceptan `?limit=` con el mismo contrato: entero,
default 12, máximo 60; un valor inválido cae al default. El cap se
aplica sobre los grupos ya agregados (mes × serie), conservando el
orden por mes descendente.

#### Scenario: Owner consulta encuestas de una serie

- **WHEN** GET `/academies/:id/surveys?seriesId=…&month=…`
- **THEN** responde los grupos `{seriesId, seriesName, month, count,
  avgCourse, avgInstructor, comments[]}` ordenados por mes desc
- **AND** los comentarios no llevan autor

#### Scenario: Owner limita la cantidad de grupos

- **WHEN** GET `/academies/:id/surveys?limit=2` y la academia tiene
  más de dos grupos mes × serie
- **THEN** responde solo los 2 grupos más recientes
- **AND** sin `limit` responde como máximo 12 grupos; `limit` mayor a
  60 se capa en 60

#### Scenario: Owner consulta encuestas de un profesor

- **WHEN** GET `/academies/:id/instructors/:personId/surveys`
- **THEN** responde los mismos grupos filtrados por el `instructorId`
  snapshoteado en cada encuesta

#### Scenario: Staff sin ser owner

- **WHEN** un staff con `attendance`/`students` pero sin `requireAdminister`
  consulta los endpoints de encuestas
- **THEN** responde 403 y el front oculta la sección

### Requirement: Card de encuesta pendiente solo en el apartado Academia

La card de encuesta mensual pendiente ("¿Cómo estuvo [serie]?") SHALL
mostrarse únicamente en el apartado **Academia** del inicio del
bailarín (`activeRole === "DANCER"` con `viewMode === "academy"`).
Las consolas de otros roles (owner, instructor, productor, admin)
MUST NOT mostrarla aunque la persona tenga una encuesta pendiente; la
notificación `academy.courseSurvey` sigue siendo el canal de aviso.

#### Scenario: Alumno en lente Academia

- **GIVEN** un alumno con encuesta de curso pendiente
- **WHEN** abre `/inicio` con la lente bailarín en modo Academia
- **THEN** ve la card que lleva a la encuesta de la serie

#### Scenario: Mismo alumno en lente Social

- **WHEN** el mismo alumno cambia el inicio a modo Social
- **THEN** la card de encuesta de curso no aparece

### Requirement: Notificación de encuesta de curso en la lente Academia

La notificación `academy.courseSurvey` SHALL clasificarse en la lente
`academy` (`NOTIFICATION_LENS_TYPES`): aparece en /notificaciones y en
el badge no leído solo cuando la lente activa es Academia, igual que
las demás notificaciones de dominio academia.

#### Scenario: Badge por lente

- **GIVEN** un alumno con una notificación `academy.courseSurvey` no
  leída
- **WHEN** alterna entre las lentes Social y Academia
- **THEN** la cuenta y la lista la muestran solo en Academia

### Requirement: Resultados por instructor acotados

`GET /academies/:id/instructors/:personId/surveys` SHALL acotar su
respuesta: los comentarios por grupo (mes×serie) se capan server-side
(p.ej. 50 por grupo) y el endpoint acepta un parámetro `limit` de
grupos con default acotado, para que un profesor con años de historia
no devuelva un payload no acotado. La ficha del profesor renderiza
preview + "Ver todo" sobre los grupos y sobre los comentarios de cada
grupo.

#### Scenario: historial largo de encuestas

- **GIVEN** un profesor con 40 grupos mes×serie y 80 comentarios en
  uno
- **WHEN** el owner abre su ficha
- **THEN** la sección muestra el preview expandible y el backend nunca
  devuelve más del cap de comentarios por grupo
