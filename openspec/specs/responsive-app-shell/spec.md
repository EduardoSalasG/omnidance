# responsive-app-shell Specification

## Purpose
Shell de navegación responsive de la app autenticada: en viewports de
desktop (`≥1024px`) la navegación es una sidebar lateral colapsable y los
contenidos usan anchos y grillas acordes; bajo ese breakpoint se conserva
el chrome móvil actual.

## Requirements

### Requirement: Sidebar desktop colapsable

En viewports `≥lg` la app SHALL renderizar una sidebar izquierda persistente
con los módulos del rol activo agrupados por dominio. La sidebar MUST
soportar dos estados — expandida (ícono + label + headers de grupo) y
colapsada (rail de solo íconos, label accesible vía tooltip/`aria-label`) —
con un toggle visible para cambiar de estado. El estado MUST persistir por
dispositivo. La sidebar MUST marcar la ruta activa con `aria-current` y ser
un `<nav>` con `aria-label`.

#### Scenario: Toggle de la sidebar

- **WHEN** el usuario en desktop presiona el toggle de la sidebar
- **THEN** la sidebar alterna entre expandida y rail de íconos
- **AND** la preferencia persiste al recargar la página

#### Scenario: Navegación por rol

- **WHEN** un usuario con rol activo PRODUCER (u otro) está en desktop
- **THEN** la sidebar lista los módulos de su rol agrupados por dominio
- **AND** el ítem de la ruta actual aparece marcado como activo

### Requirement: Chrome móvil excluido en desktop

En `≥lg` MUST NOT renderizarse el bottom tab bar, el botón central `+`,
el drawer overlay ni el sheet de acciones. Bajo `lg` el chrome móvil actual
(tab bar, drawer/sheet, hide-on-scroll del appbar) SHALL conservarse sin
cambios. El topbar en desktop SHALL conservar el título de sección, la
campana de notificaciones con badge y —para el DANCER— el toggle de lente
Social/Academia.

#### Scenario: Sin tab bar en desktop

- **WHEN** cualquier rol autenticado navega en un viewport `≥1024px`
- **THEN** no existe tab bar inferior ni botón `+` central
- **AND** la campana de notificaciones sigue visible en el topbar

#### Scenario: Móvil sin cambios

- **WHEN** el viewport es `<1024px`
- **THEN** el chrome funciona exactamente como hoy (tab bar, sheet/drawer,
  hide-on-scroll)

### Requirement: Anchos por arquetipo de página

En `≥lg` las páginas SHALL usar el ancho acorde a su arquetipo: listados y
hubs de exploración aprovechan grillas multi-columna (≥2 columnas cuando
el contenido lo permite); fichas de detalle pueden usar layout de 2
columnas (contenido + panel lateral); formularios y flujos transaccionales
conservan una columna de lectura angosta centrada. Ninguna página MUST
quedar con contenido ilegiblemente estirado ni cortada a ancho de teléfono.

#### Scenario: Listado en desktop

- **WHEN** el usuario abre un listado (eventos, academias, clases, amigos,
  módulos de consola) en `≥lg`
- **THEN** el contenido usa más de una columna de cards o el ancho completo
  disponible con límite de lectura

#### Scenario: Formulario en desktop

- **WHEN** el usuario abre un formulario o checkout en `≥lg`
- **THEN** el formulario se mantiene en una columna angosta centrada
  legible

### Requirement: Consola de puerta staff en desktop

La consola de puerta `/staff/[eventId]` SHALL mantener su carácter de
pantalla operativa en desktop, distribuyendo en `≥lg` las acciones/
métricas y la lista de check-ins en columnas en vez de una sola columna
apilada.

#### Scenario: Puerta en desktop

- **WHEN** el staff abre la consola de un evento en `≥lg`
- **THEN** las métricas/acciones y la lista de check-ins se distribuyen en
  columnas sin scroll excesivo para la acción principal

### Requirement: Tours de onboarding en desktop

Los tours de primera visita que referencian elementos del chrome móvil
(`data-tour` de tabs/sheet/drawer) MUST NOT fallar ni quedar bloqueados
en desktop: los pasos cuyo target no exista se omiten o el tour no corre
en `≥lg`. Además, los tours de las consolas que el rol usa en ambos
viewports SHALL declarar un paso de navegación con target en cada
chrome (drawer/hamburguesa en `<lg`, sidebar en `≥lg`), de modo que la
guía de navegación no quede reducida o ausente en desktop.

#### Scenario: Tour en desktop

- **WHEN** un usuario nuevo entra a una sección con tour en `≥lg`
- **THEN** la app no muestra popovers rotos ni apuntando a elementos
  inexistentes

#### Scenario: Tour de consola con navegación cubierta en ambos chromes

- **WHEN** un owner o staff abre su consola por primera vez en `≥lg`
- **THEN** el tour incluye un paso de navegación apuntando a la sidebar
