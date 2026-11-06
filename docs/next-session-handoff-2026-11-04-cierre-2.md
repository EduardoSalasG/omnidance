# Handoff: cierre pendiente inmediato + auditoría consola pasada B

**Rama**: `dev`. Working tree limpio. Stack dev corriendo en background
(`pnpm dev` shell 8b4f0d + `pnpm dev:web` 62392c; DB/Redis en docker
vivos). Ojo: maté un `next dev` zombie (PID 20532) que tenía :3000 con
código viejo — si aparece EADDRINUSE otra vez, misma receta de
AGENTS.md.

## Commits de la sesión

1. `452d8978` feat(web): ficha `/academia/videos/[id]` como página de
   edición: `VideoForm` modo edit (PATCH, `classId` vacío desvincula con
   `null`), detalle por `GET /:id/videos/:videoId` (fuera el scan
   paginado), zona roja delete intacta. Change `videos-ficha-edit`
   archivado; spec canónica `academies/videos` creada. Smoke e2e nuevo
   `e2e/video-ficha.spec.ts` 2/2 verde (mobile+desktop, screenshots en
   `e2e/polish-shots/`). i18n `videos.editTitle`/`saved` (4 locales).
2. `ea711da7` fix: **auditoría consola pasada B** completa
   (`docs/console-audit-2026-11-04-b.md`). 5 audits read-only
   paralelos (asistencia, horarios, clases/series, particulares, hub)
   → 3 implementadores por partición disjunta + orquestador.
   Change `console-audit-fixes-b` archivado.
   - Bloqueantes: `busy` eterno en `remove()` de `series/[id]` y
     `save()` sin try/catch de `horarios/[slotId]`.
   - Hub: `useAcademyAccessState` nuevo (`{access,state,reload}`) -
     error de `/access` ya no deja el hub sin ModuleGrid; el hook viejo
     sigue por compat (`alumnos/page.tsx`).
   - API: `GET /academies/:id/private-lessons` + KPIs scopeados a
     `instructorId=me` para **instructor puro** (spec private-lessons
     31/31; delta canónico `academies/private-lesson-product`).
   - `bySlot` de `insights/levels` ahora trae `seriesId` (deeplink a
     ficha de horario desde cards de niveles/cupos).
   - Redirect `/academia/asistencia` → `/academia` (antes `/series`,
     owner-only: el instructor caía en 403 genérico).
   - openapi.json + postman regenerados (367 paths).

## Verificación citada

- `tsc --noEmit` api + web: limpio (corridos tras integrar los 3
  implementadores).
- `i18n-audit`: `ALL_KEYS_OK`.
- Vitest `private-lessons.controller.spec.ts`: 31/31.
- Playwright `e2e/video-ficha.spec.ts` chromium: 2/2.
- `pnpm db:enrich` corrido por primera vez: idempotente, limpio
  (+1 claim PENDING, +13 APPROVED reconciliados).

## Pendiente mayor (orden sugerido)

- **Specs de flujo e2e**: `docs/e2e-flow-tests-design.md` propone 15
  specs priorizados + infra (`flow-map.json`, `scripts/e2e-which.mjs`,
  `dismissTours`/`acceptConsent` en helpers, `profe` en USERS). Es su
  propio change OpenSpec. El spec `video-ficha.spec.ts` ya sigue ese
  patrón (login inline gabriel PRO; migrable a `e2e/flows/`).
- **multipais-foundation tasks 10/11/13**: pases multi-día/cross-academia,
  prácticas free por ciudad, congresos/festivales. Son épicas de
  producto, no slices de sesión.
- `customer/collect` automático por job (PlatformChargesService.listo).
- Smoke visual de las superficies de la pasada B (clases, series,
  particulares, hub) — el polish-visual.spec existe pero no recorre
  estas rutas con el estado nuevo; conviene pasada en browser.
- `GET /academies/:id/surveys` no implementa `limit` (quedó
  `limit=60` inerte en survey-results.tsx) — implementar cap real o
  quitar el parámetro.
- `academySeries.creating` posiblemente huérfana tras migrar el submit
  a Spinner.

## Notas operativas

- **Herdr/bypass**: para que los subagentes `run_subagent` no se
  bloqueen en diálogos de permiso al despachar en paralelo, el usuario
  corre Devin con `/bypass` (los hijos heredan tools aprobadas; en
  background las no aprobadas se auto-deniegan, no esperan). `herdr
  agent send-keys <name> down enter` desbloquea "Bypass mode" en panes
  herdr.
- git no está en PATH del shell bash: `export PATH="/c/Program
  Files/Git/bin:$PATH"`.
- `openspec archive` deja `.openspec-archive.lock` stale si se
  interrumpe: `rm openspec/changes/archive/.openspec-archive.lock`.
- Playwright: `--no-deps` salta el auth setup cuando `e2e/.auth/*.json`
  existen; el usuario `gabriel@omnidance.dev` (owner Mambo Madness PRO)
  no está en `USERS` pero comparte PASSWORD (login inline).
