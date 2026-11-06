# Proposal: academy-tier-gates-refine

## Why

La re-auditoría de gates por tier de la consola de academia (páginas
`/academia/*`, nav del owner y enforcement API) dejó inconsistencias
residuales entre la matriz (spec `academy-billing`, omni-dance.md §10)
y lo implementado:

- `/academia/configuracion` y `/academia/configuracion/general`
  redirigen a `configuracion/clases` (gateada `classes`): en una
  academia COBROS el punto de entrada a Configuración cae en paywall
  aunque sí tiene secciones disponibles (perfil, métodos de pago,
  apariencia, importar, suscripción).
- `/academia/configuracion/importar` muestra la card de importación de
  clases por cap `schedule` sin mirar tier: el owner COBROS (que tiene
  todos los caps) la ve y recibe un 403 `tier.required` genérico al
  usarla. La de alumnos (cap `students`) sí corresponde a COBROS.
- La grilla de módulos del hub `/academia` (superficie de staff,
  instructor y ADMIN) filtra por capability pero no por tier: un staff
  de academia COBROS ve cards de series, particulares, videos,
  preventas, equipo y CRM que solo llevan a paywall.
- El filtro `academyFeature` del nav del owner resuelve por
  `useActorEntitlements`, que solo cubre academias PROPIAS: si el owner
  selecciona una academia donde es instructor/staff (no owner), todos
  los ítems gated desaparecen aunque el tier de esa academia los cubra.
- `GET /academies/:id/slots/:slotId` exige cap `schedule` sin feature:
  sus hermanos de slots/series exigen `classes`: COBROS puede leer el
  detalle de un horario por API.
- `SeriesInsights` dispara `GET /academies/:id/series/insights`
  (feature PRO `insights`) sin chequear tier: en STUDIO desperdicia un
  request condenado a 403.

## What Changes

- **Redirects**: `/academia/configuracion` apunta a
  `configuracion/perfil` (disponible en todos los tiers).
  `configuracion/general` sigue → `clases`: es el renombrado legado de
  la página de defaults de clases misma, no una entrada genérica.
- **Importar**: la card de schedule se renderiza solo si el tier cubre
  `classes` (además del cap); la de students queda igual.
- **Hub**: la grilla filtra además por feature del tier
  (`academyTierHas`): series/particulares `classes`, videos `videos`,
  preventas `presales`, equipo `staff`, CRM `crm`. `clases` (consola
  cross-academia del instructor), planes, promos, alumnos, cobros,
  configuración y suscripción siguen sin feature.
- **Nav owner**: cuando la academia seleccionada no resuelve a una
  academia propia en `/me/entitlements` (es membresía instructor/staff),
  el filtro `academyFeature` no recorta; las páginas y el API gatean.
- **API**: `GET /academies/:id/slots/:slotId` exige feature `classes`
  como sus hermanos.
- **SeriesInsights**: no fetchea cuando el tier no cubre `insights`.
- **Dashboard**: el MiniKpi "asistencia hoy" se renderizaba en todos
  los tiers (en COBROS llevaba a una ruta que redirige al hub) - ahora
  exige `attendance`. El checklist de activación filtra sus pasos por
  feature (serie → `classes`, equipo → `staff`): en COBROS eran pasos
  imposibles que trababan el checklist.
- **Niveles y cupos**: `GET /academies/:id/insights/levels` baja de
  `insights` (PRO) a `classes` (STUDIO) - es planificación operativa
  (nivel sin asignar, cupo por horario), no analítica estratégica; toda
  su data ya existe en STUDIO. El front (`useAcademyLevelInsights`)
  gatea igual; en COBROS sigue sin renderizarse.
- **CRM context**: el bloqueo anticipado exige `resolved` del
  entitlement: sin él, elegir una academia no propia (staff) o
  inspeccionar una como ADMIN mostraba paywall aunque el API permita
  el acceso.

## Capabilities

- **Modified Capabilities**: `academy-billing` (entitlements por tier:
  puntos de entrada a configuración, grilla del hub y filtro del nav
  coherentes con la matriz; slot detail exige `classes`).

## Impact

- Web: `academia/configuracion/page.tsx`,
  `configuracion/general/page.tsx`, `configuracion/importar/page.tsx`,
  `academia/page.tsx` (grilla → filtro extraído a lib testeable),
  `lib/entitlements-context.tsx` (flag `resolved`),
  `layout/BottomNav.tsx`, `components/academy/series-insights.tsx` +
  `academia/series/page.tsx` (prop tier).
- API: `class-series.controller.ts` (getSlot).
- Tests: spec nuevo `getSlot` exige `classes`; specs web nuevos para
  el filtro de la grilla y la card de importar.
- Sin migración de schema. Sin cambio de matriz.
