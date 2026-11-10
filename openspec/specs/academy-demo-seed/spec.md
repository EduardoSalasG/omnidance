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

### Requirement: Profundidad histórica de la demo

El script SHALL sembrar actividad académica desde el mes de inicio de
la escena demo (septiembre 2026) hasta el mes siguiente al vigente:
clases materializadas para todo slot vivo en ese rango, reservas
`ClassBooking` BOOKED deterministas del roster de cada academia antes
de las asistencias (la asistencia referencia la reserva, nunca alumnos
sin reserva) y `PaymentClaim` APPROVED distribuidos en cada mes de la
historia.

#### Scenario: Dashboard con varios meses

- **GIVEN** una academia STUDIO+ con slots vivos
- **WHEN** corre el enrich
- **THEN** existen clases dictadas con reservas y asistencias en cada
  mes desde septiembre, y el Facturado del dashboard muestra claims
  aprobados por mes

### Requirement: Data de features por tier

Las academias SHALL recibir data demo de las features que su tier
cubre: `AcademyStaff` delegado en academias STUDIO+ sin colaboradores,
`Video` en academias PRO (top-up hasta 3) y una línea de `ClassLevel`
custom en al menos una academia STUDIO además de las existentes.

#### Scenario: Equipo y videos pobladas

- **GIVEN** una academia STUDIO sin staff y una PRO sin videos
- **WHEN** corre el enrich
- **THEN** la STUDIO queda con 1 colaborador delegado y la PRO con 3
  videos enlazados externamente

### Requirement: Fixtures de corridas de import e invitaciones

El enriquecimiento demo SHALL sembrar, por academia activa, al menos
una `AcademyImportRun` de kind `students` con `counts` y `results`
por fila representativos (mezcando `invited`, `resent`, `skipped` y
`error` con los detalles textuales del servicio) y un par de
`AcademyInvite` pendientes (sin `consumedAt` ni `personId`), con
`createdById`/`invitedById` = owner de la academia. Toda escritura
SHALL ser idempotente por clave natural ((academyId, kind, fileName)
para corridas, (academyId, email) pendiente para invitaciones).

#### Scenario: historial e invitados poblados en demo

- **GIVEN** una academia demo activa
- **WHEN** corre `pnpm db:enrich`
- **THEN** la card "Historial" de `/academia/configuracion/importar`
  lista la corrida con su detalle fila a fila y la sección
  "Invitados" de `/academia/alumnos` muestra pendientes

#### Scenario: re-corrida sin duplicar

- **WHEN** `pnpm db:enrich` corre dos veces
- **THEN** no se crean corridas ni invitaciones duplicadas
