# Brief compartido: polish consola academia

Repo: `C:\Users\salas\Documents\omni-dance` (monorepo pnpm; web Next.js
en `apps/web`, dev server vivo en :3000). Tu sección asignada está al
final de tu prompt (`SECTION=`). NO trabajes fuera de tu sección.

## Mandato

Refinar las páginas asignadas para **mobile (≥320px) y desktop**
contra las skills del repo — LEELAS PRIMERO:

1. `.devin/skills/console-patterns/SKILL.md` (las 6 reglas:
   crear=CTA→página, card clickeable→ficha con chevron derecho,
   ficha concentra datos+edición+acciones, destructivo=zona roja
   centrada+ConfirmSheet, un h1 efectivo por página vía
   ConsoleHeader/appbar, estados loading/error/empty/forbidden
   explícitos).
2. `.devin/skills/ui-ux-principles/SKILL.md` (agrupar→jerarquizar→
   acercar, 3 niveles, affordance, color-semántica, tabular-nums,
   truncate, touch targets ≥min-h-11, container de página
   `mx-auto max-w-2xl ... lg:max-w-5xl`).

Audita cada página de tu sección (listado + fichas + crear/editar) y
corrige anti-patrones encontrados: ConsoleHeader/back faltante o
mal apuntado, items navegables sin chevron, `<Spinner>` desnudo a
nivel panel (usar SkeletonList/SkeletonCard de `@/components/ui`),
mutación silenciosa o redirect de éxito (usar `ActionNotice` import
por path `@/components/ui/action-notice`), `window.confirm` (usar
`ConfirmSheet`), zona destructiva fuera de patrón, grids que
revientan en mobile (verifica clases responsive: 320px no debe hacer
scroll horizontal ni truncar datos clave), estados vacíos sin CTA,
h1 duplicados, touch targets <44px, texto crudo de enums.

## Restricciones duras

- NO edites: `components/ui/*`, `components/console/*`,
  `components/academy/shared.tsx`, `components/query/*`,
  `components/layout/*`, archivos i18n (`**/i18n/**/*.json`),
  `docs/**`, `openspec/**`, nada de `apps/api`, nada fuera de tu
  sección. Si un fix pertenece a un compartido, repórtalo no lo
  hagas.
- NO commitees ni crees branches.
- i18n: toda string nueva por catálogo; si necesitas keys nuevas,
  repórtalas como `ns.sub.key = texto es-CL` (el orquestador las
  agrega). Reutiliza keys existentes siempre que se pueda.
- Sin `any` ni `@ts-ignore`. Comentarios/copy en español; prohibido
  guiones largos (—) y dobles (--) como separador: punto, punto y
  coma, dos puntos o paréntesis.
- Patrón de aviso post-acción: `ActionNotice` (éxito neutro,
  `error: true` en fallo). Confirmación destructiva: `ConfirmSheet`.
- Nivel de página de sección (item directo del drawer): sin
  `ConsoleHeader`. Páginas empujadas (ficha/crear/editar):
  `ConsoleHeader backHref` al padre canónico.

## Verificación obligatoria antes de terminar

`cd apps/web && pnpm exec tsc --noEmit` limpio (los errores
pre-existentes de OTROS archivos no son tuyos, pero los tuyos sí).
Reporta: archivos tocados, anti-patrones corregidos (lista por
página), keys i18n nuevas necesarias, fixes compartidos pendientes,
y qué no pudiste verificar.
