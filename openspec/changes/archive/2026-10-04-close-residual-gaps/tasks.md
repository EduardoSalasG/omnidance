## 1. StubGateway con suscripciones (TDD)

- [x] 1.1 Tests rojos en `subscriptions.service.spec.ts` (o spec nuevo): subscribe con stub → `needs_card` con registerUrl que apunta al callback local; customer-return con token stub → sub ACTIVE + primer invoice liquidado; cancel → CANCEL_PENDING; `Payment.gateway === "STUB"` en la liquidación. Verificar que fallan contra el StubGateway actual (capability check rechaza).
- [x] 1.2 `StubGateway implements SubscriptionProvider`: Maps en memoria para planes/customers/tokens/subs; `registerCustomerCard` devuelve `${returnUrl}?token=stub_<tok>`; `createSubscription` genera invoice inicial pagada + `next_invoice_date` por intervalCount; `getSubscription` de id desconocido → `status:4`; `cancelSubscription` → `cancel_at_period_end` o `status:4` (immediate). Tests de 1.1 en verde.
- [x] 1.3 `SubscriptionsService`: reemplazar gates `gateway.name === "FLOW"` por capability check (`flow()` privado renombrado, mismo mensaje de error adaptado a "gateway sin suscripciones"); `Payment.gateway` = `this.gateway.name`. `tsc --noEmit` limpio + suite payments verde.

## 2. Integridad de suscripciones huérfanas (TDD)

- [x] 2.1 Test rojo: tras `createSubscription` exitoso, la fila persiste `flowSubscriptionId` antes de la transición de estado (crash-simulado entre ambos puntos vía mock del prisma/fake gateway). Implementar: `update` incondicional de `flowSubscriptionId` inmediatamente post-create en `createFlowSubscription`; la transición condicional se mantiene.
- [x] 2.2 Test rojo: `reconcileAll` encuentra un `subscription/create` OK en `GatewayTransaction` sin fila local que referencie su `subscriptionId`, la remota sigue activa → cancel inmediata llamada + sub queda cancelada en Flow (fake). Implementar sweep dentro de `reconcileAll` (escaneo acotado por createdAt, extracción de `responseBody.subscriptionId`, casos: sin fila / ACTIVATING > TTL / CANCELED local → remote check + cancel inmediata; ACTIVE/CANCEL_PENDING → skip).
- [x] 2.3 Verificar idempotencia del sweep: huérfana ya cancelada en remoto (status 4) → sin llamada de cancel. Tests payments completos verdes.

## 3. Flake e2e leads

- [x] 3.1 `leads.e2e.spec.ts`: crear admin propio en `beforeAll` (patrón mkPerson, id a `personIds` para cleanup), usar su id para `adminSession` y para el lookup de la notificación `lead.new`. `pnpm vitest run test/leads.e2e.spec.ts` verde.
- [x] 3.2 `pnpm test` (suite completa) — leads verde dentro del run paralelo, sin 401s. Causa raíz adicional: cada spec e2e levanta su propio PrismaClient (pool ~33 conn con 16 cores) → agotamiento de `max_connections` → timeouts de `beforeAll`. Fix: `test/setup.ts` capea `connection_limit=4` por worker + `hookTimeout: 60_000` en `vitest.config.ts`.

## 4. Precios de compromiso en seed

- [x] 4.1 `seed-dev.ts`: Mambo Madness Trimestral 180000→162000 y Semestral 360000→324000; bullets de descuento ("Ahorras $X vs. el mensual"). `pnpm db:seed` idempotente — re-run actualiza precio/description sin duplicar.

## 5. Cierre

- [x] 5.1 `tsc --noEmit` api + `pnpm --filter @omnidance/api build` limpio.
- [x] 5.2 Docs: `docs/flows.md`/`docs/architecture.md` — revisar si el diagrama de suscripciones menciona "solo Flow"; actualizar lo que quede inexacto. `AGENTS.md` si alguna convención cambia (capability check del gateway).
- [x] 5.3 `openspec validate close-residual-gaps --strict` limpio; commit(s) en `dev`.
