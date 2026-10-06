# Design - admin-finance-console

## Contratos

`GET /api/admin/finance/summary?from&to` (default: mes actual CL):

```json
{
  "period": { "from": "…", "to": "…" },
  "gmv": {
    "social": 0,        // TICKET + SERIES_PASS por pasarela nuestra
    "academy": 0,       // MEMBERSHIP + WORKSHOP + PRIVATE idem
    "saas": 0,          // PLATFORM_SUB
    "ownMethod": 0      // gateway=MANUAL: plata ajena (informativo)
  },
  "platformRevenue": {
    "net": 0,           // Σ platformFeeNetClp (MANAGED + OWN_*)
    "vat": 0,           // Σ platformFeeVatClp
    "saas": 0,          // = gmv.saas (ingreso 100% plataforma)
    "total": 0          // net + vat + saas
  },
  "gatewayCost": 0,     // Σ gatewayFeeClp real reportado
  "pendingPayout": {
    "pending":  { "count": 0, "net": 0 },
    "approved": { "count": 0, "net": 0 }
  }
}
```

`GET /api/admin/finance/accrual` → por actor con devengado no
liquidado:

```json
[{
  "actorType": "PRODUCER|ACADEMY|VENUE",
  "actorId": "…",
  "actorName": "…",
  "oldestPaymentAt": "…",
  "paymentCount": 0,
  "gross": 0,
  "estimatedNet": 0,        // gross − deducciones proyectadas
  "ownMethodReceivable": 0  // OWN_METHOD_* devengado (actor nos debe)
}]
```

`GET /api/admin/finance/mrr`:

```json
{
  "mrr": 0,
  "arr": 0,
  "byTier": [{ "kind": "ACADEMY", "tierCode": "PRO", "count": 3,
               "monthlyAmount": 0 }],
  "customContracts": 0,      // ENTERPRISE/PRO_BIG "a convenir"
  "funnel": { "ACTIVE": 0, "PENDING_CARD": 0, "FAILED_CARD": 0,
              "CANCEL_PENDING": 0 },
  "subscriptions": [{ "id", "kind", "actorName", "tierCode",
                      "billingCycle", "monthlyAmount",
                      "nextInvoiceAt", "status" }]
}
```

`GET /api/admin/browse/payments` agrega `feeMode`, `platformFeeRate`,
`producerNetClp`, `gatewayFeeClp`, `currency` a su select.

## Accrual — misma fuente de verdad

`computeSettlement` (payouts.controller) gana un tercer argumento
opcional `{ unliquidatedOnly?: boolean }` que agrega
`payoutLines: { none: {} }` al `where` de pagos. El accrual:

1. Busca pagos PAID sin `PayoutLine` y extrae los actores atribuidos:
   TICKET → `event.producerId` ? PRODUCER : (`academyId` ? ACADEMY :
   `venueId` ? VENUE); SERIES_PASS → serie.producerId; MEMBERSHIP →
   plan.academyId; WORKSHOP → class.slot.academyId; PRIVATE →
   `decodePrivateRef`. PLATFORM_SUB se excluye (ingreso nuestro).
2. Por cada actor, `computeSettlement(actor, epoch→now,
   {unliquidatedOnly:true})` — las deducciones proyectadas son las
   mismas que liquidaría un payout real.
3. `ownMethodReceivable` = Σ líneas OWN_METHOD_* (receivable, no
   payable). `estimatedNet = net`.
4. Nombre del actor: Person.name (PRODUCER) / Academy.name /
   Venue.name.

## MRR

`PlatformSubscription` con `status = ACTIVE` (incluye
`CANCEL_PENDING`? NO — solo ACTIVE; CANCEL_PENDING va al funnel como
churn próximo). Precio por sub: `academy_tier.<tier>_<ciclo>_clp` /
`producer_tier.<key>_<ciclo>_clp` (`producerTierParamKey`); ENTERPRISE
y PRO_BIG sin param → `customContracts`. `monthlyAmount = precio /
CYCLE_MONTHS[cycle]`. Nombre: academy.name / producer.name.

## Frontend

`/admin/finanzas` (`AdminGate`, `ConsoleHeader`): header de KPI cards
(GMV segmentado, ingreso plataforma neto+IVA, por transferir,
no-liquidado) + 4 tabs (`PillTabs`):

- **Liquidaciones**: lista payouts (estado/actor/período/gross/
  deducciones/net), expandible con líneas agrupadas por tipo,
  acciones: Aprobar, Marcar pagado (input evidenceUrl), Generar
  (modal actorType+actor+período → POST /admin/payouts/generate).
- **Por liberar**: accrual por actor (nombre, desde, órdenes, gross,
  deducción est., neto est., receivable) + "Generar" que abre el
  modal pre-llenado (período oldestPaymentAt→hoy). Cola de
  PENDING/APPROVED arriba con acceso directo a aprobar/pagar.
- **Pagos**: `/admin/browse/payments` con columnas de desglose +
  link "verificar cadena" → `/admin/datos` (verify-chain existente).
- **SaaS**: cards MRR/ARR + tabla de subs activas (actor, tier,
  ciclo, mensual, próximo cobro) + funnel de estados.

i18n en `parts/admin.json` (`admin.finance.*`). Mobile-first,
skeletons por el estándar de carga, dark-first.

## Testing

`finance.controller.spec.ts` con fake-prisma (mismo patrón que
`payouts.controller.spec.ts`): segmentación del summary,
unliquidatedOnly excluye liquidados, OWN_METHOD va a receivable,
actores resueltos por nombre, MRR normalizado por ciclo + custom
contracts. Spec de payouts: caso `unliquidatedOnly` en
computeSettlement.
