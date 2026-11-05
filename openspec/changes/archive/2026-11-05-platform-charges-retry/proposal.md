# platform-charges-retry

## Why

`PlatformChargesService.collect()` (change platform-charge-collect)
degrada a PENDING cuando el actor no tiene medio de pago registrado -
queda un `paymentUrl` para que pague por link, pero si el actor
registra su tarjeta después, nadie reintenta el cargo: la deuda queda
PENDING para siempre salvo pago manual. El propio docstring del
servicio declara "lo reusarán jobs futuros (deudas detectadas)". Este
change es ese job: reintento automático acotado de cobros sueltos
impagos.

## What Changes

- **API - reintento por job**: `PlatformChargesService.retryPending()`
  re-invoca `provider.collect()` sobre cada `Payment` PENDING con
  `orderType: "PLATFORM_CHARGE"` que no haya agotado reintentos:
  claim idempotente por intento (evento `COLLECT_ATTEMPT` en el
  ledger antes de llamar al proveedor), mismo ciclo de outcome que el
  cobro inicial (COLLECTED → PAID, FAILED → settle FAILED, PENDING →
  sigue elegible al próximo run). Error transitorio del proveedor
  aborta el barrido (mismo patrón que `collectOverdueInvoices`).
- **API - tope de reintentos**: cada intento cuenta como evento
  `COLLECT_ATTEMPT`; al llegar al tope (param
  `platform_charges.retry.max_attempts`, default 5) el cargo deja de
  ser elegible - el actor aún puede pagar por `paymentUrl` y la
  liquidación por webhook sigue funcionando.
- **API - job programado**: `platform-charges.collect` registrado en
  `JobRegistry` (default diario, administrable desde /admin/jobs) que
  corre `retryPending("cron")` y reporta contadores a `JobRun.meta`.

## Capabilities

### Modified Capabilities

- `payments/platform-charges`: los cobros sueltos que degradan a
  PENDING dejan de ser terminales - un job diario reintenta el cargo
  hasta un tope administrable, sobre el mismo `Payment` (sin crear
  duplicados) y con intentos auditados en el ledger.

## Impact

- API: `payments/application/platform-charges.service.ts`
  (`retryPending`), `payments/infrastructure/platform-charges.scheduler.ts`
  (nuevo), `payments/payments.module.ts` (provider del scheduler) +
  specs del servicio.
- Web: nada (la corrida manual del job ya es operable desde /admin/jobs).
- Docs: `docs/qa-flows-inventory.md` (§0 mecánica + sección
  platform-charges), `docs/architecture.md` (línea del job).
- Sin cambios de esquema (intentos se cuentan por `PaymentEvent`).
