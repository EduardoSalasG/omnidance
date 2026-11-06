# Tasks: academy-cobros-reporte

## 1. Navegación

- [ ] 1.1 `BottomNav.tsx`: ítem "Reporte" (`/academia/cobros/reporte`,
  `academy.modules.report`, icono chart) debajo de Cobros en el grupo
  Administración del ACADEMY_OWNER; Cobros pasa a `exact: true`.
- [ ] 1.2 i18n: `academy.modules.report` = "Reporte" en
  `parts/academyExtras.json` (es-CL).

## 2. Cobros adelgaza

- [ ] 2.1 `cobros/page.tsx`: quitar botón Reporte del ConsoleHeader,
  quitar `CobrosHistory`, repoint del step s4 del tour a la cola de
  inscripciones.
- [ ] 2.2 `claims-queue.tsx`: quitar FilterBar, modo filtrado y Pager;
  cola operativa PENDING + AWAITING; links con `?from=/academia/cobros`.
- [ ] 2.3 `order-claims-queue.tsx`: idem (PENDING + resueltos acotados);
  links con `?from=/academia/cobros`.
- [ ] 2.4 Borrar `cobros-history.tsx`.

## 3. Terminología y métodos crudos

- [ ] 3.1 "por validar" único: `academyPay.*` y
  `academy.insights.pendingClaimsTitle`/`homeMode.claimsDone` en
  `academyExtras.json`.
- [ ] 3.2 "Inscripciones por validar": `orderQueueTitle`,
  `orderQueueDesc`, `orderHistoryTitle`, `orderMembership`,
  `orderClaimTitle`, `orderApprovedMsg`, `orderApproveDesc`.
- [ ] 3.3 "método de pago": strings `medio`→`método` en
  `academyPay.json`, `payments.cols.medium`, ledger y tour.
- [ ] 3.4 `payments.media.*` + `payments.gateways.*` + helper en
  `components/payments/shared.ts`; aplicar en reporte y `pago/[id]`.

## 4. Ver todos y back

- [ ] 4.1 `ExpiringList` (academy-dashboard): expand in-place con
  `SeeAllRow`; `CobrosExpiring` pasa los ítems extra.
- [ ] 4.2 `?from=` en `claim/[id]`, `orden/[id]`, `pago/[id]`
  (Suspense + `safeInternalPath`); `router.push` post-acción al origen.

## 5. Reporte

- [ ] 5.1 `useConsolePageSize` (20/10) en `apps/web/src/lib/`.
- [ ] 5.2 API `billingReport`: agregado `byMethod` sobre cobros
  efectivos.
- [ ] 5.3 Rediseño: KPIs Facturado/Alumnos, sección Métodos de pago,
  cards de 4 líneas + monto + badge, paginación 20/10, links con
  `?from=/academia/cobros/reporte`.

## 6. Métodos de pago y suscripción

- [ ] 6.1 Quitar campo "orden" de `nuevo` y `[methodId]`; CTA "+ Agregar"
  primario a la derecha del título encima de la descripción.
- [ ] 6.2 `academies.controller.ts`: `academyPaymentDetail` acepta
  `platsub_` de la academia y devuelve contexto tier/ciclo.
- [ ] 6.3 `academy-billing.tsx`: invoices clickeables a
  `pago/[id]?from=/academia/configuracion/suscripcion`; espacio entre
  "Ciclo de facturación" y sus opciones.

## 7. Verificación

- [ ] 7.1 `npx tsc --noEmit` en apps/web y apps/api limpios.
- [ ] 7.2 `node scripts/i18n-audit.cjs` → ALL_KEYS_OK.
- [ ] 7.3 Vitest de lo tocado.
- [ ] 7.4 `docs/qa-flows-inventory.md` actualizado.
