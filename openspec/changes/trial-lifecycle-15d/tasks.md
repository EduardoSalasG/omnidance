# tasks: trial-lifecycle-15d

## 1. Datos y params

- [x] Migración: `ActivityEvent` (personId?, academyId?, type, refType?, refId?, data, createdAt + índices), `Academy.trialEndNotifiedAt`, `Person.proTrialEndNotifiedAt` (`pnpm db:migrate`)
- [x] Helper `emitActivity` tx-safe (patrón `emitPaymentEvent`)
- [x] Seed: `academy_billing.trial_days` → 15, `producer_pro.trial_days` → 15, `cx.contact.name|email|phone` (Eduardo Salas, eduardo@omnidance.tech, +56982439041), `cx.notify_email`

## 2. Otorgamiento

- [x] `producer_pro.trial_days` → `proTrialEndsAt` al aprobar `PersonRole(PRODUCER)` en `approveQueueItem` y grant directo (solo sin sub Pro viva ni trial vigente)
- [x] Spec del behavior + tests

## 3. Corte al vencer (academia)

- [x] `academy-tiers.ts`: `academyInTrial`, `academyTrialExpired`, `featuresForAcademy`; `assertAcademyFeature` consume academy completa
- [x] Delisting dancer: explore, directorio, listado de clases excluyen academias con trial vencido; booking y checkout rechazan con copy "no disponible"
- [x] Suscripción/billing siguen abiertos (exit path)
- [x] Tests: módulo gated 403, delisted, book/checkout rechazan, subscribe restaura

## 3b. Corte unificado de churn

- [ ] `reconcileSubscription`: en CANCELED definitivo (sin swap/reprice) limpiar `Academy.tier`/`billingCycle` y `Person.proTier` si no hay otra sub viva
- [ ] Notificación `academy.access_ended` / `producer.pro_access_ended` al actor
- [ ] Backfill one-shot: limpiar entitlements de actores sin sub viva (lista de afectados en salida)
- [ ] Tests: churn corta, swap no corta, productor vuelve a FREE

## 4. Correos

- [ ] Plantilla bienvenida: nombre + rol, features de todos los tiers con plan en prueba marcado, fecha fin, contacto CX
- [ ] Envío en creación de academia y aprobación de rol productor + ficha a `cx.notify_email`
- [ ] Plantilla último día + barrido en `subscriptions.reconcile` (ventana 24h, dedup en columnas nuevas)
- [ ] Promo diaria `trial-conv-<YYYYMMDD>`: percentOff 50, maxCycles 1, whitelist por actor, validUntil fin del día Santiago
- [ ] Tests del barrido: ventana, dedup, promo, expiración

## 4b. Ajuste admin de trial

- [ ] `PATCH /admin/academies/:id/trial` y `PATCH /admin/users/:id/pro-trial` (admin.access): fija fecha fin, audit + `trial.adjusted`
- [ ] UI: edición de fecha en ficha suscripción academia y ficha usuario (fila de la lista de trials también)
- [ ] Tests: extender reabre, acortar corta, audit emitido

## 5. Panel admin

- [ ] `/home/stats` lente ADMIN: `trialsActive`, `trialsExpiring` (≤7d), `trialsExpired`
- [ ] `GET /admin/trials`: filas con nombre, rol, email, tier, fecha fin, días restantes
- [ ] Web: card KPI + sección lista en inicio admin, navega a ficha

## 5b. Línea de vida en ficha admin

- [ ] Emisiones `emitActivity` en los hooks del change: trial.started (academia/productor), trial.ending (barrido), trial.ended/access.ended (corte), sub.started/renewed/canceled, role.approved, person.registered, billing.blocked, enrollment.started, payment.paid
- [ ] Script de backfill one-shot: siembra eventos históricos derivados con dedup por (refType,refId,type)
- [ ] `GET /admin/users/:id/timeline`: lee ActivityEvent, `{at, type, label, ref?}` orden desc
- [ ] Web: sección línea de vida en `/admin/usuarios/[id]` (icono/label por tipo)
- [ ] Tests: owner ciclo completo, dancer sin platsub, backfill dedup

## 6. Card CX en perfil

- [ ] Card "Customer Experience" en `/perfil` para ACADEMY_OWNER y PRODUCER (nombre, mailto, teléfono/WhatsApp desde params)

## 7. Frontend corte

- [ ] Consola academia con features vacías: nav/hub solo Inicio/Suscripción/Perfil; aviso en Inicio con CTA a Suscripción
- [ ] i18n es-CL de todos los strings nuevos

## 8. Gates y docs (actualización completa de documentación relacionada)

- [ ] `openspec validate --changes` verde; archivar change sin `--skip-specs`
- [ ] `omni-dance.md`: Trial 30d→15d, corte unificado trial/churn, ActivityEvent en el modelo, card CX, panel admin de trials
- [ ] `docs/qa-flows-inventory.md`: flujos nuevos (bienvenida, último día+promo, corte trial/churn, card CX, panel trials, PATCH trial, línea de vida)
- [ ] `docs/architecture.md`: modelo nuevo (`ActivityEvent`), endpoints admin nuevos, job del barrido
- [ ] `docs/flows.md`: diagrama del ciclo de vida del trial (otorgar→bienvenida→último día→corte/churn)
- [ ] `docs/openapi.json` + postman (`export-api-docs.cjs`) por endpoints nuevos
- [ ] `AGENTS.md` si cambian comandos/flujos; README si cambia setup
- [ ] `pnpm typecheck`, `pnpm lint`, tests afectados
