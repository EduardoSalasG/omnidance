# Delta: academy-billing (trial-lifecycle-15d)

## MODIFIED Requirements

### Requirement: Trial de onboarding

Una academia nueva SHALL recibir `academy_billing.trial_days` días de
trial (default 15) sin exigir tarjeta upfront, contados desde la
creación de la academia. Durante el trial la consola opera a nivel
STUDIO. Al vencer sin suscripción viva rige el corte del spec
`platform-trials` (features vacías, deslistada del dancer).

#### Scenario: Trial sin cobro

- **GIVEN** una academia creada hoy **THEN** `trialEndsAt` = +15d
  (o el valor vigente del param) y su consola opera a nivel STUDIO
  sin suscripción

#### Scenario: Trial vencido sin suscripción

- **GIVEN** una academia con `trialEndsAt` vencido y sin suscripción
  viva **THEN** su consola queda con features vacías y desaparece de
  las superficies del dancer hasta que suscribe

### Requirement: Cancelación

El owner SHALL poder cancelar; la suscripción SHALL seguir activa
hasta el fin del ciclo ya pagado y al terminar la academia pasa a la
postura sin-acceso del spec `platform-trials` (features vacías,
deslistada del dancer; `Academy.tier` limpiado), sin grace adicional
post-cancelación confirmada.

#### Scenario: Cancelar respeta lo pagado

- **GIVEN** academia con ciclo pagado hasta el 20 **WHEN** cancela el
  10 **THEN** opera completa hasta el 20 y el 21 queda sin acceso a
  las features de consola y deslistada
