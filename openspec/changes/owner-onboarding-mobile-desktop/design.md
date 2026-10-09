## Context

- `BottomNav.tsx` compone `drawerGroups = [...roleDrawer, accountGroup]`:
  `accountGroup` (Perfil) se agrega siempre, así `hasDrawerItems` es true
  para el DANCER aunque `DRAWER_BY_ROLE.DANCER = []` → la hamburguesa
  renderiza y abre un drawer con solo "Cuenta → Perfil".
- `OnboardingRunner` (driver.js) ya filtra steps cuyo target no existe
  o no es visible (`getClientRects() = 0`), así un solo arreglo de steps
  sirve para ambos viewports. El flag por persona vive en
  `me.onboarding[tour]` vía `POST /me/onboarding`.
- `AppSidebar` ya expone `data-tour` por item (`DrawerItem.dataTour`) y
  el toggle lleva `appbar-menu`; el `<nav>` no tiene anchor propio.
- `GET /academies/:id/dashboard` ya entrega `teamCount`, `plansCount`,
  `kpis.weeklyClasses`, `totalStudents`; falta el conteo de métodos de
  pago activos para el paso nuevo del checklist.

## Goals / Non-Goals

**Goals:**
- DANCER cumple `dancer-navigation`: en `<lg` no existe drawer ni
  hamburguesa (Perfil ya es tab).
- Checklist de activación persistente hasta completar los 5 pasos,
  incluido "método de pago", con progreso visible.
- Tour del owner con cobertura real en mobile y desktop usando el
  runner existente (mismo flag/mecanismo, sin librerías nuevas).
- Tour del staff de `/academia` deja de degradarse a 0-1 pasos en
  desktop (anchors de sidebar para `nav-academy`/`nav-classes`).

**Non-Goals:**
- Wizard de página dedicada ni gating obligatorio de configuración:
  la checklist sigue siendo asistiva dentro del dashboard.
- Tours nuevos para otros roles (productor/admin ya tienen los suyos).
- Dismiss manual de la checklist: desaparece al completarse.

## Decisions

- **Drawer dancer**: para `activeRole === "DANCER"` el `drawerGroups`
  queda vacío (sin `accountGroup`). `hasDrawerItems` además exige `me`
  resuelto → la hamburguesa nunca flashea durante la carga de `/me`
  (mismo criterio que el tab bar, que espera `meChecked`). El SideDrawer
  sigue montado pero sin grupos y sin affordance para abrirse.
- **Checklist**: la condición pasa de `totalStudents === 0` a
  `!allDone` con 5 pasos ordenados (series → plan → método de pago →
  equipo → primer alumno). Se agrega `methodsCount` al dashboard (count
  aditivo en el Promise.all existente) en vez de un fetch extra —
  mismo patrón que `teamCount`. El header muestra "{done} de {total}".
- **Tour owner**: nueva clave `academia-owner` (independiente de la
  clave `academia` que usa el hub de staff — un owner que también es
  staff en otra academia ve ambos recorridos). Steps sobre secciones
  del dashboard con anchors `academy-kpis`, `academy-checklist`,
  `academy-today`, `academy-alerts`; el paso de navegación declara dos
  candidatos: `appbar-menu` (hamburguesa, `<lg`) y `app-sidebar`
  (`<nav>` de AppSidebar, `≥lg`) — el runner conserva solo el visible.
  La campana (`appbar-bell`) cierra el tour.
- **Carrera de targets async (descubierta en verificación)**: los
  anchors del dashboard solo existen tras resolver `AcademyGate` →
  `GET /academies/mine` → `GET /academies/:id/dashboard`; el runner
  resolvía sus steps una sola vez al llegar `/me` y el tour quedaba
  reducido a los 2 anchors del chrome. Dos defensas: el runner se
  monta **dentro** del `AcademyGate` (los anchors estáticos ya
  existen) y `OnboardingRunner` sondea cada 250ms hasta que el set de
  targets quede estable ~1.5s (o 8s máx) — así las secciones que
  dependen del fetch (checklist, today, colas, alertas) entran al
  tour y las que nunca existen se omiten como antes.
- **Anchor de sidebar**: `data-tour="app-sidebar"` en el `<nav>` de
  `AppSidebar` (todo el menú, no un item puntual — el popover cubre
  "todos los módulos"). En riel colapsado el nav sigue visible → el
  step funciona en ambos estados.
- **Staff tour**: `SIDEBAR_TOUR` gana `/academia` → `nav-academy` y
  `/academia/clases` → `nav-classes`; en desktop los steps del tour
  staff resuelven contra la sidebar (en mobile ya resuelven los tabs).

## Risks / Trade-offs

- `academy-kpis`/`academy-today`/`academy-alerts` envuelven secciones
  existentes: el tour queda atado a la estructura del dashboard (si la
  sección se elimina, el step se omite solo — comportamiento tolerado
  por diseño del runner).
- Owners existentes verán el tour una vez (clave nueva): intencional —
  es onboarding nuevo, no repetición del anterior.
- `methodsCount` suma una query `count` al dashboard (ya batched en un
  Promise.all grande): impacto despreciable.
