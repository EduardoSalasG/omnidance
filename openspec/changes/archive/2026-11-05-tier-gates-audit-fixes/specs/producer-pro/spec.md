# Delta: producer-pro

## MODIFIED Requirements

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
