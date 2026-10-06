# Handoff - 2026-10-06: producer-fee-model (slice 1/5) implementado

Sesión de producto + implementación sobre `dev`. Se aprobó el rediseño
del modelo de monetización y se implementó el slice económico completo:
**el comprador paga el precio publicado exacto; la comisión todo
incluido se cobra al actor y se descuenta de su liquidación**.

## Decisión de negocio (aprobada por el usuario)

- Comisión **10% lista / 8% promo** todo incluido, parametrizable por
  productor (`platformFeePct`: evento → ProducerParams →
  `fees.managed_allin_pct`). Passline (~15% + payout a 7 días) es el
  techo explícito; con SaaS encima el take total queda bajo una
  ticketera pura.
- Derivación por modo: OWN_METHOD/OWN_GATEWAY = `all-in − card%`
  (6,81%/4,81%), devengado y **neteado** contra payouts gestionados;
  efectivo puerta y orden $0 = 0%. Academias = SaaS (sin comisión,
  solo pasarela al costo).
- Desglose del 10% (ticket $6.000): pasarela ~3,19% ($191, al costo) +
  fee neto ~5,72% ($344, nuestro) + IVA 19% sobre el fee ~1,09% ($65).
- Spec de producto actualizada: `omni-dance.md` §10 (incluye estudio
  de mercado CL/EU, unit economics MRR/ARR/GMV y métricas de
  fundraising: ~$41k/evento a 8%, ~$57k a 10%).
- Design doc: `docs/superpowers/specs/2026-10-06-producer-fee-model-design.md`.
- Change OpenSpec: `openspec/changes/producer-fee-model` (spec delta +
  tasks 12/12).

## Implementado (slice 1: producer-fee-model)

- **Schema**: `Payment.feeMode/platformFeeRate/platformFeeNetClp/
  platformFeeVatClp/gatewayFeeExpected/producerNetClp/currency` +
  tabla `PayoutLine` (type/amount/paymentId/meta) + migración
  `20261016000000_producer_fee_model`.
- **`src/common/fee-breakdown.ts`**: helper puro `managedFeeBreakdown`
  / `academyFeeBreakdown` / `ownMethodBreakdown` / `ownMethodRate` /
  `resolvePlatformFeeRate`.
- **Pricing**: `quote` = `{listPrice, discount, total}` (sin
  serviceFee; total = lista − descuento, clamp 0).
- **Checkout**: todas las órdenes persisten desglose congelado +
  `unitServiceFee: 0` + `FEE_ASSESSED` en el ledger hash-chain dentro
  de la misma tx (`createAssessedPayment`). feeMode: tickets/pases/
  puerta-app → MANAGED; orden $0 → FREE (sin pasarela); membresía/
  workshop/private/claims/renovaciones → ACADEMY.
- **Payouts**: generación por `PayoutLine` auditables;
  `net = gross − Σ lines`; MANAGED descompone deducción congelada en
  GATEWAY_FEE_PASSTHROUGH (costo real reportado o esperado) +
  PLATFORM_FEE_NET + _VAT; OWN_* netea; legacy (feeMode null) usa
  regla vieja (fee real + platformFeePct); `PAYOUT_LINE_ASSIGNED` al
  ledger de cada orden; idempotente por actor+período.
- **Fix encontrado por e2e**: la línea de pasarela queda **acotada a
  la deducción congelada** — tasa 0% (promo) o < card% significa que la
  plataforma absorbe el costo, nunca el productor.
- **Params**: seed con `fees.managed_allin_pct` (10), `tax.iva_pct`
  (19), `gateway_fee.card_pct` (3,19), `gateway_fee.
  academy_passthrough_pct`; `service_fee.*` fuera del seed y de la
  whitelist pública; `ProducerFeeDefaults` sin campos legacy;
  `/producer/fee-params` solo `platformFeePct`.
- **API responses**: payments (mine/by-event/by-academy/:id) exponen
  feeMode + desglose + producerNetClp; payouts exponen `lines[]`.
- **Web**: checkout sin línea de cargo; páginas de params solo
  "Comisión todo incluido (%)"; `/productor/pagos` muestra deducciones
  agrupadas por tipo de línea; historial de pagos muestra neto al
  actor; i18n + legal + landing actualizados.
- **Dead code removido**: reads de `door*FeeClp` en checkins
  repo/puerto/service, `ParamsService` no usado, import SERVICE_FEE.
- **Docs**: `docs/flows.md` (sección comisión all-in + flows) y
  `docs/architecture.md` (tabla de params, Payment, PayoutLine,
  ledger) reescritos al modelo nuevo.

## Verificación

- **1536/1536 tests API** (69 archivos) — incluye e2e reescritos:
  checkout (quote exacto, congelado MANAGED, override 8%/0%),
  gap-producer (platformFeePct admin-gated), gap-payments (payouts por
  líneas, ACADEMY passthrough), gap-checkins (door-sale fee 0).
- API `tsc --noEmit` limpio; web `next build` 66/66 limpio; i18n
  `ALL_KEYS_OK`; `impeccable detect` sin hallazgos en los archivos UI.
- `prisma migrate status`: 20 migraciones, up to date.
- `export-api-docs.cjs` regenerado (sin diff de paths — el cambio es
  de campos de respuesta/whitelist, limitación conocida del export).
- `openspec validate` OK al crear el change.

## Bug corregido en el camino

`managedSettlementLines` emitía la línea GATEWAY_FEE_PASSTHROUGH aun
con deducción congelada $0 (override 0%) — hubiera descontado 319 de
un payout promo. Ahora `gatewayReal = min(real|expected, deduction)`;
spec nuevo cubre el caso (tasa 0% → sin líneas, gross completo).

## Compatibilidad legacy (a propósito)

- `Event.serviceFeeClp`, `ProducerParams.serviceFeeClp/door*FeeClp`,
  `Ticket.serviceFee` y params `service_fee.*` quedan en schema/DB
  como datos inertes: solo el settlement los lee como fallback para
  pagos pre-modelo (`unitServiceFee null`) y el CSV de recaudación los
  suma por exactitud histórica.
- `TicketWallet` muestra `listPrice + serviceFee` — correcto para
  tickets históricos; los nuevos llevan 0.

## Próximos slices (aprobados, en orden)

2. `gateway-port-normalization` — `GatewayConfirmation` normalizado,
   webhook por proveedor `/payments/webhook/:provider`,
   `Payment.currency`/`Event.currency`, adaptador **MercadoPago**
   como prueba del puerto.
3. `subscription-port-generic` — `FlowInvoice`/`FlowSubscription` →
   tipos normalizados (puerto desacoplado).
4. `producer-gateway-accounts` — `GatewayAccount` cifrado AES-256-GCM
   por actor (su Flow/MP, plata directo a ellos, fee derivado).
5. `producer-own-methods` — claims espejo de academy-claims +
   devengado OWN_METHOD para el netting.

## Pendiente / gaps conocidos

- `BillingDocument` (factura formal al productor: folio, RUT, neto,
  IVA) — deuda declarada; `PayoutLine` ya deja la contabilidad.
- Deploy/promotion a `main`: pendiente de release gate del usuario.
- DBs existentes conservan filas `service_fee.*` inertes (el seed ya
  no las crea; borrarlas es cosmético, no necesario).
