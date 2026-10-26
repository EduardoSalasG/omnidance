# academy-billing — precio del tier por país

## MODIFIED Requirements

### Requirement: Catálogo de tiers

El sistema SHALL ofrecer tiers de suscripción de academia con límite
de alumnos activos y precios por ciclo de facturación.

- **COBROS** - cobranza pura, hasta 60 alumnos activos.
- **STUDIO** - operación completa, hasta 150.
- **PRO** - analítica y CRM, sin límite.
- **ENTERPRISE** - sin límite, contratación manual (no
  auto-seleccionable). STARTER queda legacy no auto-contratable.

Los precios por tier y ciclo (mensual, semestral −8% sobre el mensual,
anual −15% sobre el mensual) SHALL resolverse por país del actor desde
el price book `TierPrice(tierCode, ACADEMY, billingCycle, countryCode)`
— cayendo a la fila `CL` y luego al param legacy
`academy_tier.*_monthly_clp` para ajuste sin deploy. "Alumnos
activos" SHALL ser `Enrollment` en `ACTIVE|TRIAL|ONLINE` de la
academia.

#### Scenario: Alumnos activos como medida

- **GIVEN** una academia con 47 enrollments ACTIVE, 2 TRIAL y 10
  EXPIRED
- **THEN** su conteo de alumnos activos es 49.

#### Scenario: Precio por país de la academia

- **GIVEN** una academia en `Country("MX")` con fila
  `TierPrice(STUDIO, ACADEMY, MONTHLY, MX)`
- **WHEN** el owner abre la pantalla de suscripción
- **THEN** ve el precio de la fila MX en MXN — no el param CLP
