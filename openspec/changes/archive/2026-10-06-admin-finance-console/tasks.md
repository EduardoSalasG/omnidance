# Tasks - admin-finance-console

- [x] `payouts.controller.ts`: `computeSettlement` gana
  `unliquidatedOnly` (`payoutLines: none` en el where) + spec del
  caso. *(extraído a `PayoutSettlementService` en
  `payments/application/payout-settlement.service.ts`)*
- [x] `src/admin/infrastructure/finance.controller.ts` (nuevo):
  `GET /admin/finance/summary|accrual|mrr` bajo `admin.access` +
  wiring en `AdminModule`.
- [x] `browse.controller.ts`: select de `payments` + desglose
  congelado (feeMode/platformFeeRate/producerNetClp/gatewayFeeClp/
  currency).
- [x] Spec `finance.controller.spec.ts` con fake-prisma (summary por
  segmento, accrual unliquidated + OWN_METHOD receivable + nombres,
  MRR por ciclo + custom).
- [x] Web `/admin/finanzas`: KPI header + tabs Liquidaciones /
  Por liberar / Pagos / SaaS + modal generar + acciones
  aprobar/pagar + card en hub `/admin` + i18n `parts/admin.json`.
- [x] Verificación: specs nuevos + suite afectada + tsc api/web +
  i18n audit + impeccable detect.
- [x] Docs: `architecture.md` (módulo + endpoints) + handoff +
  openapi/postman regen + commit en `dev`.
