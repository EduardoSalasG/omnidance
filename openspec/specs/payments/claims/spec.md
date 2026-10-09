# payments/claims Specification

## Purpose
TBD - created by archiving change producer-own-methods. Update Purpose after archive.

## Requirements

### Requirement: Métodos de pago propios del productor

El sistema MUST permitir al productor aprobado configurar medios de
cobro propios (`TRANSFER`, `PAYMENT_LINK`, `CASH`) con `label` y
`details` (datos bancarios, URL o instrucciones). Los métodos activos
se exponen en el checkout de sus eventos y series; los detalles
sensibles solo se muestran al comprador en el contexto de su compra.

#### Scenario: CRUD del productor

- **WHEN** el productor crea/edita/desactiva un método desde
  `/producer/payment-methods`
- **THEN** persiste con `order` y `active`; solo él (o admin) puede
  gestionar sus métodos

#### Scenario: Visibilidad en checkout

- **WHEN** un comprador consulta `GET /events/:id/payment-methods`
- **THEN** recibe solo los métodos `active` del productor dueño del
  evento (eventos sin productor → lista vacía)

### Requirement: Orden por método propio (OWN_METHOD)

Cuando el comprador elige un método propio del productor en una orden
de ticket o series-pass, el checkout MUST crear el `Payment` PENDING
con `gateway:"MANUAL"`, `gatewayAccountId:null`, `feeMode:"OWN_METHOD"`
y el desglose congelado (`all-in − card%`), MUST NOT invocar pasarela
alguna, y MUST devolver las instrucciones del método en la respuesta.

#### Scenario: Checkout con methodId válido

- **WHEN** `POST /checkout/ticket {methodId}` con método activo del
  productor del evento
- **THEN** se crea `Payment` PENDING MANUAL/OWN_METHOD congelando el
  desglose y la respuesta trae `{method:{type,label,details}}` en vez
  de `paymentUrl`

#### Scenario: methodId ajeno o inactivo

- **WHEN** el `methodId` no pertenece al productor del evento/serie o
  está inactivo
- **THEN** 400 — nunca se cobra por un medio que el productor no
  declaró

#### Scenario: Órdenes de academia y suscripciones

- **WHEN** cualquier orden de academia o suscripción se crea
- **THEN** `methodId` no aplica — siguen por la pasarela/param de
  plataforma

### Requirement: Comprobante y aprobación

El comprador PUEDE subir un comprobante (`TicketClaim` PENDING) sobre
su propia orden MANUAL PENDING. El productor MUST poder aprobarlo (la
orden se liquida por el mismo `settle` del webhook →
tickets/mesa/código/ledger/notificación) o rechazarlo con motivo
obligatorio; el comprobante MUST servirse solo por endpoint
autenticado (comprador dueño, productor o admin).

#### Scenario: Subida de comprobante

- **WHEN** el dueño de una orden MANUAL PENDING sube `receipt` a
  `POST /payments/:id/claims`
- **THEN** se crea el claim PENDING con snapshot del método y se
  notifica al productor

#### Scenario: Claim sobre orden ajena o no-manual

- **WHEN** alguien que no es el comprador intenta crear el claim, o la
  orden no es `MANUAL`/`PENDING`
- **THEN** 403/409 — la evidencia solo se adjunta a la orden propia y
  pendiente

#### Scenario: Aprobación del productor

- **WHEN** el productor aprueba un claim PENDING
- **THEN** flip atómico a APPROVED + `settle(payment,"PAID")` → la
  orden emite exactamente lo que emitiría el webhook (ticket, pase,
  mesa, redención, ledger); el fee devengado queda en el libro como
  `OWN_METHOD` y se netea en el payout

#### Scenario: Rechazo con motivo

- **WHEN** el productor rechaza con `note`
- **THEN** claim REJECTED + notificación al comprador; la orden sigue
  PENDING y admite un nuevo comprobante

#### Scenario: Dos aprobaciones concurrentes

- **WHEN** dos requests aprueban el mismo claim a la vez
- **THEN** el flip atómico hace que solo uno gane; el otro ve 409 y el
  `settle` del perdedor no duplica emisión (idempotencia del settle)

### Requirement: Selector de método siempre visible en el checkout

El selector "cómo pagar" del checkout de eventos SHALL renderizarse
siempre — aunque el productor no tenga métodos propios activos — con
la pasarela de la plataforma como única opción seleccionada. El
comprador MUST poder ver con qué medio se realizará el cobro antes de
confirmar la orden.

#### Scenario: sin métodos propios

- **WHEN** el comprador abre el checkout de un evento cuyo productor
  no tiene métodos propios activos
- **THEN** el selector se muestra con la pasarela como única opción
  marcada (radio deshabilitable en `busy`, sin métodos extra)

#### Scenario: con métodos propios

- **WHEN** el productor tiene métodos propios activos
- **THEN** el selector ofrece pasarela + cada método propio y mantiene
  el comportamiento de selección existente
