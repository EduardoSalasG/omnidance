# Proposal: legacy-subs-byo-migration

## Why

Quedaron `MembershipSubscription` CARD vivas cobrando en la cuenta Flow
de plataforma (legacy pre-BYO, `gatewayAccountId` null). Decisión del
owner: la cuenta Flow de plataforma solo procesa cobros de plataforma
(suscripciones `PlatformSubscription`, cargos PLATFORM_CHARGE); la
cobranza alumno → academia debe correr siempre por la pasarela de la
academia o por comprobante manual. Las subs legacy no se pueden portar
entre proveedores (la autorización de tarjeta vive en la cuenta
origen): la migración es cancelación a fin de período + re-suscripción
del alumno por la vía vigente.

## What Changes

- Barrido operativo de subs legacy: `MembershipSubscription` con
  `status` ACTIVE o FAILED_CARD, `paymentMethod` CARD,
  `gatewayAccountId` null y `flowSubscriptionId` non-null. Cancela la
  remota a fin de período en la cuenta de plataforma y deja la local
  `CANCEL_PENDING` (el reconcile existente la cierra al vencer).
- Disparo admin: `POST /admin/subscriptions/migrate-legacy` con
  `{ academyId?, dryRun? }` (dryRun default true reporta sin tocar
  nada). Auditable, idempotente, re-corrible.
- Notificación al alumno por sub migrada (tipo nuevo
  `membership.subscription_migration`, copy con CTA a re-suscribirse)
  y una resumen por academia al owner (con CTA a configurar su
  pasarela si no la tiene).
- Seed dev: `seed-dev.ts` asegura `ActorGatewayAccount` MERCADOPAGO
  ACTIVE para Academia Tumbao con `MP_SMOKE_ACCESS_TOKEN` del env
  (idempotente por keyMask; sin env no siembra nada). Dev queda
  espejo del mundo post-migración: alta CARD por MP sandbox.

## Capabilities

- **Modified**: `payments/subscriptions` (agrega requisito de
  migración legacy; el comportamiento de alta/reconcile existente no
  cambia).

## Impact

- `apps/api/src/payments/application/subscriptions.service.ts`
  (método de barrido nuevo que reusa `providerFor` + cancel a fin de
  período + emitPaymentEvent).
- Endpoint admin nuevo en el controller admin correspondiente.
- `apps/api/prisma/seed-dev.ts` (cuenta BYO MP de Tumbao).
- Notificaciones: un tipo nuevo por dominio (misma plomería
  `notifySafe`); sin cambios de schema.
- Dev DB: las ~30 subs legacy CARD del seed siguen existiendo para
  ejercer el barrido; no se tocan datos manualmente.
