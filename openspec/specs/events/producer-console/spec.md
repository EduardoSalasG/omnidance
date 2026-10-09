# events/producer-console Specification

## Purpose
TBD - created by archiving change console-parity-v5. Update Purpose after archive.

## Requirements

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

#### Scenario: ficha de un elemento del listado

- WHEN el productor activa el card de un código, lista de invitados,
  liquidación o comprobante
- THEN navega a una página de detalle con sus datos y las acciones
  relevantes (agregar invitado/emitir pase, aprobar/rechazar
  comprobante); las mutaciones no ocurren inline en el listado

#### Scenario: acción destructiva del evento

- WHEN el productor puede cancelar un evento
- THEN el botón de cancelar vive en una zona separada al pie de la
  ficha, con estilo destructivo y confirmación

### Requirement: Endpoints de ficha del productor

La API SHALL exponer los endpoints de detalle que las fichas consumen:
`GET /discount-codes/:id`, `GET /guest-lists/:id`,
`GET /producer/claims/:claimId`, `GET /me/payouts/:id` y `GET /me/payouts`
paginado con el envelope compartido `{items,total,page,pageSize}`.

#### Scenario: detalle de comprobante

- WHEN el productor pide el detalle de un comprobante de su cola
- THEN recibe datos del claim y de la orden origen (refId, canal,
  estado); un claim ajeno responde 404
