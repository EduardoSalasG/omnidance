# Tasks - producer-fee-model

- [x] `schema.prisma`: `Payment.feeMode/platformFeeRate/
  platformFeeNetClp/platformFeeVatClp/gatewayFeeExpected/producerNetClp/
  currency` + `PayoutLine` + relaciones + migración `migrate deploy`.
- [x] `pricing.service.ts`: `quote` sin fee de comprador
  (total = lista − descuento, clamp 0); `serviceFee` fuera del contrato.
- [x] `src/common/fee-breakdown.ts` (nuevo): helper puro que calcula la
  descomposición `MANAGED` (rate → deduction → gatewayExpected →
  net/iva → producerNet) + `ownMethodRate(rate, cardPct)` para OWN_* +
  `academyFeeBreakdown` (SaaS: sin comisión, pasarela esperada).
- [x] `params.service.ts`: `platformFeePct` ya mapea; lectura de
  `fees.managed_allin_pct` (10), `tax.iva_pct` (19),
  `gateway_fee.card_pct` (3.19). Campos legacy fuera de
  `ProducerFeeDefaults`.
- [x] `checkout.service.ts`: `amount = total`; `unitServiceFee: 0`;
  persiste descomposición + `currency`; `FEE_ASSESSED` en el chain;
  órdenes academia → `feeMode: ACADEMY` (platformFee 0,
  producerNet = amount). Renovaciones de suscripción y claims MANUAL
  también congelan desglose ACADEMY.
- [x] `checkins.service.ts` + repo: door-sale registra
  `serviceFee: 0`; puerto/repo/servicio sin reads de `*FeeClp` legacy.
- [x] `payouts.controller.ts`: generación por `PayoutLine` (MANAGED /
  ACADEMY / FREE / legacy `feeMode null` → `GATEWAY_FEE_PASSTHROUGH`
  = `Payment.fee`); `net = gross − Σ lines`; totales denormalizados;
  `lines[]` desde la tabla; netting `OWN_METHOD_*`;
  `PAYOUT_LINE_ASSIGNED` al ledger.
- [x] Params/seed: nuevas keys con `update:{}`; `service_fee.*` fuera
  del seed y de la whitelist pública (filas legacy quedan inertes).
- [x] API responses: `GET /payments/:id` y `by-event`/`mine`/
  `by-academy` exponen `feeMode/platformFeeRate/net/vat/producerNet`;
  `unitServiceFee` 0. `/producer/fee-params` solo `platformFeePct`.
- [x] Web: checkout sin línea de cargo; `/admin/parametros` +
  `/productor/parametros` solo `platformFeePct` ("comisión todo
  incluido %"); form de evento mantiene override; `/productor/pagos`
  muestra deducciones agrupadas por tipo de línea; i18n/copy
  actualizados (legal, landing, payments).
- [x] Tests: quote sin fee; descomposición MANAGED 10/8 + override;
  FREE 0; ACADEMY; FEE_ASSESSED; payout por líneas + netting + legacy;
  door-sale fee 0.
- [x] Docs: `docs/flows.md` + `architecture.md`; handoff.
- [x] openapi/postman regenerados (sin diff — el change modifica
  campos de respuesta y whitelist, no paths).
