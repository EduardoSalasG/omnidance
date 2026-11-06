# Brief: audit-equipo

Lee `docs/audit-briefs/_common.md` primero: contiene el checklist, la
referencia de expand y el formato de output. Audita SOLO estos archivos:

- `apps/web/src/app/[locale]/(app)/academia/equipo/page.tsx` (NO tocada por el polish)
- `apps/web/src/app/[locale]/(app)/academia/equipo/[id]/page.tsx` (tocada ~26; referencia canónica de zona destructiva)
- `apps/web/src/app/[locale]/(app)/academia/equipo/[id]/editar/page.tsx` (tocada ~5)
- `apps/web/src/app/[locale]/(app)/academia/equipo/nuevo/page.tsx` (NO tocada)
- `apps/web/src/app/[locale]/(app)/academia/equipo/profesor/[id]/page.tsx` (tocada ~32)
- `apps/web/src/app/[locale]/(app)/academia/equipo/profesor/[id]/editar/page.tsx` (tocada ~5)
