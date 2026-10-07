## 1. Shell: sidebar + topbar

- [ ] 1.1 Crear `components/layout/AppSidebar.tsx`: nav por rol reutilizando `DRAWER_BY_ROLE` + spec nuevo del DANCER por lente; estados expandida (`w-64`) ↔ rail de íconos (`w-16`); persistencia `localStorage` (`omnidance:sidebar`) + evento como `view-mode.ts`; `aria-current`, `<nav aria-label>`, tooltips en rail, motion-reduce. Verificar: en `≥lg` navega por rol y persiste el estado tras reload.
- [ ] 1.2 Integrar en `ChromeShell`/`BottomNav`: sidebar `hidden lg:flex` fija, contenido `lg:pl-64`/`lg:pl-16` según estado; tab bar, drawer overlay y sheet con `lg:hidden` real (fuera del árbol accesible); hamburguesa del topbar = toggle de la sidebar en `lg` con `aria-expanded`/`aria-controls`; hide-on-scroll del appbar solo `<lg`; `pb-[tab]` solo `<lg`. Verificar: móvil idéntico a hoy, desktop con sidebar.
- [ ] 1.3 `ModeToggle` del dancer disponible en el chrome desktop (topbar o cabecera de sidebar). Verificar: alternar Social/Academia en `≥lg` cambia ítems y acento.

## 2. Tours y utilidades

- [ ] 2.1 `OnboardingRunner`: en `≥lg` omitir pasos cuyo `data-tour` no exista (o no correr el tour si todos son del chrome móvil). Verificar: sin popovers rotos en desktop.

## 3. Dancer responsive (ambas lentes)

- [ ] 3.1 Anchos por arquetipo en: `/inicio`, `/eventos`, `/amigos`, `/amigos/[id]`, `/bailes`, `/practicas`, `/practicas/nueva`, `/academias`, `/academias/[id]`, `/academias/[id]/checkout`, `/clases`, `/clases/[id]`, `/locales`, `/locales/[id]`, `/entradas` (redirect), `/perfil`, `/perfil/datos`, `/perfil/pagos`, `/perfil/completar`, `/notificaciones`, `/qr`, `/escanear`, `/bienvenida`, `/eventos/[id]`, `/eventos/[id]/checkout`, `/eventos/[id]/evaluar`, `/checkout/return`, `/soporte`. Verificar: listados en grilla `lg`, fichas `lg:max-w-4xl`, forms `max-w-2xl`/`3xl`; nada roto a 320px.

## 4. Consolas responsive

- [ ] 4.1 `/academia` hub + subrutas (`clases`, `clases/[id]`, `planes`, `alumnos`, `alumnos/[personId]`, `horarios`, `series`, `asistencia`, `particulares`, `videos`, `cobros`, `equipo`, `importar`, `suscripcion` + las `/nueva` del change console-create-flows si ya están).
- [ ] 4.2 `/productor` + `eventos`, `eventos/[id]`, `codigos`, `listas`, `pagos`, `parametros`, `comprobantes` (+ `/nueva` si aplican); `/crm`, `/crm/campanas`, `/crm/triggers`, `/analitica`, `/analitica/usuarios*`.
- [ ] 4.3 `/staff` listado + `/staff/[eventId]` con layout de columnas en `lg` (métricas/acciones | check-ins), conservando fullscreen operativo.

## 5. Cierre

- [ ] 5.1 i18n keys nuevas (labels de sidebar, tooltips, aria) en `es-CL.json`/`parts`; chequeo ALL_KEYS_OK.
- [ ] 5.2 Build/tsc web verde; `impeccable detect --json` sobre el diff sin findings nuevos; QA visual 320px/768px/1024px/1440px de cada arquetipo.
