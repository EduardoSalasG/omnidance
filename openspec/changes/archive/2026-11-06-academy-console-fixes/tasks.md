# Tasks: academy-console-fixes

## CRM

- [x] `components/crm/crm-context.tsx`: `useActiveRole(me?.roles)` en
      la resolución del actor - lente `ACADEMY_OWNER` prefiere la
      academia persistida o la primera propia; lente `PRODUCER`
      prefiere el productor; resto conserva el orden previo.

## Niveles

- [x] `configuracion/niveles/page.tsx` y `nuevo/page.tsx`: header
      `Content-Type: application/json` en los POST del loop
      "Personalizar niveles"; la card explicativa separa "Si defines
      los tuyos…" como segunda línea propia (nueva clave i18n).

## Breadcrumbs `?from=`

- [x] `planes/nueva/page.tsx`: con `?edit=<id>` el ConsoleHeader vuelve
      a `/academia/planes/<id>`.
- [x] `series/nueva/page.tsx`: con `?edit=<id>` el ConsoleHeader vuelve
      a `/academia/series/<id>`.
- [x] `planes/[id]/page.tsx`: links de alumnos llevan
      `?from=/academia/planes/<id>`.
- [x] `alumnos/[personId]/page.tsx`: ConsoleHeader lee `?from=` con
      `safeInternalPath` (Suspense como en el slot).
- [x] `equipo/profesor/[id]/page.tsx`: links de clases llevan
      `?from=/academia/equipo/profesor/<id>`.
- [x] `clases/[id]/page.tsx`: ConsoleHeader prefiere `?from=` sobre el
      padre canónico.

## Copy

- [x] `planKpiActiveHint` y `planKpiTopHint` reescritos (es-CL +
      locales).
- [x] `levels.allTotal` corregido a la regla un nivel por tipo +
      comentario obsoleto en `academy-levels-card.tsx`.
- [x] `plan-form.tsx`: ayuda por tipo (`planTypeHints.*`), labels
      claros, `SINGLE` oculta el input de clases y envía
      `classCount:1`; `planClasses` relabel a lenguaje claro.

## Series

- [x] `academia/series/page.tsx`: secuencia de requests - solo el más
      reciente aplica su resultado (guardia contra doble efecto y
      respuestas fuera de orden).

## Verificación y docs

- [x] `cd apps/web && npx tsc --noEmit` limpio.
- [x] `node apps/web/scripts/i18n-audit.cjs` OK; vitest de lo tocado.
- [x] `docs/qa-flows-inventory.md` secciones afectadas actualizadas.
- [x] `npx openspec validate --changes` verde.
