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

#### Scenario: Owner consulta encuestas de una serie

- **WHEN** GET `/academies/:id/surveys?seriesId=…&month=…`
- **THEN** responde los grupos `{seriesId, seriesName, month, count,
  avgCourse, avgInstructor, comments[]}` ordenados por mes desc
- **AND** los comentarios no llevan autor

#### Scenario: Owner consulta encuestas de un profesor

- **WHEN** GET `/academies/:id/instructors/:personId/surveys`
- **THEN** responde los mismos grupos filtrados por el `instructorId`
  snapshoteado en cada encuesta

#### Scenario: Staff sin ser owner

- **WHEN** un staff con `attendance`/`students` pero sin `requireAdminister`
  consulta los endpoints de encuestas
- **THEN** responde 403 y el front oculta la sección
