# academies/console-lists Specification

## Purpose
TBD - created by archiving change academy-console-v3. Update Purpose after archive.

## Requirements

### Requirement: Envelope paginado en endpoints de listado

Los endpoints de listado de la consola SHALL aceptar `page` y
`pageSize` (opcionales) y responder `{items, total, page, pageSize}` —
ninguna vista operativa descarga la tabla completa. `page` se
normaliza a ≥1 (default 1); `pageSize` se normaliza a ≥1 (default 25)
y se capa a un máximo por endpoint (100 por defecto; 200 en claims).
Valores no numéricos caen al default sin error. Los filtros
existentes (q, status, enums, fechas) SHALL aplicarse antes de
paginar: el `total` refleja el filtro, no la tabla entera.

Endpoints cubiertos (además de los ya existentes en otros cambios):

- `GET /academies/:id/students`
- `GET /academies/:id/plans`
- `GET /academies/:id/series`
- `GET /academies/:id/staff`
- `GET /academies/:id/instructors`
- `GET /academies/:id/private-lessons`
- `GET /academies/:id/claims` (pageSize máx 200)
- `GET /payments/by-academy/:academyId`
- `GET /producer/claims` (conserva la clave `claims` + total/page/pageSize)
- `GET /crm/people` (agrega filtros server-side `q`/`segment`/`tag` y
  devuelve `segmentCounts`/`allTags` del universo completo)
- `GET /crm/campaigns`
- `GET /events/mine` (stats por evento sobre los ids de la página)
- `GET /discount-codes`
- `GET /events/:id/guest-lists`
- `GET /academies/:id/videos`

Cuando un filtro de búsqueda (`q`) depende de un join (nombre de
persona vía FK plana), el endpoint SHALL resolver los IDs que matchean
antes de paginar — paginar y filtrar después produce páginas vacías
incorrectas. Cuando el filtro se resuelve en memoria tras el join
(`guest-lists`: q sobre dueño/invitado/etiqueta), el corte de página
SHALL aplicarse sobre el resultado ya filtrado y el `total` refleja
ese universo.

#### Scenario: primera página por defecto

- **GIVEN** 60 alumnos activos
- **WHEN** la UI pide `GET /students` sin params
- **THEN** responde `{items: ≤25, total: 60, page: 1, pageSize: 25}`

#### Scenario: filtro antes de paginar

- **GIVEN** 60 alumnos, 7 con plan "Mensual"
- **WHEN** se pide `GET /students?planId=X&pageSize=25`
- **THEN** `total=7` e `items` trae solo los del plan

#### Scenario: búsqueda por nombre paginada

- **GIVEN** 30 staff y 5 cuyo nombre contiene "maría"
- **WHEN** se pide `GET /staff?q=maría&page=1&pageSize=4`
- **THEN** `total=5` e `items` trae 4 personas maría (no 4 staff
  cualquiera filtrados después)

#### Scenario: eventos del productor paginados

- **GIVEN** un productor con 30 eventos
- **WHEN** pide `GET /events/mine?page=2&pageSize=25`
- **THEN** responde `{items: 5, total: 30, page: 2, pageSize: 25}` y
  cada item trae sus `stats` calculados sobre los ids de la página

#### Scenario: guest-lists con q post-join

- **GIVEN** un evento con 10 listas, 3 que calzan `q=maría`
- **WHEN** se pide `GET /events/:id/guest-lists?q=maría`
- **THEN** `total=3` e `items` contiene las 3 listas que calzan

#### Scenario: videos paginados con máscara locked

- **GIVEN** un alumno sin acceso a videos restringidos
- **WHEN** pide `GET /academies/:id/videos?page=1`
- **THEN** `items` trae la página con la máscara locked aplicada por
  item y `total` del universo filtrado

#### Scenario: picker con pageSize acotado

- **GIVEN** un selector de eventos que necesita el universo
- **WHEN** pide `GET /events/mine?pageSize=100`
- **THEN** recibe hasta 100 eventos más recientes por `startsAt` desc

#### Scenario: pageSize por sobre el tope

- **GIVEN** un picker que pide `pageSize=500`
- **WHEN** el endpoint lo procesa
- **THEN** `pageSize` se capa a su máximo y la respuesta lo refleja

#### Scenario: filtrar resetea la página

- **GIVEN** el productor en página 3 de eventos
- **WHEN** cambia el filtro de estado
- **THEN** la vista vuelve a `page=1` y recarga

### Requirement: Pager compartido en vistas de listado

Las vistas de listado de la consola SHALL renderizar el componente
`Pager` (prev/next + "Página X de Y" + total) y resetear la página a 1
ante cualquier cambio de filtro u orden. Los consumidores que
necesitan el universo completo (pickers, selects de audiencia) SHALL
pedir un `pageSize` acotado explícito o usar un endpoint de detalle —
no recorrer la lista.

#### Scenario: cambiar de página

- **GIVEN** la lista de alumnos con total > pageSize
- **WHEN** el owner presiona "Siguiente"
- **THEN** se pide `page=2` con los mismos filtros y se renderiza la
  segunda página

#### Scenario: filtrar resetea la página

- **GIVEN** el owner en página 3 de alumnos
- **WHEN** cambia el filtro de estado
- **THEN** la vista vuelve a `page=1` y recarga
