# Delta — academies/console-lists (academy-console-v3)

Capacidad nueva: contrato de paginación de listados de consola.

## ADDED Requirements

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

Cuando un filtro de búsqueda (`q`) depende de un join (nombre de
persona vía FK plana), el endpoint SHALL resolver los IDs que matchean
antes de paginar — paginar y filtrar después produce páginas vacías
incorrectas.

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

#### Scenario: pageSize por sobre el tope

- **GIVEN** un picker que pide `pageSize=500`
- **WHEN** el endpoint lo procesa
- **THEN** `pageSize` se capa a su máximo y la respuesta lo refleja

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
