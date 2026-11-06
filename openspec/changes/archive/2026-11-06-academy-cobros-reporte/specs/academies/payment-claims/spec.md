# Delta: academies/payment-claims

## MODIFIED Requirements

### Requirement: Medios de pago configurables por academia

El owner/admin SHALL administrar los métodos de pago de su academia con
CRUD bajo `AcademyAccess.requireAdminister`. Cada método tiene `type`
(TRANSFER | PAYMENT_LINK | CASH), `label`, `details` (JSON: datos
bancarios en TRANSFER, `url` en PAYMENT_LINK, instrucciones en CASH) y
`active`. La terminología visible SHALL ser "método de pago" en toda la
superficie (consola y checkout del alumno).

`GET /academies/:id/payment-methods` SHALL responder a cualquier
usuario con sesión la lista de métodos `active` en orden de llegada
(`order` legacy, luego `createdAt`; el formulario ya no expone `order`).
Los campos `details` se devuelven completos (son datos que la academia
quiere difundir a sus alumnos).

#### Scenario: alumno ve cómo pagar

- **GIVEN** una academia con método TRANSFER activo con datos bancarios
- **WHEN** un alumno con sesión consulta `GET /academies/:id/payment-methods`
- **THEN** recibe `{id, type, label, details}` del método en orden de
  llegada

#### Scenario: métodos inactivos ocultos

- **WHEN** un método tiene `active: false`
- **THEN** no aparece en el listado del alumno pero sí en el CRUD del owner

#### Scenario: CRUD solo del owner

- **WHEN** un usuario sin `requireAdminister` intenta POST/PATCH/DELETE
- **THEN** recibe 403

#### Scenario: alta sin campo orden

- **WHEN** el owner crea un método de pago desde
  `/academia/configuracion/metodos-de-pago/nuevo`
- **THEN** el formulario no pide `order` y el método queda al final del
  listado visible para el alumno

## ADDED Requirements

### Requirement: Etiquetas humanas de método de pago

Toda superficie de la consola de cobros (colas, historial, reporte y
detalle del cobro) SHALL mostrar el método de pago con etiqueta humana
i18n, nunca el valor crudo de la pasarela (`credit_card`,
`bank_transfer`, `visa`, …) ni el nombre interno del gateway (`FLOW`,
`MANUAL`, `MERCADOPAGO`, …). Los métodos propios de la academia ya
viajan con `methodLabel` del owner y se muestran verbatim.

#### Scenario: medio reportado por la pasarela

- **GIVEN** un cobro cuyo `gatewayMedia` es `credit_card`
- **WHEN** el owner lo ve en el reporte o en el detalle del cobro
- **THEN** la etiqueta visible es "Tarjeta de crédito"

#### Scenario: valor desconocido

- **WHEN** la pasarela reporta un medio sin mapeo en el catálogo
- **THEN** la superficie muestra el valor tal cual (fallback visible,
  no vacío)

### Requirement: Colas de validación como superficie operativa

Las colas de `/academia/cobros` SHALL ser superficies operativas:
comprobantes PENDING accionables primero, seguimiento AWAITING e
historial resuelto acotado (preview + "Ver todo" in-place) sin buscador
propio - la búsqueda histórica vive en `/academia/cobros/reporte`.

La cola de comprobantes de órdenes MEMBERSHIP manuales SHALL
presentarse como "Inscripciones por validar" (cubre alta y renovación
por transferencia) y la de claims de pago único como "Pagos por
validar" - la forma "por validar" es la única usada en la superficie
de cobros, incluido el KPI del inicio.

#### Scenario: cobros sin filtros de cola

- **WHEN** el owner abre `/academia/cobros`
- **THEN** ve KPIs, planes que vencen y las colas accionables, sin
  FilterBar en las colas ni sección de historial unificado

#### Scenario: deep-link a la ficha conserva origen

- **GIVEN** el owner abre un comprobante desde `/academia/cobros/reporte`
- **WHEN** vuelve con el back del `ConsoleHeader`
- **THEN** aterriza en `/academia/cobros/reporte`, no en
  `/academia/cobros`
