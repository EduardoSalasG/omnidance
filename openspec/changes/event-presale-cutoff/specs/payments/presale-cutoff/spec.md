# Delta spec - payments/presale-cutoff

## ADDED Requirements

### Requirement: Corte de preventa resuelto en cadena

El sistema SHALL resolver el instante de cierre de la preventa como
medianoche del día del evento + N minutos, donde N se obtiene de:
`Event.presaleCutoffMinutes` → `ProducerParams.presaleCutoffMinutes` del
productor del evento → `presale.cutoff_hour` × 60 (default 19:00).
La misma resolución rige el canal del checkout (`PRESALE`/`DOOR`), el
preview de descuento (`discountQuote`) y el `presaleEndsAt` expuesto en
el detalle del evento.

#### Scenario: Override del evento

- **WHEN** un evento tiene `presaleCutoffMinutes = 1425`
- **THEN** la preventa está abierta hasta las 23:45 del día del evento,
  sin importar el default del productor ni el global

#### Scenario: Default del productor

- **WHEN** el evento no tiene override y su productor tiene
  `ProducerParams.presaleCutoffMinutes = 1320`
- **THEN** la preventa cierra a las 22:00 del día del evento

#### Scenario: Fallback global

- **WHEN** ni el evento ni el productor definen corte y
  `presale.cutoff_hour = 19`
- **THEN** la preventa cierra a las 19:00 del día del evento
  (comportamiento actual)

#### Scenario: Corte post-medianoche

- **WHEN** `presaleCutoffMinutes = 1500` (25:00)
- **THEN** la preventa queda abierta hasta la 01:00 del día siguiente al
  inicio del día del evento

#### Scenario: Detalle expone el corte efectivo

- **WHEN** se consulta `GET /events/:id` de un evento con override
- **THEN** `presaleEndsAt` refleja el instante resuelto por la cadena,
  no el global

### Requirement: Orden de ticket con total $0 no usa pasarela

El sistema SHALL emitir los tickets de una orden cuyo total es $0 sin
llamar a la pasarela: el Payment se crea con `gateway: "FREE"` y se
liquida de inmediato como PAID por el mismo `settle` del webhook
(tickets, mesa, redención de descuento, ledger, notificación). La
respuesta incluye `paymentUrl` apuntando a la pantalla de retorno con
el `paymentId`.

#### Scenario: Preventa liberada emite ticket al instante

- **WHEN** el evento tiene `presalePrice = 0`, la preventa está abierta
  y un usuario hace checkout
- **THEN** se crea Payment PAID `gateway: "FREE"`, `amount: 0`, se emite
  el ticket ACTIVE, no se invoca `gateway.createOrder` y la respuesta
  permite redirigir a `/checkout/return`

#### Scenario: Descuento que deja la orden en $0

- **WHEN** una orden con código deja `orderTotal = 0`
- **THEN** se liquida igual que la gratuita, con la redención del código
  auditada

#### Scenario: Orden con total > 0 sin cambios

- **WHEN** la preventa cuesta dinero o es venta de puerta
- **THEN** el flujo pasa por la pasarela como hoy (Payment PENDING +
  `createOrder`)

### Requirement: Corte configurable por evento y productor

El sistema SHALL permitir fijar el corte: en el evento (crear/editar del
productor, `presaleCutoffMinutes` 0–2879, `null` = heredar) y en el
default del productor (admin via `PUT /admin/producers/:id/fee-params`,
misma validación y vista `effective`).

#### Scenario: Productor fija el corte de su evento

- **WHEN** el productor crea o edita su evento con
  `presaleCutoffMinutes = 1425`
- **THEN** el valor queda persistido y gobierna el canal del checkout

#### Scenario: Admin fija el default del productor

- **WHEN** el admin hace PUT `/admin/producers/:id/fee-params` con
  `presaleCutoffMinutes = 1380`
- **THEN** el default queda en `ProducerParams`, la vista `effective`
  lo refleja y sus eventos sin override lo heredan

#### Scenario: Valor fuera de rango

- **WHEN** se envía `presaleCutoffMinutes` fuera de 0–2879
- **THEN** responde 400
