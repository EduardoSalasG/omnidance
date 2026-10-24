# Delta: member-promos (academy-tier-v2)

## ADDED Requirements

### Requirement: Promos de academia sobre planes de membresía

La academia SHALL poder crear promos (`AcademyPromo`): nombre, tipo
PERCENT|FIXED_CLP, valor, validFrom/validUntil, maxCycles, enabled,
scope a planes (vacío=todos) y whitelist de personas (vacía=todos).
El descuento SHALL aplicarse al cobro del plan al suscribirse y en
renovaciones hasta agotar ciclos o vencer; nunca muta el precio del
plan. La whitelist SHALL admitir personas no inscritas (preventa).

#### Scenario: Beca por alumno

- **GIVEN** promo academia −50% whitelist=alumno X, maxCycles=6
  **WHEN** X suscribe un plan **THEN** paga la mitad 6 cobros y
  vuelve a precio lleno; otro alumno paga precio lleno

#### Scenario: Preventa sin inscripción

- **GIVEN** persona registrada sin inscripción **WHEN** cae en
  whitelist de promo vigente **THEN** su primer cobro sale con
  descuento aunque no fuera alumno de la academia
