## 1. Shell: sidebar + topbar

- [x] 1.1 `components/layout/AppSidebar.tsx`: nav por rol reutilizando `DRAWER_BY_ROLE` + spec nuevo del DANCER por lente (`DANCER_SIDEBAR`); estados expandida (`w-64`) ↔ rail de íconos (`w-16`); persistencia `localStorage` (`omnidance:sidebar` en `lib/sidebar-state.ts`) + evento como `view-mode.ts`; `aria-current`, `<nav aria-label>`, tooltips en rail, motion-reduce.
- [x] 1.2 Integración en `BottomNav`/`ChromeShell`: sidebar `hidden lg:flex` fija, contenido `lg:pl-64`/`lg:pl-16` con transición; tab bar, drawer overlay y sheet con `lg:hidden`; hamburguesa solo `<lg` + toggle de sidebar (panel-icon) `hidden lg:flex` en el slot izquierdo del appbar; hide-on-scroll desactivado en `≥lg` vía media query en `globals.css`; `pb-[tab]` con `lg:pb-0`.
- [x] 1.3 `ModeToggle` del dancer vive en el appbar (slot central en `/inicio`), que sigue visible en desktop; la sidebar lista los destinos por lente y el acento cambia con `data-mode`.

## 2. Tours y utilidades

- [x] 2.1 `OnboardingRunner`: filtra steps por existencia Y visibilidad (`getClientRects`) → los targets `lg:hidden` del chrome móvil se omiten en desktop; `data-tour` replicado en ítems de sidebar (`nav-home`, `nav-events`, `nav-profile`) y en el toggle (`appbar-menu`); overlays fijos (`InstallPrompt`, `ConsentBanner`, `PushOptIn`) anclados `lg:bottom-6`.

## 3. Dancer responsive (ambas lentes)

- [x] 3.1 Anchos por arquetipo aplicados: hubs/listados `lg:max-w-5xl lg:px-8` con grids `sm:grid-cols-2 lg:grid-cols-3`; fichas `lg:max-w-4xl`; forms `lg:max-w-3xl`; CTAs fijos `lg:bottom-0`. Cubierto: `/inicio` (HomeHub), `/eventos`, `/amigos*`, `/bailes`, `/practicas*`, `/academias*`, `/clases*`, `/locales/[id]`, `/perfil*`, `/notificaciones`, `/soporte`. (No existen `/locales` listado ni `/entradas` — redirect; los checkouts son forms.)
- [x] 3.2 Commit `8c504e2` (20 archivos, solo clases aditivas).

## 4. Consolas responsive

- [x] 4.1 `/academia` hub + subrutas (clases, planes, alumnos, horarios, series, asistencia, particulares, videos, cobros, equipo, importar, suscripcion + `/nueva`): anchos por arquetipo + grids internos (commit `bfeb707` + cierre de `components/academy/**`).
- [x] 4.2 `/productor` + `eventos`, `eventos/[id]`, `codigos`, `listas`, `pagos`, `parametros`, `comprobantes` + `/nuevo|/nueva`; `/crm` (hub, campanas, triggers); `/analitica` + `usuarios*`. Commit `18dea12`.
- [x] 4.3 `/staff` listado (grid de eventos) + `/staff/[eventId]` a 2 columnas en `≥lg` (`lg:grid-cols-[380px_1fr]`: escáner+ingreso manual | check-ins con scroll propio), fullscreen operativo sin chrome conservado.

## 5. Cierre

- [x] 5.1 i18n keys nuevas (`nav.collapseMenu`/`nav.expandMenu` en `parts/navExtra.json`); ALL_KEYS_OK.
- [x] 5.2 Build web verde (79/79) + `tsc --noEmit` limpio; `impeccable detect --json` sin findings nuevos (1 falso positivo documentado en `staff/[eventId]`). Brecha declarada: QA visual manual en browser a 320px/768px/1024px/1440px pendiente (requiere sesión + backend).
