# Delta: contact-console

## MODIFIED Requirements

### Requirement: Keys de trigger restringidas por actor

`createTrigger` SHALL rechazar con BAD_REQUEST las keys cuya semántica
no aplica al `actorType`: `REGULAR_NO_PRESALE` solo aplica a PRODUCER.
El formulario de triggers SHALL ofrecer solo las keys aplicables al
actor seleccionado y las keys restringidas SHALL indicar su alcance en
su etiqueta/descripción.

#### Scenario: key de academia en productor

- **WHEN** un productor intenta crear una key restringida a ACADEMY
- **THEN** el API responde 400 y el select no la ofrece (hoy no quedan
  keys solo-ACADEMY: `TRIAL_EXPIRING` se eliminó del modelo)

#### Scenario: key de productor en academia

- **WHEN** una academia intenta crear `REGULAR_NO_PRESALE`
- **THEN** el API responde 400 y el select no la ofrece

## REMOVED Requirements

### Requirement: Trigger de prueba por vencer (TRIAL_EXPIRING)

**Reason:** el estado de inscripción TRIAL desaparece del modelo
(enrollment-plan-simplify): la "clase de prueba" es un `CLASS_PACK` de
1 clase con status ACTIVE, sin eje temporal que venza. El trigger
`TRIAL_EXPIRING` se elimina de `CRM_TRIGGER_KEYS`,
`TRIGGER_ACTOR_TYPES`, el evaluador y la UI de triggers (la semántica
del trigger nunca quedó specced como requirement propio; solo existía
en el alcance por actor, ya actualizado arriba).

**Migration:** triggers TRIAL_EXPIRING existentes quedan huérfanos en
DB; el evaluador ya no los procesa (no hay `case` para la key).
