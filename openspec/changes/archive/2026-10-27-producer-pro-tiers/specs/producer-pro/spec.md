# producer-pro; tiers nivelados

## MODIFIED Requirements

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
exports + staff (cupo 1); `PRO_GROWTH` = +crm (cupo 2); `PRO_BIG` =
todas (campaigns, benchmark) + staff ilimitado. El tier efectivo SHALL
ser el `tierCode` del Pro vigente. Las features FREE SHALL seguir
siendo: publicar eventos, vender, check-in, dashboard básico. Acceder a
una feature fuera del tier SHALL responder 402/403 con el contrato
unificado `tier.required` indicando el tier mínimo que la cubre.
`POST /events/staff` SHALL rechazar con 403 cuando el cupo de staff
del tier está agotado.

#### Scenario: CRM sin Pro

- **GIVEN** productor FREE **WHEN** llama `POST /crm/campaigns`
  **THEN** 403 con `tier.required` (requiredTier PRO, feature crm) y
  el CTA de upgrade.

#### Scenario: STARTER no ve CRM

- **GIVEN** productor con `PRO_STARTER` vigente **WHEN** accede a una
  superficie gated por `crm` **THEN** 402/403 `tier.required`
  (requiredTier PRO_GROWTH).

#### Scenario: STARTER al segundo colaborador

- **GIVEN** productor `PRO_STARTER` con 1 staff activo **WHEN** invita
  otro **THEN** 403 indicando que el cupo de su tier está agotado.
