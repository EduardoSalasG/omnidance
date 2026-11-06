# Handoff 2026-11-05 — refinamiento de gates por tier (páginas academy + sidebar)

## Completado (change `academy-tier-gates-refine`, validado, SIN archivar ni commitear)

Re-auditoría de gates por tier en la consola academia (pages `/academia/*`,
nav/sidebar del owner, enforcement API). La matriz ya era correcta en la
mayoría de superficies; se corrigieron 9 gaps:

**Web**
- `/academia/configuracion` redirige a `perfil` (era `clases` = paywall
  en COBROS). `general` sigue → `clases` (renombrado legítimo).
- `configuracion/importar`: card de import clases exige feature
  `classes` además de cap `schedule` (COBROS la veía → 403 genérico).
- Grilla del hub `/academia`: filtro extraído a
  `apps/web/src/lib/academy-modules.ts` (`visibleHubModules`) — ahora
  exige cap Y feature del tier (series/particulares→classes,
  videos→videos, preventas→presales, equipo→staff, crm→crm). Staff de
  COBROS ya no ve cards que solo llevan a paywall.
- `useActorEntitlements` devuelve `resolved`: false cuando la selección
  persistida no es una academia propia (membresía instructor/staff).
  En ese caso el filtro `academyFeature` del nav NO recorta
  (fail-open; páginas y API gatean). Antes ocultaba TODOS los ítems
  gated — mismo bug que el P0 de AcademyTierGate.
- `crm-context`: `blocked` exige `actorEnt.resolved` — staff eligiendo
  academia no propia, o ADMIN inspeccionando una, ya no recibe paywall
  erróneo.
- `SeriesInsights` recibe `tier` y no fetchea sin `insights` (era un
  403 desperdiciado en STUDIO).
- Dashboard: MiniKpi "asistencia hoy" exige `attendance` (en COBROS
  linkeaba a ruta redirigida = dead end); checklist de activación
  filtra pasos por feature (series→classes, team→staff — imposibles
  en COBROS).

**API**
- `GET /academies/:id/slots/:slotId` exige `classes` (sus hermanos ya
  la pedían).
- `GET /academies/:id/insights/levels` baja de `insights` (PRO) a
  `classes` (STUDIO) — decisión del usuario: es planificación operativa
  (nivel sin asignar, cupo por horario), no analítica estratégica.
  `useAcademyLevelInsights` y el spec actualizados; en COBROS sigue
  oculto (endpoint 403 tier.required). Card y KPI "sin nivel asignado"
  ahora visibles en STUDIO/PRO/trial.

**Tests nuevos**: `academy-modules.test.ts` (8), importar `page.test.tsx`
(2), spec `getSlot` en class-series.controller.spec.ts.

## Verificado

- Web: `tsc --noEmit` limpio; suite completa **21/21**.
- API: `tsc --noEmit` limpio; class-series spec **28/28**.
- `openspec validate --changes` verde; `docs/qa-flows-inventory.md` §8
  actualizado.

## Hallazgos de la auditoría que YA cumplían (no tocar)

- Pages gated: series*/particulares (classes), videos* (videos),
  preventas* (presales), equipo* (staff), config clases/niveles
  (classes), nueva (multiAcademy), clases/[id] roster (attendance
  reactivo), alumnos+ficha (insights/crm/attendance/classes fino).
- Sidebar owner: `academyFeature` bien taggeado; grupos vacíos se
  ocultan; COBROS ve solo alumnos/planes/promos/cobros/config base.
- Cupos por nivel (`AcademyLevelsCard`) e insights de alumnos/series:
  ocultos sin `insights` (PRO) — correcto.
- `/analitica` lente ACADEMY_OWNER gatea "alguna academia propia con
  analytics" — semántica agregada del API, correcta.
- `AcademyTierGate` y dashboard usan `academy.tier` (independiente del
  rol del viewer) — correcto.

## Pendiente (decisión del usuario: dejar así)

- `exports` (STUDIO "export mensual CSV" de omni-dance.md §10) no tiene
  superficie: el único export vive en `/analitica` tras `analytics`
  (PRO). STUDIO posee la feature sin poder usarla. Si se retoma:
  candidatos `cobros/reporte` o `alumnos`.

## Notas

- `instructorLens` en alumnos/ficha degrada por LENTE activa, no por
  membresía — es diseño (spec academies/staff-roles), no bug.
- Sin commit aún: el usuario puede pedir smoke manual antes (personas
  QA: `academias@`/`tumbao@` COBROS, `profe@` instructora STUDIO).
- Smoke script disponible: `cd apps/api && node scripts/smoke-tier-gates.cjs`
  (requiere web :3000 + API :4000 + playwright).

## Addendum (misma sesión siguiente): code review + fixes

Review del diff (subagente) + verificación propia. Sin Critical. Fixes
aplicados sobre lo pendiente:

- Spec `academy-billing` del change ya no promete redirect de
  `configuracion/general` (el alias sigue → `clases`, decisión
  registrada); proposal.md alineado. `openspec validate` verde.
- `qa-flows-inventory.md`: línea stale `/configuracion → clases`
  corregida a `perfil`; em-dashes del texto nuevo fuera (regla repo).
- JSDoc de `GET /academies/:id/insights/levels` actualizado: feature
  `classes` STUDIO+ (antes decía `insights` PRO).
- MiniKpi "asistencia hoy": el href `/academia/asistencia` era dead
  end para TODOS (redirige al hub; para owner loop a /inicio). `href`
  ahora opcional en MiniKpi y la card queda informativa: cada clase se
  resuelve en su roster desde "Clases de hoy".
- `resolved` de useActorEntitlements: se documenta el fail-open cuando
  la selección no resuelve (incluye fetch fallido); las páginas gatean
  por `academy.tier` propio, no por entitlements. Sin cambio de lógica.
- Nit test: `hrefs` acepta `string | null` (sin doble cast).

Verificado: `tsc --noEmit` web limpio, suite web 21/21, validate verde.

## Hallazgo fuera del change (pre-existente, sin fix aún)

- El selector de academia solo vive en `/academia`, que redirige al
  owner a `/inicio` (donde `AcademyGate` se monta SIN `selector`):
  un owner multi-academia no puede cambiar de academia ni entrar a
  `/academia/nueva` por UI (la opción "Nueva academia" también vive en
  el selector). Workaround QA: `localStorage.setItem(
  "omnidance:academy-id", "<id>")` + reload, o cuentas dedicadas.
  Candidato a fix propio (afecta la usabilidad real de `multiAcademy`).

## Addendum 2: selector del owner restaurado (change `academy-owner-selector`)

El usuario confirmó que el selector vivía en `/inicio` para PRO.
Historia real: antes de oct 29 `AcademyGate` lo renderizaba en TODA
superficie (incluido el home del owner); `3d400223` lo hizo opt-in
solo en `/academia`, que desde oct 15 rebota al owner a `/inicio`.
Resultado: regresión silenciosa - sin cambio de academia ni entrada a
`/academia/nueva` por UI.

Fix aplicado: `<AcademyGate selector>` en HomeHub (rama
ACADEMY_OWNER). Change `academy-owner-selector` creado con delta sobre
`academies/console-lists` (el requirement anclaba el CTA a
"`/academia`" - la consola del owner es `/inicio`), tasks e inventario.
Validado; suite web 21/21; tsc limpio. Sin commitear: espera el smoke
manual del usuario igual que `academy-tier-gates-refine`.
