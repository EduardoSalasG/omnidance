# Implementación: console-audit-fixes

Repo: `C:\Users\salas\Documents\omni-dance`. Implementa SOLO tu scope.

## Autoridad (leer en este orden)

1. `openspec/changes/console-audit-fixes/design.md` — decisiones vinculantes.
2. `openspec/changes/console-audit-fixes/tasks.md` — tus tareas.
3. `.devin/skills/console-patterns/SKILL.md` + `ui-lists` — el estándar.
4. `docs/console-audit-2026-11-04.md` — hallazgos con líneas citadas.
5. Patrón expand: `apps/web/src/components/ui/see-all-row.tsx`
   (`LIST_PREVIEW`, `SeeAllRow`, exportado por el barrel
   `@/components/ui`) y su uso canónico en `series/[id]/page.tsx`.

## Reglas duras

- **NO ejecutes comandos git** (ni commit, ni status a fines de
  cambio): el orquestador integra y commitea.
- **NO toques archivos fuera de tu scope** — otros agentes trabajan
  en paralelo sobre el mismo árbol.
- i18n: reusar keys existentes (`common.seeAll`, `common.showLess`,
  `query.empty`, forbidden, etc.). Si necesitas key nueva, SOLO en el
  part-JSON de tu sección (`apps/web/src/i18n/parts/<dominio>.json` y
  sus mirrors `en/`, `fr/`, `pt-PT/`). Nunca `common.json`.
- `SeeAllRow` va como último `<li>` dentro del `<ul>`; la lista se
  acota con `.slice(0, expanded ? undefined : LIST_PREVIEW)`.
- Forbidden: discriminar por status en el catch (401/403/404 → estado
  "sin acceso"; resto → `role="alert"` + retry).
- Reutiliza componentes del design system (`Card`, `Button`,
  `Spinner`, `ConfirmSheet`, `ActionNotice`, `ConsoleHeader`,
  `SkeletonList/Card`); nada de CSS ad-hoc ni `<div>` que simula Card.
- Al terminar: `cd apps/web && npx tsc --noEmit` (si falla por
  archivos fuera de tu scope, ignóralos y repórtalo) y escribe tu
  reporte: archivos tocados + decisiones + pendientes.
- Respuestas en español.
