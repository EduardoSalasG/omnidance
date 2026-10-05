# Handoff — 2026-09-25 — Checkout real de membresía + cierre de gaps pendientes

Sesión que continúa el handoff 2026-09-24(b). Se cerraron todos los gaps técnicos
que no dependían de credenciales del usuario, y se rediseñó el checkout de
membresías tras un critique UX (impeccable) que lo calificó "botón de pago, no
checkout" (25/40 — el P0 era precio mostrado ≠ precio cobrado).

## Commits (dev)

- `7a93d01` web+payments: checkout real de membresía — revisión de orden, fee declarado, elección único/suscripción, retomar tarjeta
- `75d7405` seed: planes de membresía para todas las academias — 25k/40k general, Mambo Madness premium con trimestral/semestral ilimitado
- `6d2124b` web: skeletons para cargas de contenido — Spinner reservado a acciones y gates
- `1fb29ae` api: baseline migración + refreshStatus gatewayData + PATCH planes→Flow syncPlan + settle/ledger sin races
- `3f18ed8` web: edición de planes en consola academia + cancelar suscripción desde /perfil/pagos
- `c322794` docs: openapi + postman regenerados (184 paths)

## Qué se implementó

### Checkout de membresía (critique → implementación)

- **`GET /checkout/membership-quote?planId=`** — revisión de orden sin cobro:
  total (price + `service_fee.membership_clp`), `resultingEndsAt` calculado con
  la misma regla del settle, sub viva, gateway. Spec: 6 tests.
- **Página `/academias/[id]/checkout?plan=X`** replicando el patrón de tickets:
  resumen de orden (academia/plan/vigencia), breakdown plan + cargo + **total
  real**, Segmented único/suscripción (solo recurrentes + Flow), consent con
  monto real + anticipación "Flow te pedirá tu tarjeta", interstitial antes del
  salto de dominio, trust line "Pago seguro procesado por Flow".
- **Card de plan**: muestra el **total real** (price+fee) con caption "incluye
  cargo de servicio"; sin CTA si el plan ya tiene suscripción viva (anti
  doble-cobro); copy de error propio (ya no "Entradas agotadas").
- **Estados muertos cubiertos**: `PENDING_CARD` → "Te falta registrar tu
  tarjeta" + botón que retoma el disclaimer Flow; `FAILED_CARD` cubierto;
  `nextCharge` muestra fecha + monto.
- `/checkout/return` captura `orderType` al primer poll → CTAs de
  failed/stillPending/error apuntan a `/academias` en membresías.
- `/perfil/pagos`: pago linkea a su ficha (evento o academia — `academyId`/
  `eventId` agregados al row de auditoría); suscripción linkea a su academia.
- `PlanPurchaseCta` eliminado — su lógica vive en el checkout.

### Cierre de gaps pendientes del handoff anterior

- **Migración versionada**: `prisma/migrations/20260925000000_baseline` —
  baseline marcada como aplicada (schema ya estaba via `db push`).
  `migrate status`: "Database schema is up to date". `db:migrate` listo
  para prod.
- **`refreshStatus` → `{status, gatewayData}`**: el polling de
  `GET /payments/:id` ahora persiste la verdad monetaria de Flow
  (fee/media/monto/paidAt) igual que el webhook — cierra el gap de dev
  donde el webhook no alcanza localhost.
- **`PATCH /academies/:id/plans/:planId`** + `subscriptions.syncMirrorPlan`:
  edición de planes (name/type/price/classCount/periodDays/description/active)
  con `AcademyAccess.requireAdminister`. Si el plan tiene espejo Flow empuja
  `plans/edit` **antes** del update local (Flow falla → local intacto, 502).
  Cambio de `type` bloqueado (Flow no admite cambiar el intervalo). `syncPlan`
  ya no está huérfano. UI: PlansSection con modo edición, prefill, toggle
  active, type bloqueado cuando hay espejo.
