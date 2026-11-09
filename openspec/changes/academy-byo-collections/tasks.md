# Tasks: BYO collections + take facturado mes vencido

## Credenciales y cobro

- [ ] 1.1 Spec rojo: checkout de orden de academia con cuenta BYO cobra
  por el adaptador de SU cuenta (webhook `?account=` confirma);
  sin cuenta → solo claim manual.
- [ ] 1.2 `AcademyGatewayAccount` (o actor-scope sobre la tabla de
  productores): cifrado, alta/edición/probe en consola de academia.
- [ ] 1.3 Resolución en checkout para MEMBERSHIP/WORKSHOP/PRIVATE;
  deprecar emisión de órdenes our-Flow para academias.

## Take y facturación

- [ ] 1.4 Spec rojo: Payment gateway-PAID de academia devenga
  `amount × academy_fee.net_pct` (default 1,0) congelado por orden.
- [ ] 1.5 Factura mes vencido: línea "cobranza automatizada" en la
  PlatformSubscription (o documento propio) con neto + IVA 19%.
- [ ] 1.6 `collectionsBlockedAt` por liquidación impaga: reconcile lo
  setea/libera; checkout BYO rechaza gateway-orders (claim manual OK).
- [ ] 1.7 Param `academy_fee.net_pct` en seed + /admin/params.

## Liquidación y deprecación

- [ ] 1.8 `GET /academies/:id/statements` + export PDF
  (`buildTablePdf`) + CSV; visible en consola academia y
  /admin/finanzas.
- [ ] 1.9 Payout de academias: solo histórico; retirar
  `academy_cobros.take_multiplier`/`ACADEMY_COBROS_TAKE` del flujo
  nuevo (líneas históricas se liquidan con el motor viejo).
- [ ] 1.10 Precios neto + IVA: decisión pricing documentada
  (reinterpretar `*_monthly_clp` como neto vs solo take neto+IVA).

## Verificación

- [ ] 2.1 Vitest payments/checkout/platform-subscriptions verde.
- [ ] 2.2 Repro manual BYO con credenciales stub + claim manual sin
  cuenta + bloqueo por impago.
- [ ] 2.3 `pnpm build` + typecheck + docs (omni-dance.md §10
  proyección + tabla tiers + payout, estrategia-comercial §6,
  qa-flows-inventory, architecture/flows, openapi/postman).
- [ ] 2.4 Archive con specs aplicadas.
