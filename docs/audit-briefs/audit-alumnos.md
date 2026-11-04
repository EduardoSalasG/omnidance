# Brief: audit-alumnos

Lee `docs/audit-briefs/_common.md` primero: contiene el checklist, la
referencia de expand y el formato de output. Audita SOLO estos archivos:

- `apps/web/src/app/[locale]/(app)/academia/alumnos/page.tsx` (tocada leve: -4 líneas)
- `apps/web/src/app/[locale]/(app)/academia/alumnos/[personId]/page.tsx` (tocada: ~224 líneas)
- `apps/web/src/app/[locale]/(app)/academia/alumnos/nuevo/page.tsx` (NO tocada por el polish)
- `apps/web/src/components/academy/students-section.tsx` (tocado +7)
- `apps/web/src/components/academy/students-insights.tsx` (tocado +34)

Sospecha conocida a verificar: `nuevo` quedó fuera del polish.