- **Race del ledger corregida** (más profunda de lo documentado): el re-check
  `fresh.status` bajo READ COMMITTED **no deduplicaba** — dos webhooks
  concurrentes leían PENDING y ambos liquidaban (doble SETTLED + campos
  gateway pisados). Fix: claim atómico `updateMany({status})` en los 4 caminos
  de settle + `pg_advisory_xact_lock(hashtext(paymentId))` en
  `emitPaymentEvent` (seq serializada por payment). Los emisores fuera de tx
  (WEBHOOK_RECEIVED, ORDER_CREATED renovación, SUBSCRIPTION_CANCELED,
  RENEWAL_FAILED) ahora corren en `$transaction`. Test e2e real: 2 webhooks
  concurrentes → seqs únicos, 1 SETTLED, cadena íntegra.
- **Cancelar suscripción desde `/perfil/pagos`**: mismo 2-step de la ficha
  (cancelar → confirmar "conservas el acceso hasta el fin del período") →
  `POST /subscriptions/:id/cancel`. Refresh silencioso de subs (sin flash de
  skeleton). La card ya no es `<Link>` completa (botones anidados inválidos).

### Skeletons (audit de estados de carga)

- Nuevo `components/ui/skeleton.tsx`: `Skeleton`/`SkeletonText`/`SkeletonCard`/
  `SkeletonList` — `.page-loading` (delay 200ms), `role="status"` + sr-only,
  `motion-reduce` sin pulse.
- ~40 sitios de carga de contenido convertidos de spinner a skeleton.
- `PageLoading` queda solo para gates (sesión/rol donde el layout depende del
  resultado); `Spinner` solo para acciones. Regla formalizada en AGENTS.md.

### Seed

19 academias con planes: general Mensual 1 clase $25.000 / 2 clases $40.000;
Mambo Madness premium (1 clase $40.000, ilimitado $60.000, VIP $99.000 con
clase particular, trimestral ilimitado $180.000, semestral ilimitado $360.000
— lineal 3×/6×, sin descuento). MuéveteOnTour y Academia Tumbao conservan sus
planes curados.

## Verificado

- `npx vitest run` completo: **50 files / 1137 tests** — un solo archivo falló
  (`leads.e2e`, 9 tests 401) por interferencia de paralelismo entre specs e2e
  sobre la misma DB; **pasa aislado 35/35** — flake preexistente, no del cambio.
- `tsc --noEmit` api+web limpio · i18n-audit `ALL_KEYS_OK` · impeccable detector
  `[]` · openapi/postman regenerados (183→184 paths por el PATCH).
- Smoke vivo: `.tmp-smoke-planedit.cjs` **9/9** (POST plan, PATCH nombre/precio/
  descripción/active, 403 ajeno, 400 type con espejo, 200 price+stub).
- Suite de payments: 239/239 (incl. concurrencia real + syncMirrorPlan).
- `academies.e2e`: 54/54 (PaymentsModule resuelve en TestingModule; scheduler
  inerte en test).
- Browser preview abierto (`http://localhost:3000`) — rutas autenticadas
  requieren sesión del usuario; el checkout de membresía **no se recorrió en
  browser todavía** (tsc + tests solamente).

## Pendiente — requiere acción del usuario

1. **`FLOW_API_KEY` + `FLOW_SECRET_KEY`** en `.env` raíz (sandbox.flow.cl → Mis
   datos → Integraciones). Sin ellos `PAYMENT_GATEWAY=flow` no arranca y toda
   la validación sigue contra stub.
2. Alta de tarjeta real (registerUrl → página Flow → `?sub=ok`) — browser.
3. Producción Flow sigue bloqueada por diseño hasta validar sandbox e2e.
4. Verificación visual autenticada del checkout de membresía (recomendado con
   throttling lento para ver skeletons).

## Gaps residuales conocidos

- Sub Flow huérfana si crash entre `subscription/create` y update local
  (~1 ventana HTTP; compensación best-effort cubre update-fail).
- Stub no simula suscripciones (subscribe → 400 con stub — by design).
- Flake de paralelismo entre specs e2e (leads vs. specs que borran personas) —
  considerar aislamiento por schema/DB o serializar specs e2e si persiste.
- Si se quisiera incentivo por compromiso en planes largos: trimestral/semestral
  son lineales (3×/6×); aplicar ~10% off es un cambio de seed de una línea.
