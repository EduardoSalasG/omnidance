# Brief: audit-promos

Lee `docs/audit-briefs/_common.md` primero: contiene el checklist, la
referencia de expand y el formato de output. Audita SOLO estos archivos:

- `apps/web/src/app/[locale]/(app)/academia/promos/page.tsx` (tocada ~152)
- `apps/web/src/app/[locale]/(app)/academia/promos/[id]/page.tsx` (tocada ~112)
- `apps/web/src/app/[locale]/(app)/academia/promos/nueva/page.tsx` (NO tocada por el polish)

Ojo: hubo un fix posterior `2d48bf3f` (setState del padre diferido en
promos) — verifica que el patrón actual esté sano.
