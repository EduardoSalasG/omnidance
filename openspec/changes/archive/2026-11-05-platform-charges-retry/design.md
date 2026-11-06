# Design: platform-charges-retry

## Decisión: reintento sobre el mismo Payment, no cargo nuevo

`PlatformChargesService.collect()` crea un `Payment` nuevo por cargo.
El reintento NO puede reusar `collect()` tal cual (generaría cargos
duplicados por la misma deuda). Se agrega `retryPending(actor)`:

1. `findMany` PLATFORM_CHARGE + PENDING, ordenado por `createdAt` asc
   (FIFO - el más viejo primero).
2. Por cada uno: count de `COLLECT_ATTEMPT` en `paymentEvent` → si
   `>= maxAttempts` (param `platform_charges.retry.max_attempts`,
   default 5) se cuenta como `exhausted` y se omite.
3. `emitPaymentEvent(tx, id, "COLLECT_ATTEMPT", actor, {attempt, refId})`
   antes de llamar al proveedor: el intento queda auditado aunque el
   proceso muera durante la llamada externa (mismo patrón claim-antes-
   del-cargo que ORDER_CREATED).
4. `ensureFlowCustomer` + `provider.collect()` con `commerceOrder` =
   `payment.refId` (mismo refId del cargo original - el proveedor ve
   una nueva operación sobre la misma orden lógica; el subject se
   recupera del payload de `ORDER_CREATED`, fallback "Cobro
   plataforma").
5. Outcome: `res.flowOrder` → `gatewayRef`; COLLECTED →
   `settlePlatformCharge`, FAILED → `settle FAILED`, PENDING → nada
   (elegible próximo run).
6. Error de red/HTTP del provider → aborta el barrido y propaga (el
   registry marca el run como fallido; los ya procesados quedan
   commiteados). No se libera el claim: el Payment ya existía, no es
   un claim nuevo.

## Job

`PlatformChargesScheduler` (nuevo, mismo patrón que
`SubscriptionsScheduler`): `onModuleInit` registra en `JobRegistry`
key `platform-charges.collect`, label "Reintento de cobros sueltos",
defaultCron `"30 9 * * *"` (30min después de
`subscriptions.reconcile` - si una suscripción quedó PAID en el
reconcile matutino, el customer puede haber registrado tarjeta).
Handler → `retryPending("cron")` → `{scanned, exhausted, collected,
failed, pending}` a `JobRun.meta`.

## Params

`platform_charges.retry.max_attempts` (default "5"): tope de
`COLLECT_ATTEMPT` por Payment. Administrable desde /admin/parametros
sin deploy.
