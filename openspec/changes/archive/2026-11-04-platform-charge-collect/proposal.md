# platform-charge-collect

## Why

El adapter Flow ya implementa `customer/collect` (cargo on-demand
sobre la tarjeta registrada del customer) y el reconcile de
suscripciones lo usa para recuperar invoices impagas. Lo que no
existe es la superficie para **cobros sueltos plataforma→actor**:
cargar un monto arbitrario a un actor (owner de academia, productor)
por un concepto puntual - deuda, fee especial, ajuste manual - sin
asociarlo a una suscripción. Hoy esa operación no tiene endpoint,
Payment ni liquidación.

## What Changes

- **API - servicio reutilizable**: `PlatformChargesService.collect()`
  ejecuta el ciclo completo de un cobro suelto sobre el medio de pago
  del actor (customer del `subscription_gateway` resuelto por
  `payments.subscription_gateway` + `GatewayRegistry`): claim
  `Payment` PENDING (`orderType: "PLATFORM_CHARGE"`, refId
  `platchg_<uuid>`) → `provider.collect()` → outcome COLLECTED /
  FAILED / PENDING (con `paymentUrl` para cobro por link/email). Es la
  base que usarán tanto el endpoint admin como futuros cobros
  automáticos (deudas detectadas por jobs).
- **API - endpoint admin**: `POST /admin/platform-charges`
  (`admin.access`) con `{personId, amount, subject}`; responde el
  outcome y el `paymentUrl` cuando el cobro degrada a link.
- **Settlement**: rama `PLATFORM_CHARGE` en `settle()` - cobro
  confirmado marca el Payment PAID con los campos `gateway*`
  normalizados, eventos de ledger y avisos (pagador + admin), igual
  que el resto de orderTypes. Un `PLATFORM_CHARGE` es ingreso directo
  de plataforma como `PLATFORM_SUB` (no devenga a ningún actor).
- **Web admin**: acción "Cobro directo" en la ficha
  `/admin/usuarios/[personId]` (monto + concepto + `ConfirmSheet` +
  `ActionNotice`; con `paymentUrl` se ofrece copiar el link).

## Capabilities

### New Capabilities

- `payments/platform-charges`: cobros sueltos plataforma→actor por
  `customer/collect`, gatillados por admin o por jobs futuros.

### Modified Capabilities

- `payments/subscriptions`: el puerto `collect()` (ya existente) queda
  consumido también por el servicio de cobros sueltos - mismo
  contrato de outcome, sin cambios en el puerto.

## Impact

- API: `payments/application/platform-charges.service.ts` (nuevo),
  `payments/application/payment-settlement.service.ts` (rama nueva),
  `payments/domain/order-ref.ts` (`platchg_`),
  `admin/infrastructure/platform-charges.controller.ts` (nuevo),
  `admin/infrastructure/finance.controller.ts` (clasificación como
  ingreso directo) + specs.
- Web: `admin/usuarios/[personId]/page.tsx` (sección/acción nueva),
  i18n admin.
- Docs: `docs/qa-flows-inventory.md`, `docs/architecture.md`,
  `docs/openapi.json` + postman regenerados.
- Sin cambios de esquema (reusa `Payment`, `orderType` es string).
