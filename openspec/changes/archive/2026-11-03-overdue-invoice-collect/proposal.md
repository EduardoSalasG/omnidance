# overdue-invoice-collect

## Why

Cuando Cargo Automático de Flow agota sus reintentos sobre una invoice
de suscripción impaga (`next_attemp_date: null` o `morose`), hoy la
plataforma solo notifica y deja correr la gracia/bloqueo: no existe
ningún intento de cobro por nuestra parte. Flow expone
`customer/collect` (cargo on-demand sobre la tarjeta registrada del
customer, con fallback a link de pago) que permite recuperar el
período debido en el momento, en vez de esperar que venza la gracia.

## Decisiones tomadas (con el usuario)

- Alcance: AMBAS suscripciones (membresía bailarín→academia y
  plataforma academia/productor→Omnidance), mismo motor.
- Anti doble-cargo: solo se colecta una invoice impaga cuando Flow no
  tiene retry agendado (`next_attemp_date: null`) o la sub está en
  mora. Con retry agendado jamás se colecta (Flow podría cobrarla en
  paralelo y el actor pagaría dos veces).
- Un intento automático por invoice en v1; si falla, la recuperación
  sigue el camino manual (link de pago en la notificación de mora, o
  TRANSFER).
- El cobro reutiliza el refId de renovación
  (`platsub_<subId>_<invoiceId>` / `mem_<planId>_<invoiceId>`): cae en
  el mismo slot de dedup que el settle de invoices y lo liquida el
  mismo camino (webhook/polling → RENEWAL_SETTLED).

## What Changes

- Nuevo método `collect()` en el puerto `SubscriptionProvider`:
  cargo on-demand al customer con resultado normalizado
  (`COLLECTED`/`PENDING`/`FAILED` + `paymentUrl` para el fallback de
  link/email).
- `FlowGateway.collect` → `customer/collect` (firmado, auditado vía
  `call()`); `StubGateway.collect` simulado para dev/tests.
- `SubscriptionInvoice.nextAttemptDate` normalizado desde
  `next_attemp_date` de Flow.
- El reconcile (plataforma + membresías) intenta el collect de
  invoices impagas elegibles ANTES del handler de mora: crea el
  Payment PENDING con el refId de renovación, liquida con
  `kind:"renewal"` si el cargo fue sincrónico, o deja el Payment
  PENDING con `paymentUrl` en la notificación de mora si Flow devolvió
  link/email.
- Limitación conocida: la invoice remota en Flow queda impaga para
  siempre (no existe retry de invoice vía API); el dedup local absorbe
  que la sub remota siga reportando `morose`.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `payments/subscriptions`: el puerto gana el método `collect()` y el
  reconcile gana el intento de cobro on-demand de invoices impagas sin
  retry agendado (mora y pre-mora).

## Impact

- `apps/api/src/payments/domain/ports.ts`: método `collect` +
  `nextAttemptDate` en `SubscriptionInvoice`.
- `apps/api/src/payments/infrastructure/flow.gateway.ts` +
  `stub.gateway.ts`: implementación del método.
- `apps/api/src/payments/application/platform-subscriptions.service.ts`
  y `subscriptions.service.ts`: elegibilidad, dedup por refId,
  Payment + settle/notificación en el reconcile.
- Notificaciones de mora existentes ganan `collectUrl` opcional en
  `data` (sin cambio de catálogo i18n: el link viaja en el payload).
- Sin cambios de schema Prisma ni de contratos HTTP públicos.
