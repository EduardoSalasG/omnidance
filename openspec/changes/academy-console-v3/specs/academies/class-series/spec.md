# Delta — academies/class-series (academy-console-v3)

## ADDED Requirements

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
clase (`class.instructorId ?? slot.instructorId ?? series.instructorId`)
o un admin de plataforma — el owner de la academia MUST NOT registrar
asistencia. `POST /classes/:id/attendance {personId}` exige que el
alumno tenga reserva `BOOKED` en esa clase; duplicado → 409.
`POST /academies/:id/attendance` (legacy) aplica la misma regla de
instructor/admin sobre el slot.

`GET /classes/:id/roster` SHALL incluir `canMark` (caller es el
instructor efectivo o admin) y `attended` por reserva, para que la
consola del instructor muestre el control "Presente" por alumno.

#### Scenario: profe marca presente

- **GIVEN** el instructor de la clase en su roster con reservas BOOKED
- **WHEN** marca "Presente" sobre un alumno
- **THEN** se crea la asistencia; un segundo intento responde 409

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
