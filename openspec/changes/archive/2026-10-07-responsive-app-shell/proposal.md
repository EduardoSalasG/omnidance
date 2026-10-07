## Why

La app es hoy mobile-only: todo el contenido vive en una columna angosta
(`max-w-2xl`) con tab bar inferior y drawer hamburguesa. En desktop se ve
como una app de teléfono estirada. Los usuarios de consola B2B (dueño de
academia, productor, staff, profesor) trabajan principalmente desde
computador, y el bailarín también merece una web usable en pantallas
anchas.

## What Changes

- **Shell responsive**: a `≥lg` (1024px) la app SHALL mostrar una sidebar
  izquierda de navegación en vez del bottom tab bar. La sidebar es tipo
  drawer colapsable: expandida (ícono + label, grupos por dominio) ↔
  colapsada (rail de solo íconos con tooltip); el estado persiste por
  dispositivo. El drawer overlay y el bottom bar MUST NOT renderizarse en
  `≥lg`; bajo `lg` el layout actual queda intacto.
- **Nav por rol en la sidebar**: los grupos de módulos reusan el spec del
  drawer existente (`DRAWER_BY_ROLE`); el rol DANCER obtiene navegación por
  lente (Social: inicio, eventos, amigos, bailes, prácticas, escanear,
  Mi QR / Academia: inicio, clases, academias, Mi QR) con el
  `ModeToggle` Social/Academia accesible en el chrome.
- **Anchos por arquetipo**: las páginas dejan el `max-w-2xl` uniforme por
  anchos según su tipo — exploración/hub/listados `lg:max-w-5xl` con cards
  en grilla multi-columna; fichas/detalle `lg:max-w-4xl` con layout de 2
  columnas donde haya panel natural; formularios y flujos conservan lectura
  angosta; consola de puerta staff con layout propio de columnas.
- **Alcance**: todas las superficies del bailarín (ambas lentes) y las
  consolas de ACADEMY_OWNER, INSTRUCTOR, PRODUCER y STAFF (incluida la
  consola de puerta `/staff/[eventId]`). Admin/DJ/Venue/Support no son el
  foco pero heredan la sidebar igual que el resto.

## Capabilities

### New Capabilities
- `responsive-app-shell`: shell de navegación desktop (sidebar colapsable,
  topbar, breakpoint `lg`), anchos por arquetipo de página y layouts
  multi-columna de las superficies en `≥lg`.

### Modified Capabilities
- `dancer-navigation`: el bottom bar de 5 ítems y la ausencia de drawer del
  DANCER se acotan a `<lg`; en `≥lg` la navegación del bailarín es la
  sidebar con sus destinos por lente.

## Impact

- Solo `apps/web`: `ChromeShell`/`BottomNav`/`SideDrawer` + nuevo
  `AppSidebar`, `globals.css`, y los `page.tsx`/`*.tsx` de las superficies
  en alcance (~70 archivos de página, la mayoría cambios de clases).
- Sin cambios de API, contratos, schema ni migraciones.
- Onboarding tours (driver.js) apuntan a `[data-tour]` del chrome móvil —
  en desktop los targets pueden no existir; los tours se evalúan/saltean
  por breakpoint.
