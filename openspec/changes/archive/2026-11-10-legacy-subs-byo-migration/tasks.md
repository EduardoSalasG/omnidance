# Tasks: legacy-subs-byo-migration

- [x] 1. `SubscriptionsService.migrateLegacySubs({ academyId?, dryRun? })`:
  selector D2, cancel remoto `at_period_end` vía `providerFor`, local
  `CANCEL_PENDING` + `canceledAt`, `emitPaymentEvent` actor `system`
  razón `legacy_byo_migration`, contadores + detalle por ítem.
- [x] 2. Notificaciones: `membership.subscription_migration` por sub
  (alumno, CTA re-suscripción) + `academy.legacy_subs_migrated` por
  academia (owner, ramifica según tenga BYO ACTIVE).
- [x] 3. Endpoint `POST /admin/subscriptions/migrate-legacy` (guard
  admin, body `{ academyId?, dryRun? }`, dryRun default true).
- [x] 4. Specs de `migrateLegacySubs` en
  `subscriptions.service.spec.ts`: dry-run no toca nada, feliz
  (mock provider cancel + CANCEL_PENDING), no elegibles omitidas,
  fallo remoto no aborta, scope academyId.
- [x] 5. Seed dev: cuenta `ActorGatewayAccount` MERCADOPAGO ACTIVE
  para Academia Tumbao desde `MP_SMOKE_ACCESS_TOKEN` (idempotente
  por keyMask; sin env no siembra).
- [x] 6. Smoke en dev: dry-run sobre seed → ejecutar scoped a una
  academia de prueba → verificar CANCEL_PENDING + notificaciones.
- [x] 7. `docs/qa-flows-inventory.md`: flujo nuevo de migración
  admin + regenerar `docs/openapi.json`/postman (endpoint nuevo).
- [x] 8. `pnpm --filter @omnidance/api build` + suite verde;
  `openspec validate legacy-subs-byo-migration --strict`.
