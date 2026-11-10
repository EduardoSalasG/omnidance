# Handoff: academy-byo-collections IMPLEMENTADO + verificado

Sesión 2026-11-10. Orquestación multi-agente: el núcleo de
`academy-byo-collections` quedó implementado, verificado E2E manual y
documentado. El change **queda ABIERTO** (no archivado) - decisión del
owner pendiente: el slice de suscripciones CARD per-account sigue
interim en our-Flow (documentado en tasks 1.3 y como pendiente).

## Resultado

- **Actor-scope**: `ProducerGatewayAccount` → `ActorGatewayAccount`
  (`@@map` sin rename de tabla; `producerId`/`academyId` nullable XOR).
  Una sola tabla, `Payment.gatewayAccountId` y webhook `?account=`
  sirven a ambos actores. Migración `20261127000000_academy_byo_collections`
  aplicada a dev.
- **Checkout**: órdenes MEMBERSHIP/WORKSHOP/PRIVATE de academia cobran
  por SU adaptador BYO; sin cuenta → `academy.no_gateway` (solo claim
  manual); `collectionsBlockedAt` → `academy.collections_blocked`
  (TRANSFER/manual sigue). Quotes exponen `gatewayAvailable`/
  `collectionsBlocked`. Subs CARD: interim our-Flow (next slice).
- **Take**: `academyTakeRate`/`academyTakeClp` congelados por orden
  (`academy_fee.net_pct` = 1,0 en seed). **Factura mes vencido**:
  `AcademyCollectionsStatement` (neto + IVA 19%, @@unique
  academyId+period) + `AcademyCollectionsService` + job diario
  `academy-collections.statements` (emisión + reconcile + collect por
  PLATFORM_CHARGE). `collectionsBlockedAt` por impago (gracia
  `academy_billing.grace_days`), libera al pagar.
- **Deprecación**: payout de academias filtra `gatewayAccountId:null`
  (BYO nunca entra a payout; históricos our-Flow intactos).
- **Superficies**: `GET|PUT|DELETE /academies/:id/gateway-account`,
  `GET /academies/:id/statements(./:period)` + export
  `./{csv,pdf}?lang=` (buildTablePdf), `GET /admin/finance/academy-statements`.
  UI: sección "Pasarela de pagos" en `/academia/configuracion/metodos-de-pago`,
  `/academia/cobros/liquidaciones` (+[period]), tab "Cobranza academias"
  en `/admin/finanzas`. Copy de checkout BYO en los 3 checkouts.
- **Pricing (1.10)**: `academy_tier.*_monthly_clp` se mantienen como
  precio final (nota "pending owner" en design.md); el take BYO
  siempre neto+IVA.

## Verificación (evidencia)

- `pnpm --filter @omnidance/api test` = **135 archivos / 2531 tests
  verdes**; web typecheck/lint/test (40) y API build/typecheck verdes;
  `openspec validate --changes` verde.
- **Smoke manual BYO (6/6)**: alta STUB por PUT (mask, nunca plano);
  checkout por adaptador propio (gatewayAccountId + takeClp 1%);
  `no_gateway`/`collections_blocked` con claim manual intacto;
  statement emitido vía `POST /admin/jobs/academy-collections.statements/run`
  + CSV/PDF válidos; páginas UI OK. Evidencia en
  `%TEMP%/byo-repro/` (scripts + screenshots).
- **Smoke pack-1-clase** (previo en la sesión): UI comunica agotamiento
  por prevención en las 3 superficies; book2 → 409. `%TEMP%/smoke-pack1/`.
- Fixes propios: `matchWhere` en `payouts.controller.spec.ts` y
  `finance.controller.spec.ts` (`field:null` = IS NULL, fake usaba
  `undefined`); flake de calendario `gap-crm` (checkins del bringer
  fijados por mes civil, no por días); i18n plural
  `creditsWeekly/Pack` + `statements.openLine`.
- Docs: omni-dance.md (consolidaciones), estrategia-comercial §6,
  qa-flows-inventory, architecture/flows, openapi.json + postman
  (382 paths, API viva).

## Operativo

- `apps/api/.env`: persistí `PRODUCER_GATEWAY_KEY` (el alta de
  credenciales daba 500 sin ella; la key de dev era inline del smoke).
- API :4000 corre `node dist/main.js` (shell `df7ad1`, con la key en
  env). Web :3000 y docker DB/Redis vivos.
- DB dev tiene data demo BYO: cuenta STUB de Muvet, Payment BYO PAID
  backdateado a oct, `AcademyCollectionsStatement` 2026-10 PENDING.

## Pendientes / gaps

- **Decisión**: archivar el change (2.4) o dejarlo abierto hasta el
  slice de subs CARD per-account (engine: customer/plan remoto +
  webhook por cuenta + reconcile por `sub.gatewayAccountId`, columna
  ya creada). También queda la pregunta de pricing del design
  (params como neto vs final) - resuelta conservadoramente.
- Bug preexistente detectado: `GET /admin/jobs/:key/runs?take=N` →
  400 (`@IsInt` sin transform en query). Sin take funciona.
- Collect de statements en dev degrada a reintento (Flow sandbox
  rechaza `*@omnidance.dev`) - comportamiento correcto por diseño.
- Flake residual `gap-crm`: los demás fixtures siguen con offsets en
  días; `core` podría ganar `monthsContinuous` extra en otras
  configuraciones de fecha. Recomendado: fijar todos los fixtures por
  mes civil.
- Acumulados sin cambio: flake `dancer-eventos` mobile; drift i18n
  `academyPay.report.*`, `academy.levelsConfig.backToGlobalBody`.
