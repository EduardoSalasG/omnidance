# Delta: events/producer-console

## ADDED Requirements

### Requirement: Consola del productor con el patrón compartido

Los módulos del productor (eventos, listas de invitados, códigos de
descuento, cobros) DEBEN (SHALL) usar el mismo patrón de consola definido para
el dueño de academia: crear = botón → página dedicada, card completo
clickeable → detalle, edición y acciones destructivas en la ficha,
listas con FilterBar + Pager, skeletons y errores con retry.

#### Scenario: crear evento

- WHEN el productor presiona el CTA "Nuevo evento" en su listado
- THEN navega a una página dedicada de creación

#### Scenario: detalle de evento

- WHEN el productor activa el card de un evento en el listado
- THEN navega al detalle con datos, edición y acciones del evento

#### Scenario: listado paginado y filtrable

- WHEN el productor ve un módulo con listado
- THEN la lista usa FilterBar con el vocabulario del query engine y
  Pager compartido, con skeleton en carga y retry en error
