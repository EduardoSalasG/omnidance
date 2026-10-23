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

### Requirement: Cuenta de desembolso en la consola del productor

`/productor/desembolso` SHALL ser la página propia (dentro de la
sección Configuración del nav del productor) que muestra los
`PayoutDestination` del actor (estado, rail, moneda, fecha de
activación) y un CTA de onboarding. El alta SHALL pedir país ISO-2,
POSTear a `/me/payout-destinations` y redirigir al `onboardingUrl`
devuelto; al volver, la página SHALL refrescar el estado vía `GET`
(el backend hace flip a ACTIVE cuando Stripe reporta onboarding
completo). Sin `STRIPE_SECRET_KEY` configurado el endpoint responde
503 y la UI SHALL mostrar estado de error claro (no spinner infinito).
`/productor/pagos` SHALL mostrar solo el listado de liquidaciones —
la cuenta de desembolso no vive más ahí.

#### Scenario: Onboarding completo

- **WHEN** el productor pulsa "Conectar con Stripe", elige país y
  completa el flujo en Stripe
- **THEN** vuelve a `/productor/desembolso` y el destino aparece
  `ACTIVE` con su moneda tras el refresh

#### Scenario: Reintento PENDING

- **WHEN** el productor abandona el onboarding y vuelve a pulsar el CTA
- **THEN** se reutiliza la misma `acct_` (sin segunda cuenta) y recibe
  un `onboardingUrl` nuevo

#### Scenario: Estado vacío

- **WHEN** el actor no tiene destinos
- **THEN** la página muestra empty state con el CTA — nunca un panel
  vacío sin acción

### Requirement: "Mis pagos" en el grupo de módulos del productor

El ítem "Mis pagos" (`/productor/pagos`) SHALL vivir en el grupo de
módulos del drawer/sidebar del productor (junto a Eventos, Códigos,
Comprobantes, Colaboradores) — es data operativa, no configuración.
El grupo Configuración SHALL listar solo destinos de configuración:
defaults operativos, medios de pago, cuenta de desembolso,
suscripción y apariencia.

#### Scenario: Nav del productor refleja dominio

- **WHEN** el productor abre el drawer o la sidebar
- **THEN** "Mis pagos" aparece en el grupo del módulo Productor y
  "Cuenta de desembolso" aparece en Configuración
