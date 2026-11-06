# Tasks: platform-charge-collect

## API

- [x] 1. `payments/domain/order-ref.ts`: `encodePlatformChargeRef()`
  (`platchg_<uuid>`) + decoder; documentar que entra en el límite de
  45 chars del `commerceOrder` de Flow.
- [x] 2. `payments/application/platform-charges.service.ts`
  (nuevo): `collect({personId, amount, subject, actor})` -
  resuelve el provider por `payments.subscription_gateway` +
  `GatewayRegistry` (mismo patrón que `PlatformSubscriptionsService.provider()`),
  `ensureFlowCustomer`, claim Payment PENDING (`PLATFORM_CHARGE`,
  `fee:0`, `net:amount`, `currency` del param/persona) +
  `ORDER_CREATED`, `provider.collect()` con
  `returnUrl` = `/api/payments/order-return`, outcomes según spec,
  release del claim ante error transitorio. Devuelve
  `{paymentId, outcome, paymentUrl?}`.
- [x] 3. `payment-settlement.service.ts`: rama
  `orderType === "PLATFORM_CHARGE"` → `settlePlatformCharge()`:
  claim atómico →PAID, campos `gateway*`, `AMOUNT_MISMATCH`, eventos
  ledger, aviso al pagador + `emitPaidReceipts` (admins + mail
  resguardo) - mismo patrón que las demás ramas.
- [x] 4. `admin/infrastructure/platform-charges.controller.ts`
  (nuevo): `POST /admin/platform-charges` con
  `@UseGuards(SessionGuard, RolesGuard)` +
  `@RequirePermissions("admin.access")`, DTO con class-validator
  (`personId` string, `amount` int positivo, `subject` no vacío).
  Registrar el controller en el módulo admin/payments según wiring.
- [x] 5. `admin/infrastructure/finance.controller.ts`: tratar
  `PLATFORM_CHARGE` como ingreso directo (misma clase que
  `PLATFORM_SUB`, nunca dentro de `ACCRUABLE_ORDER_TYPES`).
- [x] 6. Stub gateway: `collect()` ya simula outcome - verificar que
  cubre el path del servicio nuevo (dev/e2e sin Flow real).
- [x] 7. Specs vitest: casos COLLECTED / FAILED / PENDING / error
  transitorio (claim liberado) / 403 sin permiso / 404 persona
  inexistente.

## Web admin

- [x] 8. `/admin/usuarios/[personId]`: sección/acción "Cobro directo"
  - form monto + concepto, `ConfirmSheet` previo al cargo,
  `ActionNotice` con el resultado; cuando `paymentUrl` viene en la
  respuesta ofrecer copiar el link. i18n en la parte admin.

## Docs / cierre

- [x] 9. `docs/qa-flows-inventory.md` (flujo cobro directo admin),
  `docs/architecture.md` (endpoint + orderType), regenerar
  `docs/openapi.json` + postman; archivar el change.
