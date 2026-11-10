# Delta: payments/subscriptions (migración de subs legacy a BYO)

## ADDED Requirements

### Requirement: Barrido de suscripciones legacy de plataforma

El sistema SHALL exponer una operación admin
`POST /admin/subscriptions/migrate-legacy` que migra
`MembershipSubscription` legacy: `status` ACTIVE o FAILED_CARD,
`paymentMethod` CARD, `gatewayAccountId` null y `flowSubscriptionId`
non-null. Por cada sub la operación SHALL cancelar la suscripción
remota a fin de período sobre el provider de plataforma (misma
semántica que `cancel` del usuario: `at_period_end`, nunca
`immediate`), dejar la local `CANCEL_PENDING` con `canceledAt`
estampado y emitir el evento de auditoría con actor `system` y
razón `legacy_byo_migration`. El cierre efectivo (CANCELED + fin del
acceso) lo materializa el reconcile existente al vencer el período
pagado.

El body SHALL aceptar `{ academyId?, dryRun? }`: `academyId` acota el
barrido a una academia; `dryRun` (default true) SHALL reportar las
subs candidatas sin tocar remoto ni local. La operación SHALL ser
idempotente y re-corrible: subs ya CANCEL_PENDING/CANCELED se omiten;
una cancelación remota fallida deja la sub ACTIVE para el próximo
barrido y se registra como error por ítem, sin abortar el lote. La
respuesta SHALL reportar `{ scanned, migrated, failed, dryRun }` con
detalle por ítem (subscriptionId, academyId, outcome).

`PlatformSubscription` SHALL quedar explícitamente fuera del barrido:
la cuenta Flow de plataforma sigue siendo el merchant de las
suscripciones de plataforma.

#### Scenario: Dry-run reporta sin tocar

- **WHEN** admin llama `POST /admin/subscriptions/migrate-legacy` sin
  body (dryRun implícito)
- **THEN** responde la lista de subs candidatas y no cancela nada,
  remoto ni local

#### Scenario: Migración de sub legacy feliz

- **WHEN** una sub ACTIVE/CARD con `gatewayAccountId` null y remoto en
  Flow de plataforma es barrida con `dryRun: false`
- **THEN** la remota queda cancelada a fin de período, la local
  `CANCEL_PENDING` y el evento de auditoría lleva actor `system` +
  razón `legacy_byo_migration`

#### Scenario: Sub no elegible se omite

- **WHEN** una sub tiene `gatewayAccountId` non-null, es TRANSFER, o
  ya está CANCEL_PENDING/CANCELED/PENDING_CARD
- **THEN** el barrido no la toca ni cuenta como error

#### Scenario: Fallo remoto no aborta el lote

- **WHEN** la cancelación remota de una sub falla (red, cuenta,
  provider)
- **THEN** esa sub queda ACTIVE, se reporta en `failed` con su error,
  y el barrido continúa con las siguientes

#### Scenario: Scope por academia

- **WHEN** el body lleva `academyId`
- **THEN** solo las subs legacy de esa academia entran al barrido

### Requirement: Avisos de migración a alumno y academia

Por cada sub migrada el sistema SHALL notificar al alumno
(`notifySafe`, categoría TRANSACTIONAL, tipo
`membership.subscription_migration`) indicando que su suscripción
termina al fin del período pagado y que para seguir inscrito debe
suscribirse de nuevo por la pasarela de la academia (o por
comprobante si la academia no tiene pasarela). Por academia afectada
SHALL enviar UNA notificación resumen al owner (tipo
`academy.legacy_subs_migrated`) con el conteo de subs migradas; si la
academia no tiene `ActorGatewayAccount` ACTIVE el cuerpo SHALL
instruir a configurar la pasarela para recuperar el cobro
automático.

#### Scenario: Aviso al alumno

- **WHEN** una sub legacy del alumno migra a `CANCEL_PENDING`
- **THEN** recibe notificación con fecha de fin y el CTA de
  re-suscripción

#### Scenario: Resumen al owner sin pasarela

- **WHEN** el barrido migró subs de una academia sin
  `ActorGatewayAccount` ACTIVE
- **THEN** el owner recibe una notificación resumen que indica el
  conteo y le pide configurar su pasarela
