# Handoff; línea efectiva de niveles + dedupe Mambo Madness + encuestas por lente

**Rama**: `dev` · sin commits aún (working tree, como sesiones previas).

## Qué se hizo

### Change `academy-level-line-consistency` (archivado `2026-11-04-…`)

La regla "línea custom si existe, global si no" ya existía en
`GET /academies/:id/class-levels` pero el resto de superficies la
ignoraba. Ahora:

- `GET /classes/catalogs?academyId=` devuelve la línea efectiva; sin
  parámetro solo la global (antes mezclaba customs de TODAS las
  academias → selects con "Básico" duplicado).
- `POST/PATCH /academies/:id/series` valida `levelId` contra la línea
  efectiva → 400 (`assertLevelInLine`, class-series.controller ~1477).
- `series: { deletedAt: null }` agregado en: `/classes/browse`,
  `/classes/mine`, `/classes/teaching`, próximas de `GET
  /academies/:id`, `GET /:id/slots`, `classSlot.count` del dashboard y
  los 3 queries de `insights/levels`. Motivo: series borradas directo
  en datos (seed viejo) quedaban `active:true` con clases vivas y se
  veían en todas partes.
- Web: `series-form`, filtros de `/academia/series` y
  `EnrollmentLevelsEditor` (nueva prop `academyId`) piden el parámetro.
- Seed: `levelId(name, academyId)` resuelve efectiva en
  `mkClassSeries`; bloque Mambo Madness deduplica por score
  (cls+att+book) conservando el keeper con más data y rebinding al
  nivel custom; no-keepers/fuera-de-parrilla reciben soft-delete
  espejo del API (`active:false` + `deletedAt` + clases futuras
  canceladas + reservas CANCELLED+refunded); slots duplicados dentro
  del keeper se podan por el mismo score. `enrich-academy-seed.cjs`:
  `levelIdFor(academyId, name)` por línea efectiva (antes el mapa por
  nombre pisaba globales con customs).

### Change `survey-cards-dancer-lens` (archivado `2026-11-04-…`)

- `HomeHub.tsx`: cards de encuestas pendientes solo en lente DANCER;
  post-social en `viewMode==="social"`, curso en `"academy"`. Las
  consolas de rol no las ven (el aviso sigue por notificación).
- `packages/shared`: `academy.courseSurvey` clasificada lente
  `academy` en `NOTIFICATION_LENS_TYPES` (antes "any" → badge/lista en
  ambas lentes). Rebuild de shared hecho.
- IMPORTANTE: `GET /me/pending-surveys` también gatilla el fan-out de
  notificaciones (claim `surveyNotifiedAt`); por eso los fetches
  quedaron incondicionales y solo el render se gateó.

## Verificación (evidencia real)

- `tsc --noEmit` limpio en apps/api y apps/web (ambos corridos).
- Vitest: 129/129 en los 3 specs tocados (classes.controller.spec
  82, class-series.controller.spec 27, enrollment-levels 20).
- `pnpm db:seed` corrido 2× limpio. DB verificada: Mambo Madness =
  exactamente las 11 series target vivas, todas nivel custom, 0
  duplicados `(name,levelId)`, 0 slots duplicados, 0 borradas con
  `active:true`, 0 reservas huérfanas.
- `docs/openapi.json` + postman regenerados (366 paths).
- `docs/qa-flows-inventory.md` y `docs/architecture.md` actualizados.

## Estado de datos (dedupe real aplicado)

Mambo Madness: 11 series vivas todas en línea custom (Iniciación,
Iniciación 2, Básico, Intermedio, Avanzado). Keepers por mayor data:
Bachata Pareja mar 19:30 (la Intermedio borrada, 804pts → rebind
Básico), Salsa Pareja mar 20:30 (la Iniciación borrada, 1033 →
Básico), Lady Style jue 21:30 (la Intermedio, 857 → Básico),
Mov.Corps (869 Básico / 844 Intermedio), etc. 21 series no-keeper
quedaron `active:false`+`deletedAt` con clases futuras canceladas.

## Pendiente / gaps

- Verificación en browser de las cards de encuesta por lente (task 3
  del change quedó sin marcar: no hay harness de componente para
  HomeHub; el gateo es trivial pero no se vio renderizado).
- `db:enrich` no se corrió (solo `node --check`) - correr si se quiere
  verificación runtime del script.
- Bug latente notado por la investigación: la notificación
  `academy.courseSurvey` no tiene `hrefFor` en /notificaciones ni
  `path` en data → el tap no navega. Quedó fuera de alcance.
- Todo sin commitear: 14 archivos modificados + docs regenerados +
  specs archivadas.

## Update (misma sesión): slot resurrection + deeplink encuesta

