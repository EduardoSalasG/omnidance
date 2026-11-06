# Delta: academies/private-lesson-product

## ADDED Requirements

### Requirement: Orden y paginación del listado staff

`GET /academies/:id/private-lessons` SHALL ordenar el listado staff de
más reciente a más antigua por `scheduledAt` (desempate
`createdAt`); las lecciones sin agendar (`scheduledAt` null) SHALL
aparecer primero como cola accionable. La UI SHALL paginar con la
regla compartida de listas pesadas (20 desktop / 10 mobile).

#### Scenario: cola mixta

- **GIVEN** lecciones CONFIRMED de la semana próxima, una DONE de ayer
  y una REQUESTED comprada sin fecha
- **WHEN** el owner abre `/academia/particulares` sin filtros
- **THEN** la sin agendar aparece primero y el resto se ordena de la
  más lejana a la más antigua

### Requirement: Refetch sin parpadeo

Al cambiar filtros o página, la vista SHALL conservar los datos
previos renderizados mientras responde el fetch (lista con
`aria-busy` + dim, KPIs de la cola sin desmontar); el skeleton solo
aparece en la carga inicial sin datos.

#### Scenario: cambio de filtro con datos en pantalla

- **GIVEN** la lista ya cargada con 15 lecciones
- **WHEN** el owner elige otro estado en el FilterBar
- **THEN** las cards previas permanecen visibles (atenuadas) hasta que
  llega la nueva página, sin skeleton intermedio

### Requirement: Cancelación en la esquina de la card

El botón "Cancelar" de cada card SHALL vivir en la fila superior, a
la derecha junto al precio (fuera del action row de gestión), con su
`ConfirmSheet` existente.

#### Scenario: card de una lección cancelable

- **GIVEN** una lección CONFIRMED cancelable por el owner
- **WHEN** se renderiza la card
- **THEN** el control "Cancelar" está en la esquina superior derecha
  junto al `PriceTag` y las acciones assign/confirm/reschedule quedan
  en el action row
