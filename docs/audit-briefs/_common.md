# Auditoría de consola: cobertura del polish + console-patterns

Repo: `C:\Users\salas\Documents\omni-dance` (omnidance, Next.js App Router).

Auditoría **read-only**: NO edites archivos. Reporta en el chat.

## Lee primero (en este orden)

1. `.devin/skills/console-patterns/SKILL.md` — las 6 reglas + contrato de listados + acceso.
2. `.devin/skills/ui-lists/SKILL.md` — filas, estados de lista, tablas, drill-down.
3. Referencia de expand "Ver todo": `apps/web/src/app/[locale]/(app)/academia/series/[id]/page.tsx` — patrón `LIST_PREVIEW = 5` + `showAll*` + `.slice(0, showAll ? undefined : LIST_PREVIEW)` + `<li>` final con `<button>` full-width `min-h-11 text-neon` que alterna `common.seeAll (N)` / `common.showLess` (líneas ~36-38, ~556-599, ~619-657).

## Contexto

El commit `25e1cea8` ("feat(web): polish de superficies de la consola academia", change `academy-console-views-polish`) aplicó el patrón de consolas a varias secciones. La auditoría verifica (a) si las subpages de cada sección quedaron cubiertas y (b) si cumplen el estándar.

## Checklist por page

1. `ConsoleHeader backHref backLabel` al tope (nunca `router.back()`); un solo `h1` (no `h1` propio en la página).
2. Crear = CTA `＋` en header/empty → página `/nuevo|/nueva`; nunca form inline ni modal de alta.
3. Cards/filas navegables: `<Link className="block">` envolviendo Card o fila completa, `hover:border-neon/60`, `ChevronRightIcon h-4 w-4 shrink-0 text-ink/40` al filo derecho, `focus-visible:outline-neon`, sin interactivos anidados.
4. Ficha: datos en `<dl>` dentro de Card (dt `text-xs text-ink/50`, dd `tabular-nums`); header desnudo que navega a editar donde aplique (`group` + `group-hover:text-neon` + chevron); mutaciones en la ficha, no en el listado.
5. Destructivo: zona roja al pie (`border-t border-line pt-6`, centrada, `variant="ghost"` + `text-red-400 hover:text-red-300`) con `ConfirmSheet`; nunca `window.confirm`.
6. Estados: `SkeletonList`/`SkeletonCard` (no `<Spinner>` desnudo de panel), `role="alert"` + retry en error, empty con CTA (`query.empty` si hay filtros), forbidden con CTA de salida, `role="status"` solo éxito. `ActionNotice` post-acción (no resultado por `searchParams`).
7. Touch targets `min-h-11`; inputs con label/aria-label.
8. Listados: `FilterBar` + `EntityDef`/`QueryFilters` compartidos + `Pager` sobre `{items,total,page,pageSize}`; colas operativas solo navegan.
9. **Expand**: por cada lista/tabla dentro de ficha que pueda crecer (historiales, reservas, miembros): ¿tiene o le falta el preview + "Ver todo" del patrón de referencia? Reporta también expands existentes que solo duplican lo que ya muestra la lista/ficha (deberían eliminarse) y filas que hacen drill inline cuando deberían ser Link→ficha.

## Output

Por page: ruta, veredicto (`conforme` / `parcial` / `no conforme` / `no tocada por el polish`), y gaps concretos citando archivo:línea. Cierra con resumen de gaps ordenado por severidad (bloqueante / mejora / expand). Español, conciso, sin código salvo snippets mínimos.
