# Brief: audit-media

Lee `docs/audit-briefs/_common.md` primero: contiene el checklist, la
referencia de expand y el formato de output. Audita SOLO estos archivos:

- `apps/web/src/app/[locale]/(app)/academia/videos/page.tsx` (NO tocada por el polish)
- `apps/web/src/app/[locale]/(app)/academia/videos/nuevo/page.tsx` (tocada ~6)
- `apps/web/src/app/[locale]/(app)/analitica/page.tsx` (tocada ~27)
- `apps/web/src/app/[locale]/(app)/analitica/usuarios/page.tsx` (tocada ~96)
- `apps/web/src/app/[locale]/(app)/analitica/usuarios/[personId]/page.tsx` (tocada ~46)
- `apps/web/src/app/[locale]/(app)/analitica/consultas/page.tsx` (NO tocada)

En analítica el "listado" usa el query-console compartido — evalúa
contra el contrato FilterBar/Pager y el drill-down a ficha de usuario.
