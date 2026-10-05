# Handoff 2026-09-28 - cierre de gaps residuales (suscripciones)

Change OpenSpec: `close-residual-gaps` (validado `--strict`). Commit `f568efa` en `dev`.

## Qué se implementó

1. **StubGateway como SubscriptionProvider** (`stub.gateway.ts`): simulación completa en memoria - planes espejo, customers idempotentes por externalId (`stub_cus_<externalId>`), registro de tarjeta con `registerUrl = returnUrl + ?token=stub_reg_*` (el browser cae directo en `customer-return` sin salir de localhost), `createSubscription` con primera invoice ya pagada (el reconcile la liquida como renovación), `getSubscription` de id desconocido → `status:4` (converge a CANCELED tras restart del proceso). Estado se pierde al reiniciar - es simulación, no persistencia.
2. **Capability check, no name check** (`subscriptions.service.ts`): `supportsSubscriptions()` verifica presencia de `createSubscription` en el gateway; `provider()` lanza 400 "este gateway no soporta suscripciones". Todos los gates `gateway.name === "FLOW"` migrados; los `provider: "FLOW"` hardcodeados en `gatewayTx.record` ahora usan `this.gateway.name` (STUB auditado como STUB). `Payment.gateway` en reconcile = `this.gateway.name`.
3. **Integridad de subs huérfanas**:
   - `createFlowSubscription`: persistencia **incondicional y temprana** de `flowSubscriptionId` justo tras `createSubscription` (cierra la ventana crash-entre-llamada-y-update); si falla, la transición condicional también falla → compensación `cancelSubscription(immediate)` y el sweep la rescata vía auditoría.
   - `sweepOrphanSubscriptions()` dentro de `reconcileAll`: escanea `GatewayTransaction` OUTBOUND `subscription/create` ok=true con `createdAt ≤ now−2min` (grace anti-race), extrae `responseBody.subscriptionId`, compara contra filas locales - ACTIVE/CANCEL_PENDING = cubierta; ACTIVATING fresca (<15min) = en vuelo; resto (sin fila / ACTIVATING stale / CANCELED local con remota viva) → `getSubscription` + `cancelSubscription(immediate)`. Remota ya cancelada (status 4) → skip. Errores por-item se loguean sin abortar el sweep.
4. **Flake e2e (dos causas)**:
   - `leads.e2e`: ya no hace `findFirstOrThrow` sobre *cualquier* ADMIN APPROVED (podía tomar la fixture de un spec paralelo que la borra → 401). Crea su propio `Admin Leads Test` + `Dancer Leads Test`, ids a `personIds` para cleanup; lookup de notificación scoping por nombre. `afterAll` con guard de init parcial.
   - **Causa raíz más profunda**: cada spec e2e levanta su propio `PrismaClient` con pool default `num_cpus*2+1` (~33 con 16 cores); ~15 workers × 33 ≈ 500 vs `max_connections=100` de Postgres → `beforeAll` colgado → timeout 10s aleatorio en cualquier spec. Fix: `test/setup.ts` (nuevo, `setupFiles` en `vitest.config.ts`) capea `DATABASE_URL` con `connection_limit=4` por worker; `hookTimeout: 60_000` para el boot Nest bajo carga.
5. **Precios compromiso Mambo Madness** (`seed-dev.ts`): Trimestral 180k→**162k** (ahorro $18.000), Semestral 360k→**324k** (ahorro $36.000) - ~10% off vs. mensual ilimitado. Descripciones actualizadas. MuéveteOnTour ya tenía sus propios precios con descuento (120k/210k) - sin tocar. Re-seed verificado idempotente en DB real: precios y bullets actualizados in-place.

## Verificación

- `npx vitest run` (apps/api, suite completa paralela): **50 archivos / 1148 tests verde, 62.8s** (antes 81s con 2 specs colgados por timeout).
- `npx vitest run test/leads.e2e.spec.ts`: 35/35 aislado.
- `npx tsc --noEmit` (api): limpio. `pnpm --filter @omnidance/api build`: limpio.
- `pnpm db:seed`: re-run idempotente; `SELECT` confirma 162000/324000 + descripciones nuevas en DB.
- `openspec validate close-residual-gaps --strict`: válido.
- Tests nuevos en `subscriptions.service.spec.ts`: 55/55 - incluyen persistencia temprana del id, sweep (sin fila / ACTIVATING stale / race / remota ya cancelada → skip), stub como provider end-to-end (needs_card → customer-return → ACTIVE + settle + cancel → CANCEL_PENDING, `Payment.gateway === "STUB"`).

## Pendiente (requiere acción del usuario)

- **Validación Flow sandbox real**: `.env` tiene `FLOW_API_KEY`/`FLOW_SECRET_KEY` pero `PAYMENT_GATEWAY="stub"`. Pasos: `PAYMENT_GATEWAY=flow` → reiniciar API → subscribe en browser → registerUrl a sandbox Flow con tarjeta de prueba → verificar retorno `customer-return` → sub ACTIVE + primer invoice liquidado. Producción Flow sigue **bloqueado por diseño** (`resolveGateway` rechaza baseUrl no-sandbox) hasta que esta validación pase.
- **Browser checkout autenticado** de membresía (nunca recorrido en vivo - solo tsc+tests). Ahora además puede hacerse end-to-end con stub sin credenciales.

## Notas

- Con `PAYMENT_GATEWAY=stub`, subscribe ahora responde `needs_card` con registerUrl local (no `subscribed` directo) - el flujo completo (registro → retorno → ACTIVE) se ejerce en localhost. Para un atajo en dev, `getRegisterStatus` acepta el token del registerUrl.
- El sweep corre dentro del cron diario 09:00 existente (`SubscriptionsScheduler` → `reconcileAll`); no hay job nuevo.
- `docs/architecture.md` actualizado (lifecycle subscription, capability check, sweep, stub).
