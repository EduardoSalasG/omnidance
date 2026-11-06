# Delta; payments/subscriptions

## ADDED Requirements

### Requirement: Cobro on-demand de invoice impaga (collect)

`SubscriptionProvider` SHALL exponer `collect()` para efectuar un
cargo on-demand sobre el medio de pago registrado del customer,
independiente de las invoices del motor de suscripciones. El
adaptador SHALL normalizar el resultado a
`{outcome: "COLLECTED" | "PENDING" | "FAILED", flowOrder?,
paymentUrl?, gatewayData?}`:

- `COLLECTED`: cargo sincrónico exitoso sobre la tarjeta registrada;
  `gatewayData` = NormalizedGatewayData del pago.
- `PENDING`: el customer no tiene medio de pago registrado y el
  proveedor generó un cobro por link/email; `paymentUrl` lleva la URL
  de pago para ofrecérsela al actor.
- `FAILED`: el cargo a la tarjeta fue rechazado.

#### Scenario: Collect con tarjeta registrada

- **WHEN** el customer tiene tarjeta vigente y se invoca collect por
  un monto y concepto dados
- **THEN** el adaptador ejecuta el cargo contra la pasarela
  (Flow `customer/collect` type=1) y devuelve `COLLECTED` con la
  verdad monetaria del pago en `gatewayData`

#### Scenario: Collect sin tarjeta

- **WHEN** el customer ya no tiene medio de pago registrado
- **THEN** el adaptador devuelve `PENDING` con `paymentUrl` (link o
  cobro por email, según el proveedor) sin lanzar excepción

### Requirement: `invoices[].nextAttemptDate` normalizado

`SubscriptionInvoice` SHALL exponer `nextAttemptDate`
(`string | null | undefined`) con la fecha del próximo reintento
programado por el proveedor (Flow `next_attemp_date`). `null`
significa que el proveedor ya no reintentará la invoice; `undefined`
significa que el adaptador no puede saberlo.

#### Scenario: Invoice con retry agotado

- **WHEN** una invoice impaga en Flow tiene `next_attemp_date: null`
- **THEN** el adaptador la normaliza con `nextAttemptDate: null`

### Requirement: Recuperación de mora por collect en el reconcile

Cuando el reconcile de una suscripción (membresía o plataforma)
encuentre invoices impagas cuyo proveedor **ya no reintentará**
(`nextAttemptDate === null` o sub `morose`), SHALL intentar un
`collect()` por cada una elegible ANTES de disparar la notificación
de mora, con estas reglas:

- La elegibilidad exige ausencia de retry agendado: una invoice con
  `nextAttemptDate` futura NUNCA se colecta (el cobro duplicaría el
  reintento del proveedor).
- `commerceOrder` = refId de renovación existente
  (`platsub_<subId>_<invoiceId>` / `mem_<planId>_<invoiceId>`), dentro
  del límite de 45 caracteres de Flow, de modo que el Payment resulta
  en el mismo slot de dedup que usa el settle de invoices.
- Si ya existe un Payment con ese refId, la invoice no se colecta de
  nuevo (dedup: un intento automático por invoice).
- `COLLECTED` SHALL crear el Payment y liquidarlo por el camino de
  renovación estándar (`kind:"renewal"` → RENEWAL_SETTLED, efectos de
  desbloqueo/gracia y resguardo).
- `PENDING` SHALL dejar el Payment PENDING (los caminos existentes de
  webhook/polling lo liquidan si el actor paga el link) y agregar la
  `paymentUrl` al `data` de la notificación de mora.
- `FAILED` SHALL marcar el Payment FAILED (queda la evidencia del
  intento) y la mora continúa su curso normal (gracia/bloqueo).
- Un error de API del collect SHALL abortar el intento sin crear
  Payment (transitorio: el próximo reconcile reintenta) y cortar el
  loop de invoices de esa corrida.

#### Scenario: Renovación recuperada por collect

- **WHEN** una suscripción ACTIVE tiene una invoice impaga sin
  `nextAttemptDate` y el collect de la tarjeta del subscriber cobra
  exitoso
- **THEN** se crea el Payment de renovación PAID con ledger
  ORDER_CREATED→STATUS_CONFIRMED→RENEWAL_SETTLED y la mora no emite
  notificación de gracia

#### Scenario: Invoice con retry agendado no se colecta

- **WHEN** una invoice impaga tiene `nextAttemptDate` en el futuro
- **THEN** el reconcile no invoca collect para ella

#### Scenario: Collect rechazado

- **WHEN** el collect devuelve `FAILED` (tarjeta rechazada)
- **THEN** el Payment queda FAILED, la mora sigue su curso y ningún
  reconcile posterior reintenta el collect de esa invoice

#### Scenario: Collect cae a link de pago

- **WHEN** el customer no tiene tarjeta y el collect devuelve
  `PENDING` con `paymentUrl`
- **THEN** la notificación de mora incluye la `paymentUrl` en su
  `data` y el Payment queda PENDING hasta que el actor pague o expire
