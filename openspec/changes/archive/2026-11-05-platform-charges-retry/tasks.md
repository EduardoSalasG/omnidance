# Tasks

- [x] 1. `PlatformChargesService.retryPending(actor)`: barrido FIFO de
  PLATFORM_CHARGE PENDING, count de COLLECT_ATTEMPT vs param
  `platform_charges.retry.max_attempts` (default 5), emit del intento
  antes de `provider.collect()` (subject desde ORDER_CREATED,
  commerceOrder = refId original), settle por outcome, abort en error
  transitorio. Retorna contadores.
- [x] 2. `PlatformChargesScheduler` + registro en PaymentsModule: job
  `platform-charges.collect` defaultCron `30 9 * * *` →
  `retryPending("cron")` con contadores a `JobRun.meta`.
- [x] 3. Specs del servicio: PENDING recuperado → PAID, PENDING sigue
  elegible, tope omite el collect, error aborta el loop sin marcar de
  más, contadores del barrido.
- [x] 4. Verificación: specs payments verdes + `tsc --noEmit` limpio.
- [x] 5. Docs: `docs/qa-flows-inventory.md` (flujo cobro directo →
  reintento automático) + `docs/architecture.md` (job en la línea de
  payments).
