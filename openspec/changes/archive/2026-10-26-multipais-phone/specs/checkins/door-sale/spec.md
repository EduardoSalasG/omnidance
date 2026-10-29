# checkins/door-sale; país del teléfono en puerta

## ADDED Requirements

### Requirement: País implícito del venue en puerta

`POST /checkins/door-sale` SHALL aceptar `phoneCountryCode` opcional y
SHALL resolver el país por defecto del teléfono desde el país del venue
del evento (venue sin país → CL). El input de staff SHALL asumir ese
país sin mostrar selector; tipear `+` overridea a E.164; para no
agregar fricción al flujo de puerta. La Person ligera SHALL persistir
`phone` E.164 + `phoneCountryCode`, y el lookup de "persona ya existe"
SHALL hacerse sobre el E.164 normalizado.

#### Scenario: número local en puerta chilena

- **WHEN** staff ingresa `"912345678"` en un evento de Santiago
- **THEN** el sistema busca/crea la Person con `phone="+56912345678"`
  sin que el staff seleccione país

#### Scenario: viajero en puerta

- **WHEN** staff ingresa `"+34612345678"` para una turista española
- **THEN** la Person ligera queda `phone="+34612345678"`,
  `phoneCountryCode="ES"`
