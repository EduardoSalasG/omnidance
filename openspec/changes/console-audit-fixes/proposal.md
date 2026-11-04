# console-audit-fixes

## Why

La auditoría post-polish (`docs/console-audit-2026-11-04.md`, 7 agentes
sobre `console-patterns` + `ui-lists`) encontró 2 bloqueantes y ~25 gaps
de patrón en la consola academia y `/analitica`: errores de fetch
tragados en colas operativas de cobros, subpágina sin navegación de
vuelta, listas dentro de fichas que crecen sin cota ni "Ver todo", y
desviaciones transversales (busy como texto, forbidden colapsado a
error, `hover /40`, landmarks sin nombre, cross-refs sin Link).

## What Changes

- **Errores visibles en colas de cobros**: `claims-queue`,
  `order-claims-queue` y `cobros-history` dejan de tragar fallos de
  fetch — `role="alert"` + retry como el resto de la consola.
- **Chrome uniforme**: `ConsoleHeader` con back al padre lógico en
  TODA página de consola, incluidas raíces del drawer que hoy lo omiten
  (planes, promos, niveles, analitica/usuarios).
- **Expand "Ver todo" compartido**: componente `SeeAllRow` +
  `LIST_PREVIEW` (patrón de `series/[id]`) aplicado a todas las listas
  crecibles dentro de fichas: pagos/historial/próximas de alumno,
  alumnos de plan, códigos de preventa, encuestas del profesor, listas
  de la ficha de persona en analítica, resultados CSV de importar y
  cola PENDING de claims.
- **Forbidden ≠ error**: fichas de cobros y secciones de equipo
  distinguen 401/403/404 (estado "sin acceso" con salida) de errores
  reales con retry; staff/instructor dejan de mentir el empty.
- **Feedback de acción**: `Spinner` inline reemplaza `tc("loading")`
  como texto en submits y acciones.
- **Cross-refs navegables**: persona en claim/orden → ficha alumno;
  `fieldOrderRef` → `pago/[id]`; historial/próximas de alumno →
  `/academia/clases/[id]`; actores en ficha de analítica → su ficha.
- **Mantenedor de niveles al patrón**: alta/edición en páginas
  dedicadas, delete en zona roja con `ConfirmSheet` (hoy: inline +
  delete por fila sin confirmar).
- **Videos**: delete inline gana `ConfirmSheet` (excepción documentada:
  el video no tiene ficha, es un link externo).
- **Zona destructiva canónica** en `metodos-de-pago/[methodId]`;
  landmark sin nombre corregido en 3 fichas; `hover /40`→`/60`;
  `FilterBar` en InstructorSection; empty con `query.empty` bajo filtro;
  delta KPI en verde/rojo semántico; `ThemeToggle` ≥`min-h-11`.
- **Refactor promos**: `queueMicrotask` de `academyId` → módulo hijo
  con prop (patrón planes/series); tras crear promo se vuelve al
  listado.
- **Backend**: cap en el endpoint de encuestas por instructor (grupos y
  comentarios por grupo), hoy sin límite.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `academy-console`: consistencia de superficies se extiende con listas
  acotadas + expand, forbidden explícito en fichas, y ConsoleHeader
  universal incluyendo raíces de sección.
- `academies/console-lists`: colas operativas con historial resuelto
  acotado (preventas); FilterBar en todas las secciones de listado.
- `academies/course-surveys`: el endpoint de resultados por instructor
  acota grupos y comentarios.
- `analytics/query-console`: drill-down a ficha de persona desde la
  tabla de resultados cuando la fila expone `personId`.

## Impact

- Web: ~30 archivos en `apps/web/src/app/[locale]/(app)/academia/**` y
  `analitica/**` + componentes `components/academy/*`,
  `components/layout/ThemeToggle`, nuevo `components/ui/see-all-row`.
- API: `academies.controller`/`academy-staff` (cap encuestas
  instructor). Sin cambios de esquema ni contratos públicos rotos.
- i18n: reutiliza `common.seeAll`/`common.showLess`; pocas keys nuevas.
- Docs: `docs/qa-flows-inventory.md` (nuevas páginas de niveles,
  navegación post-crear promo); skill `console-patterns` documenta la
  excepción de videos.
