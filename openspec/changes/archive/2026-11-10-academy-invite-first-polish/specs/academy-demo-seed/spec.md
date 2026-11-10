# Delta: academy-demo-seed (academy-invite-first-polish)

## ADDED Requirements

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
