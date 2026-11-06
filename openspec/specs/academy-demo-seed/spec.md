# academy-demo-seed Specification

## Purpose
TBD - created by archiving change academy-enrich-seed-fixes. Update Purpose after archive.

## Requirements

### Requirement: Idempotencia por clave natural

El script `enrich-academy-seed.cjs` SHALL ser re-ejecutable sin
duplicar data ni abortar por colisiones de unicidad. Toda escritura
SHALL ir protegida por clave natural (findFirst/upsert/createMany
skipDuplicates) o por id determinista; cuando el id determinista ya
esté tomado por una fila viva o muerta, el script SHALL derivar un
sufijo `_vN` determinista hasta quedar libre. Los contadores del
resumen SHALL reportar solo creaciones reales, no intentos deduplicados.

#### Scenario: Re-corrida tras cancelación de subs

- **GIVEN** una corrida previa dejó `MembershipSubscription` CARD con
  `flowSubscriptionId` generado y la sub quedó `CANCELED`
- **WHEN** el script reintenta crear una sub CARD para la misma
  persona+academia
- **THEN** genera `sus_enrich_<base>_v2` (o el primer sufijo libre) en
  vez de abortar con P2002

#### Scenario: Una sub por persona

- **GIVEN** una persona con varios `Enrollment` ACTIVE con plan pagado
  en la misma academia, o un índice de selección que la elige dos veces
- **WHEN** el paso de membresías elige candidatos
- **THEN** la persona se considera una sola vez por academia

### Requirement: COBROS no recibe data de clases

Las academias en tier COBROS —incluidas las que recibirán ese tier por
el hash determinista de la misma corrida (sin PlatformSubscription y
fuera de la lista trial)— SHALL quedar fuera de la siembra de features
que el tier no cubre: `EnrollmentLevel`, materialización de
series/slots/clases, asistencias, normalización de sobre-cupo y
`PrivateLesson`. La limpieza post-suscripciones SHALL seguir corriendo
como red de seguridad para residuos de seeds o corridas anteriores.

#### Scenario: Academia que será COBROS por hash

- **GIVEN** una academia activa sin `PlatformSubscription` cuyo hash la
  asigna a `COBROS` en el paso de suscripciones
- **WHEN** corre el paso de niveles o el de materialización de clases
- **THEN** sus enrollments no reciben `EnrollmentLevel` y sus slots no
  reciben clases — sin necesidad de que la limpieza los borre después

#### Scenario: Residuos anteriores sí se limpian

- **GIVEN** una academia COBROS con instructores o clases heredadas de
  una corrida anterior a la exclusión
- **WHEN** corre la limpieza post-suscripciones
- **THEN** los borra igualmente (la exclusión no sustituye la limpieza)
