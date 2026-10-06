# Handoff - 2026-10-06b: admin-finance-console implementado + evaluación Fintoc/PWA

Sesión sobre `dev` tras `producer-fee-model`. Dos frentes: (1) consola
financiera admin implementada end-to-end, (2) evaluaciones de producto
registradas (Fintoc, capacidades PWA) para priorización futura.

## Implementado (slice: admin-finance-console)

**Backend** (`admin.access` en todo):

- `PayoutSettlementService` nuevo en
  `apps/api/src/payments/application/payout-settlement.service.ts`:
  el motor de liquidación salió de `AdminPayoutsController` (que ahora
  lo inyecta) para compartirlo con finanzas. Gana `unliquidatedOnly`
  (`payoutLines: { none: {} }`) - el devengado usa las **mismas reglas**
  de atribución/fee que la liquidación, una sola fuente de verdad.
- `AdminFinanceController` en `apps/api/src/admin/infrastructure/`:
  - `GET /admin/finance/summary?from&to` - GMV segmentado
    (social/academia/SaaS; OWN_METHOD aparte - esa plata no pasó por
    nosotros), ingreso plataforma (neto+IVA+SaaS), costo pasarela
    (real `gatewayFeeClp` o esperado), por transferir PENDING+APPROVED.
  - `GET /admin/finance/accrual` - PAID sin `PayoutLine`, agrupado por
    actor: `{actorType, actorId, actorName, oldestPaymentAt,
    paymentCount, gross, estimatedNet, ownMethodReceivable}`. El
    receivable es plata que el actor **nos debe** (se netea).
  - `GET /admin/finance/mrr` - MRR/ARR normalizado por ciclo
    (mensual/6/12), por kind+tier, funnel de estados, contratos a
    medida (sin precio self-serve).
- `AdminModule` importa `PaymentsModule` (sin ciclo).
- `browse.controller` `payments` suma el desglose congelado:
  `gateway`, `feeMode`, `platformFeeRate`, `platformFeeNetClp/VatClp`,
  `gatewayFeeExpected` (con `gatewayFeeClp` real como fallback),
  `producerNetClp`, `currency`.

**Frontend**: `/admin/finanzas` (card nueva en el hub `/admin`) -

- KPIs del período (filtro from/to) + 4 tabs: **Liquidaciones**
  (payouts con `PayoutLine`s expandibles agrupadas por tipo,
  aprobar, marcar pagada con `evidenceUrl`), **Por liberar** (accrual
  por actor + "Generar liquidación" que pre-llena actor/período
  `[oldestPaymentAt → hoy]`), **Pagos** (desglose congelado + link a
  Datos) y **SaaS** (MRR/ARR/contratos custom + funnel + subs activas).
- i18n en `src/i18n/parts/admin.json` (`admin.finance.*` +
  `admin.modules.finanzas`).

## Errores encontrados y corregidos

- `RolesGuard` importado desde `roles.decorator` en vez de
  `roles.guard` → `Invalid guard passed` en 13 archivos de test.
- El fake `matchWhere` del spec de payouts trataba `OR: [...]` como
  `{some:...}` (`"some" in array` = true por `Array.prototype.some`) →
  pagos fantasma excluidos. Fix: chequeo `Array.isArray` primero.
- Fixture del spec de finanzas con fechas futuras: el accrual capa
  `≤ now` (correcto) → fechas pasadas reales en el fixture.

## Evaluaciones registradas (pendientes de priorización)

- **Fintoc** (Chile): cobro A2A ~1,35%+IVA ≈ 1,61% vs ~3,19% tarjeta →
  sube nuestro neto del all-in de ~5,7% a ~7,3%. Encaja como adaptador
  del puerto `PaymentGateway` (no reemplaza Flow/MP). Payouts: Batch
  Transfers (CSV ≤5.000, MFA) usable día 1; API de disbursements para
  v2. Chile + México, no Europa.
- **PWA**: Google Wallet `RotatingBarcode` = TOTP nativo → mapping
  directo de nuestro QR ~30s; Apple Wallet sin rotativo → pase estático
  con deep link al QR vivo (patrón DICE/Ticketmaster). Oportunidades:
  QR que se activa el día del evento, install prompt post-compra,
  staff scanner con wake-lock + vibración + cola offline, push con
  deep link al QR, badges, web share, app shortcuts. No perseguir NFC.

## Verificación

- **1546/1546 tests API** (70 archivos) verde; `tsc --noEmit` API y web
  limpios; `next build` web 67/67 (`/admin/finanzas` incluida);
  i18n `ALL_KEYS_OK`; impeccable detect `[]`; `openspec validate
  --changes` 9/9; openapi+postman regenerados (218 paths).
- Docs: `architecture.md` (módulo admin + bullets del motor de
  liquidación y la consola), `omni-dance.md` §liquidaciones.

## Próximos slices (en orden)

1. `gateway-port-normalization` - confirmación normalizada, webhook
   `:provider`, `Payment.currency`, adaptador MercadoPago (valida el
   puerto; Fintoc después como A2A).
2. `subscription-port-generic`.
3. `producer-gateway-accounts` (GatewayAccount cifrado por actor).
4. `producer-own-methods` (checkout del comprador por métodos del
   productor con netting ya soportado en payouts).
5. Roadmap PWA: wallet passes + QR day-of → offline check-in staff →
   Fintoc adaptador.
