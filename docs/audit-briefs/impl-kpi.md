# Brief: impl-kpi (KPI insight cards con descripción visible)

Lee `docs/audit-briefs/_impl-common.md`. Scope exclusivo:

**Patrón canónico**: `apps/web/src/components/academy/academy-kpi-strip.tsx`
(~l195-235): cada card KPI muestra (a) label uppercase `text-xs
text-ink/50`, (b) valor grande `tabular-nums` (+delta verde/rojo
semántico fuera del chip), (c) **hint visible** — descripción chica
bajo el valor que explica qué mide (también en `title` y aria-label
compuesto `${label}: ${value}. ${hint}`).

**Trabajo**: audita TODAS las KPI/insight cards de la app y lleva las
que no lo hacen a mostrar el hint visible. Punto de partida:

- `apps/web/src/app/[locale]/(app)/academia/planes/page.tsx`
  `PlansKpiCards` (~l206+): el hint ya existe en i18n
  (`planKpi*Hint`) pero solo viaja en aria-label → renderizarlo
  visible como en el strip canónico.
- `apps/web/src/components/academy/cobros-kpis.tsx`,
  `series-insights.tsx`, `students-insights.tsx`,
  `academy-levels-card.tsx`, `private-lessons.tsx` y cualquier otra
  card KPI/insight que encuentres con grep (`grep -rln
  "kpi\|Kpi\|insight" apps/web/src/`): mismo tratamiento.
- Productor/analitica si hay cards KPI equivalentes.

Reglas: reusar keys `*Hint` existentes cuando haya; nuevas keys solo
en el part-JSON del dominio (+ mirrors en/fr/pt-PT). Hints cortos
verb-first en es-CL, traducidos. NO toques `common.json`. NO git.
Al final: `cd apps/web && npx tsc --noEmit` y
`node apps/web/scripts/i18n-audit.cjs`. Reporta archivos + qué cards
quedaron sin hint (y por qué si aplica).
