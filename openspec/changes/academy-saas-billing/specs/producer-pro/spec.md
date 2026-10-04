# Capability: producer-pro

Suscripción opcional del productor por las herramientas premium de
gestión. El ticketing base (publicar, vender, check-in) SHALL ser
siempre gratuito para no friccionar la oferta del marketplace — la
monetización core del productor sigue siendo `platformFeePct` por
venta.

## ADDED Requirements

### Requirement: Tiers del productor

`Producer.proTier` SHALL ser `FREE` (default) o `PRO` (suscripción
mensual activa vía Flow). Productores existentes al despliegue SHALL
quedar `FREE`.

#### Scenario: Migración sin fricción

- **GIVEN** productor existente pre-despliegue **THEN** `proTier=FREE`
  y ninguna feature que ya usaba se bloquea.

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
