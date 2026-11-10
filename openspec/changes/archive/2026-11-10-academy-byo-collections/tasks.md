# Tasks: BYO collections + take facturado mes vencido

## Credenciales y cobro

- [x] 1.1 Spec rojo: checkout de orden de academia con cuenta BYO cobra
  por el adaptador de SU cuenta (webhook `?account=` confirma - el
  routing por cuenta ya era actor-genérico); sin cuenta → solo claim
  manual. Tests en `checkout.service.spec.ts` (describe
  purchaseMembership): orden por adaptador BYO + gatewayAccountId,
  sin cuenta → `AcademyGatewayUnavailableError`, bloqueo →
  `AcademyCollectionsBlockedError`.
- [x] 1.2 Actor-scope sobre la tabla de productores (decisión: se
  generalizó `ProducerGatewayAccount` → `ActorGatewayAccount` con
  `@@map`, `producerId`/`academyId` nullable XOR - una sola tabla,
  `Payment.gatewayAccountId` y webhook `?account=` sirven a ambos).
  Cifrado/vista mask/upsert/disable reusados; endpoints
  `GET|PUT|DELETE /academies/:id/gateway-account` (capability
  `payments`). PENDIENTE en esta sesión: la sección de la consola web
  `/academia/configuracion` para alta/edición (la API ya existe - la UI
  es el slice que falta, ver 1.8).
- [x] 1.3 Resolución en checkout para MEMBERSHIP/WORKSHOP/PRIVATE vía
  `academyOrderGateway` (BYO o `AcademyGatewayUnavailableError` - el
  path our-Flow no emite órdenes nuevas one-off de academias).
  PENDIENTE documentado: suscripciones CARD siguen en our-Flow interim
  - el engine per-account (customer/plan espejo/remoto +
  webhook `?account=` + reconcile por
  `MembershipSubscription.gatewayAccountId`, columna ya creada) es el
  siguiente slice; renovaciones legacy siguen en el modelo histórico
  de payout hasta migrar.

## Take y facturación

- [x] 1.4 Spec rojo + verde: Payment de academia BYO congela
  `academyTakeRate`/`academyTakeClp = amount × academy_fee.net_pct`
  (default 1,0) al crearse la orden - test cubre default y param
  editable.
- [x] 1.5 Factura mes vencido como documento propio
  `AcademyCollectionsStatement` (decisión: la línea dentro de
  `PlatformSubscription` no calza - el cargo Flow de la sub es plan
  espejo de monto fijo, no admite líneas variables por período).
  Neto + IVA 19%, emisión idempotente `@@unique(academyId, period)`,
  cobro por `PLATFORM_CHARGE` (collect sobre medio registrado o link),
  job diario `academy-collections.statements` (emisión mes cerrado +
  reconcile).
- [x] 1.6 `Academy.collectionsBlockedAt` (separado de
  `billingBlockedAt` - mora de liquidación BYO vs mora SaaS): el
  reconcile lo setea pasada la gracia (`dueAt` = emisión +
  `academy_billing.grace_days`) y lo libera al pagar; el settle del
  PLATFORM_CHARGE también lo libera al vuelo. Checkout BYO rechaza
  gateway-orders; claim manual no se toca.
- [x] 1.7 Param `academy_fee.net_pct` = 1,0 en seed-common;
  `academy_cobros.take_multiplier` marcado LEGACY. /admin/params ya es
  genérico (sin whitelist admin).

## Liquidación y deprecación

- [x] 1.8 `GET /academies/:id/statements` + `:period` (detalle con
  operaciones) + `GET /admin/finance/academy-statements` - HECHO en
  JSON. Export `GET /academies/:id/statements/:period.{csv,pdf}?lang=`
  (buildTablePdf + toCsv, filename localizado, declarados antes del
  :period plano). Vista consola: sección "Pasarela de pagos" en
  `/academia/configuracion/metodos-de-pago` (espejo del productor),
  `/academia/cobros/liquidaciones` + `/[period]` (preview `open` +
  detalle con ops + botones de export), tab "Cobranza academias" en
  `/admin/finanzas` (filtro status + flag de bloqueo).
- [x] 1.9 Payout de academias solo histórico: el motor viejo filtra
  `gatewayAccountId: null` para actorType ACADEMY (las órdenes BYO no
  generan GATEWAY_FEE_PASSTHROUGH ni ACADEMY_COBROS_TAKE; históricos
  our-Flow se liquidan con el motor viejo intacto).
- [x] 1.10 Precios: decisión documentada en design.md §"Pricing" -
  los `academy_tier.*_monthly_clp` se mantienen como precio final
  (nota "pending owner": el design es ambiguo sobre si son neto o
  final; se eligió lo conservador). El take BYO SIEMPRE es neto + IVA
  sobre el statement.

## Verificación

- [x] 2.1 Vitest: corrida completa `pnpm --filter @omnidance/api test`
  = 135 archivos / 2531 tests verdes (incluye fix de `matchWhere` en
  payouts/finance specs: `field:null` del where = IS NULL, el fake
  materializa campos ausentes como undefined).
- [x] 2.2 Repro manual BYO verificado (2026-11-10, stack vivo): alta
  STUB por PUT (mask + webhookUrl, nunca plano), checkout MEMBERSHIP
  por adaptador propio (gatewayAccountId + academyTakeClp = 1%
  congelado), `academy.no_gateway` sin cuenta (TRANSFER/claim sigue),
  `academy.collections_blocked` con flag, statement emitido vía job
  admin (`POST /admin/jobs/academy-collections.statements/run`) +
  detalle + CSV/PDF válidos, UI liquidaciones + sección pasarela OK.
- [x] 2.3 Typecheck web+API verdes; `pnpm --filter @omnidance/api build`
  verde. Docs: qa-flows-inventory, omni-dance.md §consolidaciones,
  architecture.md, flows.md, estrategia-comercial §6 (take BYO 1%
  neto+IVA reemplaza el ~4,8% por payout). openapi.json + postman
  regenerados contra API viva (382 paths).
- [ ] 2.4 Archive - explícitamente fuera de alcance de esta sesión
  (el change queda abierto por instrucción del usuario).
