# Delta: console-lists

## MODIFIED Requirements

### Requirement: "Pagado hasta" sugerido por el plan en el alta

Al elegir plan en el formulario de alta, la UI SHALL pre-rellenar
`endsAt` con la vigencia que corresponde al tipo y duración del plan,
misma regla rodante que aplica el backend al cobrar
(`membershipEndsAt`): MONTHLY → inicio + 1 mes; QUARTERLY → inicio + 3
meses; SEMIANNUAL → inicio + 6 meses; PERIOD → inicio + `periodDays`
(si el plan lo define); SINGLE → inicio + 1 día; CLASS_PACK → sin
fecha. La fecha sugerida SHALL quedar editable (override manual) y
recomputarse al cambiar de plan solo si el usuario no la editó a mano.

#### Scenario: plan mensual sugiere fin de mes

- **GIVEN** un plan MONTHLY y el alta abierta el 12 de octubre
- **WHEN** el owner elige el plan
- **THEN** `endsAt` se pre-rellena un mes después (12 de noviembre,
  vigencia rodante) y queda editable

#### Scenario: plan por período sugiere inicio + días

- **GIVEN** un plan PERIOD con `periodDays=30`
- **WHEN** el owner lo elige
- **THEN** `endsAt` se pre-rellena al inicio + 30 días

#### Scenario: override manual no se pisa

- **GIVEN** el owner editó `endsAt` a mano
- **WHEN** cambia el plan seleccionado
- **THEN** su fecha manual se conserva
