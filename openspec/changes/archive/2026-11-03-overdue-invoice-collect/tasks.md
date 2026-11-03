# Tasks; overdue-invoice-collect

- [x] Puerto: `collect()` + `CollectResult`/`CollectOutcome` en
      `ports.ts` + `SubscriptionInvoice.nextAttemptDate`.
- [x] `FlowGateway.collect` (customer/collect vía `call()`, normaliza
      type 1/2/3) + normalización `next_attemp_date` en
      `normalizeInvoice`. Specs: firma/params, type 1 pagado →
      COLLECTED + gatewayData, rechazado → FAILED, type 2/3 → PENDING
      con paymentUrl.
- [x] `StubGateway.collect` → COLLECTED con tarjeta / PENDING+link sin
      tarjeta (simulado).
- [x] Reconcile platsub: collect de invoices elegibles antes de
      `handleMorose` (dedup por refId, Payment + settle renewal /
      FAILED / PENDING+paymentUrl, `coveredIds` excluye lo recuperado
      de la evaluación de mora). Specs de servicio: elegible
      colecta y liquida, retry agendado no colecta, FAILED no
      reintenta, dedup, error de API corta el loop.
- [x] Reconcile membresías: mismo helper/reglas con
      `mem_<planId>_<invoiceId>` + `settleMembership`. Specs.
- [x] Notificaciones de mora: `collectUrl` en `data` cuando el
      collect devolvió PENDING (academy.billing_grace /
      producer.pro_renewal_failed / membership.renewal_failed).
- [x] Verificación: specs payments verdes (flow.gateway 59/59,
      platform-subscriptions 96/96, subscriptions 75/75), `tsc
      --noEmit` limpio.
- [x] Docs: `docs/architecture.md` (sección suscripciones
      multi-proveedor) + `docs/flows.md` (nota de recuperación de mora
      en el reconcile) + `docs/qa-flows-inventory.md` (flujo
      renovación fallida → collect).
- [ ] Smoke opcional contra sandbox si hay invoice impaga disponible
      (no aplica hoy: la única impaga era de una sub ya CANCELED).
