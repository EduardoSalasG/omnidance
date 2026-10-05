# producer-pro Specification

## Purpose
TBD - created by archiving change academy-saas-billing. Update Purpose after archive.

## Requirements

### Requirement: Tiers del productor

`Producer.proTier` SHALL ser `FREE` (default) o un tier Pro:
`PRO_STARTER` (facturación ≤$2,5M/mes), `PRO_GROWTH` (≤$8M/mes) o
`PRO_BIG` (> $8M, contratación manual). La facturación SHALL medirse
como la media de ventas brutas de los últimos 90 días. Productores
existentes al despliegue SHALL quedar `FREE`. Precios por ciclo
(mensual, semestral −2%, anual −4%) en `PlatformParam`.

#### Scenario: Migración sin fricción

- **GIVEN** productor existente pre-despliegue **THEN** `proTier=FREE`
  y ninguna feature que ya usaba se bloquea.

#### Scenario: Tier por facturación

- **GIVEN** productor con media de $1,8M/mes en ventas **WHEN**
  contrata Pro **THEN** califica `PRO_STARTER`; si crece sobre $2,5M
  la próxima renovación exige `PRO_GROWTH`.

### Requirement: Features Pro

El tier PRO SHALL habilitar las herramientas premium de gestión —
inicialmente: analítica avanzada del evento, CRM del productor,
exports CSV/PDF y gestión multi-staff/listas. Las features FREE SHALL
seguir siendo: publicar eventos, vender, check-in, dashboard básico.
Acceder a una feature Pro sin suscripción SHALL responder 402/403 con
copy que invite a contratar.

#### Scenario: CRM sin Pro

- **GIVEN** productor FREE **WHEN** llama `POST /crm/campaigns`
  **THEN** 403 con `pro.required` y el CTA de upgrade.

### Requirement: Mora de la suscripción Pro

La mora de Producer Pro SHALL degradar solo las features Pro — nunca
bloquea publicar, vender ni hacer check-in. Un `RENEWAL_SETTLED`
SHALL restaurar el tier.

#### Scenario: Mora no corta la venta

- **GIVEN** productor Pro con invoice impaga **THEN** sus eventos
  siguen publicados y vendiendo; solo CRM/analítica/exports responden
  `pro.required`.
