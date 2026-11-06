# producer-pro Specification

## Purpose
TBD - created by archiving change academy-saas-billing. Update Purpose after archive.

## Requirements

### Requirement: Tiers del productor

`Producer.proTier` SHALL ser `FREE` (default) o un tier Pro:
`PRO_STARTER` (facturación ≤$2,5M/mes), `PRO_GROWTH` (≤$8M/mes) o
`PRO_BIG` (> $8M, contratación manual). La facturación SHALL medirse
como la media de ventas brutas de los últimos 90 días, en la moneda de
la suscripción (nunca una suma cruzada de monedas). Productores
existentes al despliegue SHALL quedar `FREE`. Precios por ciclo
(mensual, semestral −2%, anual −4%) en `PlatformParam`/`TierPrice`.
La renovación SHALL evaluar la media de 90d y exigir el tier superior
cuando el productor supera el tope del vigente (`pendingTierCode`).

#### Scenario: Migración sin fricción

- **GIVEN** productor existente pre-despliegue **THEN** `proTier=FREE`
  y ninguna feature que ya usaba se bloquea.

#### Scenario: Tier por facturación

- **GIVEN** productor con media de $1,8M/mes en ventas **WHEN**
  contrata Pro **THEN** califica `PRO_STARTER`; si crece sobre $2,5M
  la próxima renovación exige `PRO_GROWTH`.

#### Scenario: STARTER que factura más del tope

- **WHEN** un productor `PRO_STARTER` renueva con media de 90d > $2,5M
  en la moneda de su suscripción
- **THEN** la renovación queda con `pendingTierCode=PRO_GROWTH` y el
  flujo lo guía al upgrade para mantener el nivel

### Requirement: Features Pro

El tier Pro SHALL habilitar herramientas premium según la matriz
`PRODUCER_TIER_FEATURES` (acumulativa): `PRO_STARTER` = analytics +
exports; `PRO_GROWTH` = +crm; `PRO_BIG` = +campaigns (+benchmark, que
permanece reservada sin implementación). El tier efectivo SHALL ser el
`tierCode` del Pro vigente. Las features FREE SHALL seguir siendo:
publicar eventos, vender, check-in, dashboard básico **y staff de
evento/nómina sin cupo** — la gestión de colaboradores no es feature
premium ni tiene tope por tier. Acceder a una feature fuera del tier
SHALL responder 402/403 con el contrato unificado `tier.required`
indicando el tier mínimo que la cubre.

#### Scenario: CRM sin Pro

- **GIVEN** productor FREE **WHEN** llama `POST /crm/segments`
  **THEN** 403 con `tier.required` (feature crm) y el CTA de upgrade.

#### Scenario: STARTER no ve CRM

- **GIVEN** productor con `PRO_STARTER` vigente **WHEN** accede a una
  superficie gated por `crm` **THEN** 402/403 `tier.required`
  (requiredTier PRO_GROWTH).

#### Scenario: Campañas reservadas a PRO_BIG

- **GIVEN** productor con `PRO_GROWTH` vigente **WHEN** llama
  `POST /crm/campaigns` o `GET /crm/campaigns` **THEN** 403
  `tier.required` (requiredTier PRO_BIG, feature campaigns).

#### Scenario: STARTER al segundo colaborador

- **GIVEN** productor `PRO_STARTER` con 1 staff activo **WHEN** invita
  otro **THEN** el alta se acepta - la nómina no tiene cupo.

#### Scenario: Staff sin cupo en ningún tier

- **GIVEN** productor FREE con 2 colaboradores en nómina y 2 staff
  asignados a su evento **WHEN** agrega otro a la nómina
  (`POST /producer/staff`) o al evento (`POST /events/:id/staff`)
  **THEN** ambas altas se aceptan - no existe tope ni feature de staff.

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
`/productor/pagos` SHALL mostrar solo el listado de liquidaciones;
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
- **THEN** la página muestra empty state con el CTA; nunca un panel
  vacío sin acción

### Requirement: "Mis pagos" en el grupo de módulos del productor

El ítem "Mis pagos" (`/productor/pagos`) SHALL vivir en el grupo de
módulos del drawer/sidebar del productor (junto a Eventos, Códigos,
Comprobantes, Colaboradores); es data operativa, no configuración.
El grupo Configuración SHALL listar solo destinos de configuración:
defaults operativos, medios de pago, cuenta de desembolso,
suscripción y apariencia.

#### Scenario: Nav del productor refleja dominio

- **WHEN** el productor abre el drawer o la sidebar
- **THEN** "Mis pagos" aparece en el grupo del módulo Productor y
  "Cuenta de desembolso" aparece en Configuración
