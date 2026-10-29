# crm/contact-console; delta crm-trigger-actor-scope

## ADDED Requirements

### Requirement: Keys de trigger restringidas por actor

`createTrigger` SHALL rechazar con BAD_REQUEST las keys cuya semántica
no aplica al `actorType`: `TRIAL_EXPIRING` solo ACADEMY,
`REGULAR_NO_PRESALE` solo PRODUCER. El formulario de triggers SHALL
ofrecer solo las keys aplicables al actor seleccionado y las keys
restringidas SHALL indicar su alcance en su etiqueta/descripción.

#### Scenario: key de academia en productor

- **WHEN** un productor intenta crear `TRIAL_EXPIRING`
- **THEN** el API responde 400 y el select no la ofrece

#### Scenario: key de productor en academia

- **WHEN** una academia intenta crear `REGULAR_NO_PRESALE`
- **THEN** el API responde 400 y el select no la ofrece
