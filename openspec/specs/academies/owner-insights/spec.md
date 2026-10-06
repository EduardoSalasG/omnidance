# academies/owner-insights Specification

## Purpose
TBD - created by archiving change academy-operations-insights. Update Purpose after archive.

## Requirements

### Requirement: Directorio público mínimo de academias

`GET /academies/public` SHALL responder sin sesión la lista de
academias activas (`active: true` y sin `billingBlockedAt`) con solo
`{id, name, styles}` — los estilos se derivan de sus series activas,
deduplicados y ordenados alfabéticamente. MUST NOT exponer dirección,
instructores, métricas ni datos de alumnos.

#### Scenario: respuesta mínima

- **WHEN** un cliente anónimo consulta `GET /academies/public`
- **THEN** recibe 200 con `{id, name, styles: [{id, name}]}` por
  academia activa, ordenadas por nombre
- **AND** academias inactivas o bloqueadas por mora no aparecen

### Requirement: Planes por vencer en el dashboard

`GET /academies/:id/dashboard` SHALL incluir `expiringEnrollments`:
inscripciones con status ACTIVE, TRIAL u ONLINE cuyo `endsAt` cae entre
hoy y `academy.insights.expiring_days` (param, default 14) días
adelante, ordenadas por `endsAt` ascendente. Cada ítem SHALL incluir
`{personId, personName, planName, status, endsAt}`; `planName` es null
si la inscripción no tiene plan.

#### Scenario: alumno con plan por vencer

- **GIVEN** una inscripción ACTIVE con `endsAt` en 10 días
- **WHEN** el owner consulta el dashboard
- **THEN** `expiringEnrollments` la lista con nombre, plan y fecha

#### Scenario: filtros de la lista

- **WHEN** una inscripción tiene `endsAt` null, ya vencido, más allá de
  la ventana, o status PAUSED/FROZEN
- **THEN** no aparece en `expiringEnrollments`

### Requirement: Cumpleaños próximos en el dashboard

`GET /academies/:id/dashboard` SHALL incluir `upcomingBirthdays`:
personas con al menos una inscripción en la academia cuyo próximo
cumpleaños (día/mes de `birthDate`, ignorando el año) cae dentro de
`academy.insights.birthday_days` (param, default 30) días, ordenadas
por días restantes. Cada ítem SHALL incluir `{personId, name, date}`
donde `date` es el día/mes del cumpleaños de este año (o del siguiente
si ya pasó); el año de nacimiento MUST NOT exponerse. Una persona con
varias inscripciones aparece una sola vez.

#### Scenario: cumpleaños dentro de la ventana

- **GIVEN** un alumno con `birthDate` 15 de marzo y hoy es 1 de marzo
- **WHEN** el owner consulta el dashboard
- **THEN** `upcomingBirthdays` lo lista con `date` 15 de marzo

#### Scenario: cambio de año

- **GIVEN** un alumno con `birthDate` 5 de enero y hoy es 20 de
  diciembre
- **WHEN** el owner consulta el dashboard
- **THEN** lo lista con `date` 5 de enero del año siguiente

#### Scenario: sin birthDate

- **WHEN** un alumno no declaró `birthDate`
- **THEN** no aparece en `upcomingBirthdays`

### Requirement: Listas de insights en la consola

El hub `/academia` SHALL mostrar debajo de "Hoy" una lista "Planes por
vencer" cuando `expiringEnrollments` no está vacía y una lista
"Cumpleaños próximos" cuando `upcomingBirthdays` no está vacía. Cada
fila SHALL enlazar a la ficha del alumno
(`/academia/alumnos/[personId]`). Secciones vacías MUST NOT
renderizarse.

#### Scenario: renderizado condicional

- **WHEN** hay 2 planes por vencer y ningún cumpleaños próximo
- **THEN** se ve "Planes por vencer" con 2 filas y no existe la
  sección de cumpleaños
