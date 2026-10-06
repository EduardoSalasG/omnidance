# Tasks - producer-fee-model

- [ ] `schema.prisma`: `Payment.feeMode/platformFeeRate/
  platformFeeNetClp/platformFeeVatClp/gatewayFeeExpected/producerNetClp/
  currency` + `PayoutLine` + relaciones + migración `migrate deploy`.
- [ ] `pricing.service.ts`: `quote` sin fee de comprador
  (total = lista − descuento, clamp 0); `serviceFee` fuera del contrato.
- [ ] `src/common/fee-breakdown.ts` (nuevo): helper puro que calcula la
  descomposición `MANAGED` (rate → deduction → gatewayExpected →
  net/iva → producerNet) + `ownMethodRate(rate, cardPct)` para OWN_*.
- [ ] `params.service.ts`: `platformFeePct` ya mapea; lectura de
  `platform_fee.managed_allin_pct` (10), `tax.iva_pct` (19),
  `gateway_fee.card_pct` (3.19).
- [ ] `checkout.service.ts`: `amount = total`; `unitServiceFee: 0`;
  persiste descomposición + `currency`; `FEE_ASSESSED` en el chain;
  órdenes academia → `feeMode: ACADEMY` (platformFee 0,
  producerNet = amount).
- [ ] `checkins.service.ts` + repo: door-sale registra
  `serviceFee: 0` (cadena `*FeeClp`/`service_fee.door_*` deprecated).
- [ ] `payouts.controller.ts`: generación por `PayoutLine` (MANAGED /
  ACADEMY / FREE / legacy `feeMode null` → `GATEWAY_FEE_PASSTHROUGH`
  = `Payment.fee`); `net = gross − Σ lines`; totales denormalizados;
  `lines[]` desde la tabla; netting `OWN_METHOD_*`.
- [ ] Params/seed: nuevas keys con `update:{}`; deprecated quedan en
  DB pero sin lectura.
- [ ] API responses: `GET /payments/:id` y `by-event` exponen
  `feeMode/platformFeeRate/net/vat/producerNet`; `unitServiceFee` 0.
- [ ] Web: checkout sin línea de cargo; `/admin/parametros` +
  `/productor/parametros` solo `platformFeePct` ("comisión todo
  incluido %"); form de evento mantiene override; payout view muestra
  `lines` por pago.
- [ ] Tests: quote sin fee; descomposición MANAGED 10/8 + override;
  FREE 0; ACADEMY; FEE_ASSESSED; payout por líneas + netting + legacy;
  door-sale fee 0.
- [ ] Docs: `docs/flows.md` + `architecture.md`; openapi/postman;
  handoff.
