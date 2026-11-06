# Tasks: academy-tier-gates-refine

## API

- [x] `GET /academies/:id/slots/:slotId` exige feature `classes` además
      de cap `schedule` (spec nuevo en `class-series.controller.spec.ts`).

## Web

- [x] `/academia/configuracion` redirige a `configuracion/perfil`
      (`general` sigue → `clases`: es el renombrado de la página de
      defaults); comentario stale del drawer actualizado.
- [x] `configuracion/importar`: la card de `schedule` se renderiza solo
      si `academyTierHas(tier, "classes")` (además del cap); la de
      `students` queda igual (test de componente).
- [x] Hub `/academia`: la grilla filtra por feature del tier además de
      cap/ownerOnly/noInstructor: `series` y `particulares` `classes`,
      `videos` `videos`, `preventas` `presales`, `equipo` `staff`,
      `crm` `crm`. Filtro extraído a `lib/academy-modules.ts` + spec
      unitario (COBROS/STUDIO/PRO).
- [x] `useActorEntitlements` expone `resolved`: false cuando la
      selección persistida no corresponde a una academia cubierta por
      `/me/entitlements` (membresía no-owner). En ese caso el filtro
      `academyFeature` del nav no recorta.
- [x] `SeriesInsights` recibe `tier` y no fetchea cuando el tier no
      cubre `insights` (mismo criterio que `useAcademyLevelInsights`).
- [x] Dashboard: MiniKpi "asistencia hoy" exige `attendance`; pasos
      del checklist filtrados por feature (`series`→`classes`,
      `team`→`staff`).
- [x] `insights/levels` baja de `insights` (PRO) a `classes` (STUDIO):
      API, `useAcademyLevelInsights` y spec actualizados.
- [x] `crm-context`: `blocked` exige `actorEnt.resolved`: el actor
      academia no cubierto por `/me/entitlements` (membresía no-owner,
      ADMIN inspeccionando) ya no recibe paywall erróneo.

## Docs y verificación

- [x] `docs/qa-flows-inventory.md` §hub/gates actualizado.
- [x] typecheck web + API; tests de las superficies tocadas;
      `openspec validate`.
