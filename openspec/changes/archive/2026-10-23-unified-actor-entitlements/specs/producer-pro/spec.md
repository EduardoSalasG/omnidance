# Delta: producer-pro (unified-actor-entitlements)

## MODIFIED Requirements

### Requirement: Features Pro

El tier PRO SHALL habilitar las herramientas premium de gestión -
inicialmente: analítica avanzada del evento, CRM del productor,
exports CSV/PDF y gestión multi-staff/listas. Las features FREE SHALL
seguir siendo: publicar eventos, vender, check-in, dashboard básico.
Acceder a una feature Pro sin suscripción SHALL responder 402/403 con
el contrato unificado `tier.required` y copy que invite a contratar.

#### Scenario: CRM sin Pro

- **GIVEN** productor FREE **WHEN** llama `POST /crm/campaigns`
  **THEN** 403 con `tier.required` (requiredTier PRO, feature crm) y
  el CTA de upgrade.

### Requirement: Mora de la suscripción Pro

La mora de Producer Pro SHALL degradar solo las features Pro - nunca
bloquea publicar, vender ni hacer check-in. Un `RENEWAL_SETTLED`
SHALL restaurar el tier.

#### Scenario: Mora no corta la venta

- **GIVEN** productor Pro con invoice impaga **THEN** sus eventos
  siguen publicados y vendiendo; solo CRM/analítica/exports responden
  `tier.required`.