- **Bug "cupos por nivel solo muestra Mov. Corporal"**: el dedupe
  resucitó series pero los `ClassSlot` conservaban `deletedAt` (13/15
  slots ocultos). Fix: el `ensure` de slot en `mkClassSeries` ahora
  setea `deletedAt: null` al actualizar (~línea 885). Re-seed corrido
  limpio (87s): los 15 slots de la parrilla vivos.
- **Pendiente menor resuelto**: `academy.courseSurvey` ahora envía
  `data.path` + `data.series` → el tap en /notificaciones navega a
  `/academias/:id/encuesta?...` (fallback genérico `safeInternalPath`
  ya existía).
- **ATENCIÓN - stack viejo**: los dev servers en :3000/:4000 son
  procesos de una sesión anterior (EADDRINUSE al re-lanzarlos) con
  código VIEJO: no sirven `catalogs?academyId` ni los filtros
  deletedAt. Hay que reiniciar `pnpm dev` para probar los cambios.
- Los "7 errores" de Next reportados: lint y tsc limpios en los
  archivos tocados; probablemente estado del dev server viejo
  (EADDRINUSE/`.next` stale). Si persisten tras reiniciar, capturar el
  texto exacto.

## Update 2 (misma sesión): optimización de requests consola

- `GET /academies/:id` (requireManage) ahora devuelve
  `instructors: [{personId, name}]` (lookup separado de Person;
  AcademyInstructor no tiene relación). Antes el contrato daba solo
  personIds y 3 superficies pedían el directorio completo `GET
  /academies` solo para resolver nombres.
- Consumidores simplificados (se quitó el request extra):
  `academia/series/[id]/page.tsx`, `components/academy/series-form.tsx`,
  `components/academy/private-lessons.tsx` (eliminado type
  `DirectoryAcademy` y el fetch de directorio). `academias/page.tsx` y
  `productor/.../academias/nueva` siguen usando `/academies` - usos
  legítimos (directorio real / picker).
- Verificación: tsc limpio api+web; API dev recompiló 0 errores;
  openapi.json + postman regenerados (366 paths). La lentitud reportada
  en detalle de serie era compile on-demand de next dev (3.2s primera
  vez, ~300ms después) - no del código.

## Update 3 (misma sesión): roster /academia/clases/[id] alineado a console-patterns

- `GET /classes/:id/roster` agrega `class.seriesId` (aditivo) para el
  deeplink header→ficha del horario; `ClassRoster` actualizado.
- Página: `ConsoleHeader` con back contextual (gestión→ficha del
  horario, instructor→/academia/clases); header de entidad desnudo
  navegable a `/academia/series/:sid/horarios/:slotId` solo con
  canCancel; badge "cancelada" al headline; zona roja canónica (div
  centrado + border-t + ghost rojo + ConfirmSheet).
- Verificación: tsc limpio api+web, classes.controller.spec 82/82,
  openapi+postman regenerados, change `clases-roster-console-patterns`
  archivado.

## Update 4 (misma sesión): ficha de horario alineada a console-patterns

- `academia/series/[id]/horarios/[slotId]`: estados de carga explícitos
  (antes `!res.ok` silencioso → skeleton eterno en 403/404/5xx: forbidden
  con `ta("forbidden")` + CTA a la serie, notFound, error + retry);
  header de entidad desnudo con identidad del horario (`día · hh:mm`,
  badge Taller en one-off) - NO navega (la página ES la edición);
  zona roja canónica + `busy` en ConfirmSheet.
- Verificación: tsc web limpio; inventario QA actualizado (roster +
  ficha horario). Mismo patrón del change archivado
  `clases-roster-console-patterns`.

## Update 5 (misma sesión): back contextual roster↔horario

- El link del header del roster (`academia/clases/[id]`) lleva
  `?from=/academia/clases/{id}`; la ficha del horario lee `from` con
  `safeInternalPath` y el `ConsoleHeader` vuelve al origen cuando
  existe (canónico: ficha de la serie). Evita el loop roster↔horario:
  el back del roster a la ficha del horario NO lleva from.

## Cierre de sesión

Trabajo versionado en 4 commits scoped (ver git log). Estado verificado
global: tsc api+web limpio, 129/129 + 82/82 tests en specs tocados,
seed re-corridos limpios, openapi/postman regenerados, inventario QA y
architecture.md sincronizados, 3 changes OpenSpec archivados
(academy-level-line-consistency, survey-cards-dancer-lens,
clases-roster-console-patterns).

Gaps conocidos: ~~verificación en browser de cards de encuesta por
lente~~ VERIFICADO por el usuario en browser el mismo día (tasks.md del
change archivado actualizado); verificado también el mapeo de
navegación roster↔horario (hecho por el usuario: corregido en sesión -
back del roster → ficha de la serie, editar horario → ?from al
roster); sin harness de componentes para HomeHub.
