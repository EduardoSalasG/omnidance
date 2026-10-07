# Handoff - 2026-10-19d (responsive-app-shell + console-create-flows)

## Completado en esta sesión (commits en dev, sin push)

Tres frentes del pedido responsive: (1) responsive desktop de toda la
sección Social + Academia del DANCER, (2) patrones de flujo dancer
(botón Crear → página dedicada) replicados en consolas Academy/Producer,
(3) responsive desktop de Dueño de Academia, Productor, Staff e
Instructor.

### `console-create-flows` → archivado (`2026-10-07-console-create-flows`)

Formularios sueltos migrados a páginas dedicadas, patrón CTA:

- **Academia** (`42c766e`): `/academia/planes/nueva` (+`?edit=<id>`),
  `/videos/nuevo`, `/alumnos/nuevo`, `/equipo/nuevo`, `/series/nueva`
  (+`?edit`). Forms extraídos a `plan-form`, `video-form`,
  `enrollment-form`, `staff-form`, `series-form`.
- **Productor** (`6396cdc`): `/productor/eventos/nuevo` (+`?edit`),
  `/codigos/nuevo`, `/listas/nueva`, `/eventos/[id]/staff/nuevo`.
  Legacy `/productor/eventos?crear=1` redirige; tab central "+" del
  productor apunta a `/productor/eventos/nuevo`.
- Quedan inline por diseño: acciones por fila (`addSlot` en series,
  `addEntry` en listas), ingreso manual de puerta, settings.

### `responsive-app-shell` → archivado (`2026-10-07-responsive-app-shell`)

**Shell** (`abb639f`):
- `components/layout/AppSidebar.tsx` nuevo: sidebar desktop `hidden
  lg:flex`, expandida `w-64` (ícono+label, grupos) ↔ rail `w-16` (solo
  íconos, `title`/`aria-label`); toggle en footer + botón panel en el
  appbar (`hidden lg:flex`); estado en `localStorage`
  (`lib/sidebar-state.ts`, evento `omnidance:sidebar`).
- `BottomNav`: `DANCER_SIDEBAR` (spec por lente social/academia);
  `sidebarGroups` = tabs como primer grupo + drawer groups para roles
  de consola; contenido envuelto con `lg:pl-64`/`lg:pl-16` +
  `transition-[padding]`; tab bar `lg:hidden`; `SideDrawer` y
  `DancerActionsSheet` `lg:hidden`; hamburguesa móvil `lg:hidden`.
- `ChromeShell`: `pb-[tab]` → `lg:pb-0`. `globals.css`: media
  `min-width:1024px` desactiva `.appbar-hidden` (hide-on-scroll solo
  móvil). Prompts fijos (`InstallPrompt`, `ConsentBanner`, `PushOptIn`)
  bajan a `lg:bottom-6` (ya no hay tab bar).
- `OnboardingRunner` filtra steps por `getClientRects()>0` (targets
  `lg:hidden` se omiten); `data-tour` replicado en sidebar
  (`nav-home`/`nav-events`/`nav-profile`, `appbar-menu` en el toggle).
- i18n: `parts/navExtra.json` (`nav.collapseMenu`/`nav.expandMenu`).

**Dancer** (`8c504e2`, 20 archivos): hubs `lg:max-w-5xl lg:px-8` +
grids `sm:2 lg:3`; fichas `lg:max-w-4xl`; forms `lg:max-w-3xl`; CTAs
fijos `lg:bottom-0`. Móvil intacto (todo aditivo).

**Consolas** (`bfeb707` academy+staff, `18dea12` producer+crm+analytics,
`605b639` grids internos `components/academy/**`): mismos arquetipos;
`/staff/[eventId]` puerta a 2 columnas `lg:grid-cols-[380px_1fr]`
(escáner+manual | check-ins con scroll propio), fullscreen sin chrome
conservado; `module-grid` → `lg:grid-cols-3`.

### Verificación

- `tsc --noEmit` web: limpio. i18n audit: `ALL_KEYS_OK`.
- `pnpm --filter @omnidance/web build`: **79/79** páginas, sin errores.
- `impeccable detect --json` sobre el diff: 1 warning = falso positivo
  documentado (`<img>` real con `photoUrl` remota en `staff/[eventId]`,
  comentado en código).
- `openspec validate --specs`: **67/67** (warnings = placeholders
  preexistentes ajenos). Ambos changes archivados, specs canónicas
  `console-crud-flows` (nueva) y `responsive-app-shell` (nueva) +
  `dancer-navigation` actualizada.

## Brechas conocidas / próximo slice

- **QA visual manual pendiente**: no se hizo QA en browser (requiere
  sesión + backend). Revisar 320px / 768px / 1024px / 1440px, en
  particular: `/staff/[eventId]` (cámara en columna izquierda, scroll
  interno de check-ins), cards 3-col de `/academia/planes` y
  `/academia/alumnos` (~300px, contenido con select+date), y el toggle
  expandida↔rail con reload (persistencia localStorage).
- `staff-section` y lista staff de `private-lessons` quedaron en 2
  columnas máx. (densidad de controles) — decisión deliberada.
- Detalles dancer: varias fichas quedaron `lg:max-w-4xl` 1-columna
  porque el CTA fijo es la acción secundaria natural (no se metió panel
  lateral forzado).
- Nada pusheado; `dev` tiene 8 commits sobre el último estado de prod
  (v0.3.0). El release gate `dev → main` sigue pendiente de aprobación
  — este trabajo NO promueve nada.
