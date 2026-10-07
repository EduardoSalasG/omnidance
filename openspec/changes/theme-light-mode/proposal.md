# Propuesta: theme-light-mode

## Problema

La app es 100% dark-first: `color-scheme: dark` fijo en `:root`, ~180
archivos con literales `night-*`/`white-*`, y ninguna forma de ofrecer
tema claro. Los usuarios que prefieren modo claro (o cuyo equipo está en
claro) ven una app oscura forzada, sin opción de cambiarla.

## Solución

Introducir theming claro/oscuro con tres pilares:

1. **Resolución de tema**: preferencia `system | light | dark` en
   localStorage (`omnidance:theme`). `system` sigue
   `prefers-color-scheme` y reacciona a cambios del SO en vivo. Script
   inline en `<head>` aplica la clase antes del primer paint (sin FOUC).
2. **Tokens semánticos**: nuevas variables CSS (`canvas`, `surface`,
   `elevated`, `raised`, `ink`, `line`, `on-accent`) con valores por
   tema; los literales `night-*`/`white-*` migran a tokens vía codemod.
   El tema oscuro queda pixel-idéntico al actual (los valores dark de
   las vars son los hex de hoy).
3. **Toggle de usuario**: control segmentado Sistema/Claro/Oscuro en el
   footer del `AppSidebar` (desktop), del `SideDrawer` (mobile) y del
   footer de páginas públicas.

## Alcance

- Toda superficie de `apps/web`: app autenticada (dancer + consolas),
  marketing/public, overlays (driver.js tour, sheets), mapa Leaflet,
  charts de analítica, scrollbar y `color-scheme`.
- Sin cambios de backend ni de datos (persistencia solo localStorage).

## Riesgos

- Casos puntuales donde un literal no migre limpio (contraste sobre
  acento, imágenes, mapa) → revisión manual + QA visual por arquetipo.
- El codemod toca ~180 archivos → diff grande; se revisa por área y se
  verifica con typecheck + build + impeccable detect.
