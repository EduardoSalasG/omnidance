# Handoff — 2026-09-24 (b) — Suscripciones Flow + auditoría BIAN

## Qué se implementó (plan completo, 11 tareas — `docs/superpowers/plans/2026-09-24-suscripciones-flow-auditoria-bian.md`)

**Suscripciones recurrentes nativas Flow** (MONTHLY/QUARTERLY/SEMIANNUAL solamente):
- `MembershipPlan.flowPlanId` (lazy `omni_<planId>`, amount = price + `service_fee.membership_clp`), `Person.flowCustomerId`, `MembershipSubscription` (PENDING_CARD → ACTIVATING → ACTIVE → CANCEL_PENDING → CANCELED).
- `POST /checkout/membership-subscription {planId, acceptRecurring:true}` → `needs_card` (registerUrl Flow) | `subscribed`. `POST /payments/flow/customer-return` (público, 303 → `?sub=ok|error`), `POST /payments/subscription-webhook` (público, requiere token para disparar reconcile). `GET /subscriptions/mine|/:id` + `POST /subscriptions/:id/cancel` (at_period_end).
- Anti doble-cobro: advisory lock `pg_advisory_xact_lock(hashtext("sub:"+personId))` + claim atómico `updateMany` condicional + reuse de PENDING_CARD fresca (15min) + compensación de sub Flow huérfana.
- Reconcile: cron diario `0 9 * * *` + webhook fast-path + `GET /subscriptions/:id` — invoice pagada → `Payment mem_<planId>_<invoiceId>` → `settleMembership` (misma fuente de verdad que compra única: extiende `endsAt`). Dedup `lastInvoiceId` + `refId @unique`; Payment PENDING dedupeado se reintenta.
- Reminder `membership.renewal_reminder` 24h antes de `nextInvoiceAt` (dedup `reminderSentFor`). Mora → `membership.renewal_failed` + `RENEWAL_FAILED` en ledger; **sin grace** — enrollment expira en `endsAt`.
- Web: elección "Comprar / Suscribirme" en cards de plan recurrente con consentimiento explícito (checkbox, monto real price+fee vía `params/public`), `SubscriptionManage` (badge/cancelar/estados), badges en Mis academias, banners `?sub=` en ficha.

**Auditoría BIAN universal** (toda la economía, no solo suscripciones):
- `GatewayTransaction` — cada call Flow (OUTBOUND vía `FlowGateway.call()` + INBOUND en callbacks), request/response completos sanitizados (`s` → `sha256:<16hex>` idempotente), correlationId por operación, latencia, httpStatus.
- `PaymentEvent` — ledger append-only hash-chain (`seq`/`prevHash`/`payloadHash`, canonical JSON `JSON.stringify(sortKeys(JSON.parse(JSON.stringify(v))))`). Eventos: ORDER_CREATED, WEBHOOK_RECEIVED (siempre, duplicados=evidencia), STATUS_CONFIRMED, SETTLED/RENEWAL_SETTLED, FAILED, AMOUNT_MISMATCH (+notify admins), SUBSCRIPTION_CANCELED, RENEWAL_FAILED, IMPORTED (backfill).
- `Payment` +5 campos "verdad Flow": gatewayFeeClp/gatewayReportedAmount/gatewayMedia/gatewayPaidAt/gatewayRaw (persistidos en PAID; `gatewayRaw` nunca sale por endpoints de usuario).
- Vistas: `GET /payments/mine` (dancer, con eventCount + nombres resueltos), `by-event` (producer owner|admin), `by-academy` (academy owner|admin), `/payments/:id/events` (owner|admin), `GET /admin/payments/:id/verify-chain` → `{ok, events, firstBadSeq}`. admin/browse: entities `payment-events`, `gateway-transactions`, `membership-subscriptions`.
- Web: `/perfil/pagos` (historial + ledger expandible + subs vivas), consola productor sección Pagos, `/academia/cobros`, admin/datos entities nuevas.

## Commits (dev)

`cfd2588` schema · `e271ec1`+`1c210b5` ledger hash-chain · `09374a0`+`11f3784` gateway tx + call() · `94cf9f4`+`181dd2c` métodos Flow sub · `56a08ff` PaymentSettlementService · `a90fb22`+`4224bb6`+`83efab6` subscriptions service/endpoints · `fe438d7`+`ac889af` scheduler+reminder · `c6d7dd9`+`80880bc` endpoints auditoría · `30f2bef`+`58783e5`+`b19f4f9` web suscripción · `ae85ccc` web auditoría · `f954fab` docs+openapi+smoke.

## Verificado

- `npx vitest run` completo: **50 files / 1121 tests PASS** (antes de los fixes de teardown: 4 archivos fallaban por FK PaymentEvent en `payment.deleteMany` — los teardowns ahora borran `paymentEvent` primero; `wiring.e2e` DI actualizado con los 3 providers nuevos; `academies.e2e` test stale corregido al contrato real: `id` no `classId`, historial solo attended/cancelled).
- `tsc --noEmit` api+web limpio · i18n-audit ALL_KEYS_OK · openapi/postman regenerados (182 paths).
- Smoke vivo stub: `smoke-subscription.cjs` 14/14 (validaciones 400/401/404, mine, ledger owner, verify-chain admin ok + 403 dancer, webhook público). `smoke-membership-checkout.cjs` 22/22 sin regresión.
- Boot fail-fast verificado en vivo: `PAYMENT_GATEWAY=flow` sin credenciales → error claro al arrancar.

## Pendiente — requiere acción del usuario

1. **Llenar `.env` raíz**: `FLOW_API_KEY` y `FLOW_SECRET_KEY` están **vacíos** (de sandbox.flow.cl → Mis datos → Integraciones). Con ellos + `PAYMENT_GATEWAY="flow"` → `node apps/api/scripts/smoke-subscription.cjs` corre el camino real (subscribe → needs_card → registerUrl sandbox real; valida plans/create + customer/create + register en vivo).
2. El alta de tarjeta (registerUrl → página Flow) requiere browser — smoke cubre hasta needs_card; el retorno es `customer-return` → `?sub=ok`.
3. Producción sigue bloqueada por diseño: `FLOW_BASE_URL` debe ser `https://sandbox.flow.cl/api` — habilitar prod requiere relajar ese check tras validar sandbox end-to-end.

## Gaps / follow-ups conocidos (todos documentados en progress.md)

- Migración versionada pendiente (se usó `db push` — AGENTS lo permite, pero conviene `db:migrate` antes de prod).
- `refreshStatus` (polling) no trae `paymentData` → PAID por polling queda sin campos gateway (webhook sí los trae).
- Race benigna: WEBHOOK_RECEIVED fuera de tx puede colisionar seq bajo webhooks concurrentes (retry-safe).
- `syncPlan` (plans/edit) existe sin caller — si staff cambia precio/nombre, el plan Flow espejo queda congelado al amount de creación.
- Sub Flow huérfana si crash entre `createSubscription` y update local (ventana ~1 HTTP call; compensación cubre update-fail).
- Stub no simula suscripciones (subscribe → 400 con stub — by design).
