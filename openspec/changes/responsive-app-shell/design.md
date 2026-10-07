## Context

Hoy todo el chrome y contenido asume teléfono: `BottomNav` renderiza appbar
sticky + tab bar fija + `SideDrawer` overlay (o `DancerActionsSheet`), y
cada `<main>` va en `max-w-2xl`. No hay breakpoints salvo reduced-motion.
Tailwind 3.4 con defaults (`lg` = 1024px). Ver proposal.md.

## Goals / Non-Goals

- Goals: una sola app usable en teléfono y desktop sin duplicar páginas;
  sidebar drawer colapsable; anchos por arquetipo; accesibilidad (nav
  landmarks, foco, reduced-motion, sin pérdida de touch targets en móvil).
- Non-goals: redesign visual, cambios de tokens/branding, light mode,
  cambios de API, responsive de `(marketing)` y admin (queda razonable por
  herencia pero no es el foco), tests e2e nuevos por breakpoint.

## Decisions

- **CSS breakpoints, no JS**: toda la conmutación móvil/desktop via clases
  `lg:` de Tailwind (misma filosofía que el resto del repo). Excepción
  puntual: el estado expandido/colapsado de la sidebar sí es estado React
  persistido en `localStorage` (mismo patrón que `view-mode.ts`/
  `active-role.ts` — storage key `omnidance:sidebar` + evento).
- **La sidebar vive en `BottomNav`** (el componente que ya resuelve rol,
  tabs, drawer y badge): se renombra conceptualmente a chrome pero se mantiene
  el archivo para no romper imports. En `lg` renderiza `<aside>` fija a la
  izquierda + el contenido se desplaza con `lg:pl-[…]`; el tab bar y el
  drawer/sheet llevan `lg:hidden`.
- **Colapso = rail de íconos** (`w-16`), no ocultamiento total: decisión del
  usuario ("esconder y que aparezcan solo los íconos"). Los grupos colapsan
  a divisores; cada ítem conserva icono + `aria-label`/`title`.
- **DANCER en desktop**: nueva spec `SIDEBAR_DANCER` por lente — Social:
  Inicio, Eventos, Amigos, Bailes, Prácticas, Escanear, Mi QR, Perfil;
  Academia: Inicio, Clases, Academias, Mi QR, Perfil. El `+`/sheet no
  existe en desktop: Mi QR y Escanear son ítems directos.
- **Topbar en desktop**: conserva título + campana; la hamburguesa se
  convierte en el toggle de la sidebar (mismo botón, semántica documentada
  con `aria-expanded`/`aria-controls`). `ModeToggle` del dancer permanece.
- **Anchos**: las páginas migran de `max-w-2xl` a `lg:max-w-5xl` (hubs/
  listados), `lg:max-w-4xl` (detalles) o quedan en `max-w-2xl`/`3xl`
  (formularios, flujos, notificaciones). Grillas de cards:
  `sm:grid-cols-2 lg:grid-cols-3` donde el contenido sea homogéneo.
- **Puerta staff** (`/staff/[eventId]`): sigue sin chrome (`CHROME_HIDDEN_`
  PREFIXES); en `lg` usa grid propio `lg:grid-cols-[minmax(320px,1fr)_2fr]`
  con métricas/acciones a la izquierda y la lista de check-ins a la derecha.
- **Tours (driver.js)**: `OnboardingRunner` gana guard `matchMedia("(min-
  width:1024px)")` que salta los pasos cuyo target no exista (los del chrome
  móvil). Mismo criterio que hoy para targets ausentes.
- **Orden dentro del change**: (a) shell + sidebar primero — todo lo demás
  hereda el marco; (b) páginas dancer; (c) páginas de consolas. Las páginas
  `/nueva` del change `console-create-flows` nacen ya con las clases
  responsive si ese change aterriza primero; si no, se cubren en (c).

## Risks / Trade-offs

- [`BottomNav` ya es grande (~1100 líneas) y gana la sidebar] → extraer
  `AppSidebar.tsx` propio; `BottomNav` orquesta, no acumula markup.
- [70 archivos de página tocados = diff grande] → cambios mecánicos por
  arquetipo con checklist por página; review por slice, no por archivo.
- [Charts/mapa de `/analitica` y `/eventos?view=map` en ancho nuevo] →
  Leaflet/Charts se adaptan por `resize`; se verifica en QA visual.
- [Teclado/screen reader: duplicar nav móvil + sidebar] → en `lg` el DOM
  del tab bar queda `hidden` completo (no solo visual - `display:none` lo
  saca del árbol accesible); la sidebar es el único nav en desktop.

## Migration Plan

Solo front, sin datos ni contratos. Slices commiteables: shell → dancer →
consolas. Rollback: revert de commits.
