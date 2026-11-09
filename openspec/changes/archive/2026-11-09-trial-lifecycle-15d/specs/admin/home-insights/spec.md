# Delta: admin/home-insights (trial-lifecycle-15d)

## ADDED Requirements

### Requirement: Panel de trials de plataforma en el inicio

El inicio del admin SHALL mostrar una sección de trials de plataforma
con tres KPIs: `trialsActive` (academias con `trialEndsAt` futuro más
personas con `proTrialEndsAt` futuro), `trialsExpiring` (los que
vencen en los próximos 7 días) y `trialsExpired` (trial vencido sin
suscripción viva del actor); y una lista con nombre, rol, email, tier
del trial, fecha fin y días restantes, navegable a la ficha del
actor. Sin trials activos ni por vencer la sección no se renderiza.

#### Scenario: KPIs separan activos, por vencer y vencidos

- **GIVEN** 3 academias en trial (una vence en 3 días), 2 productores
  en trial y 1 academia con trial vencido sin suscripción
- **THEN** `trialsActive` vale 5, `trialsExpiring` vale 1 y
  `trialsExpired` vale 1

#### Scenario: fila navega a la ficha del actor

- **WHEN** el admin toca una academia de la lista de trials
- **THEN** llega a su ficha `/admin/academias/:id` (o la ficha de la
  persona si es productor)
