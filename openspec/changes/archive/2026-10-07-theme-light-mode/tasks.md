# Tasks: theme-light-mode

## 1. Plumbing

- [x] 1.1 `lib/theme.ts`: pref system|light|dark, localStorage
      `omnidance:theme`, evento `omnidance:theme`, resolución por
      matchMedia, listener en vivo cuando pref=system.
- [x] 1.2 Script inline anti-FOUC en `app/layout.tsx` `<head>`.
- [x] 1.3 `color-scheme` dinámico: `:root` light, `.dark` dark.

## 2. Tokens

- [x] 2.1 Vars semánticas en `globals.css` (claro default, `.dark` con
      valores actuales; acento por tema dentro de data-mode).
- [x] 2.2 `tailwind.config.ts`: colores canvas/surface/elevated/raised/
      ink/line/on-accent; night mapeado a vars (compat).

## 3. Toggle

- [x] 3.1 `ThemeToggle` segmentado (radiogroup, íconos, min-h-9).
- [x] 3.2 Ubicar en AppSidebar footer, SideDrawer footer y footer de
      marketing.
- [x] 3.3 i18n keys `theme.*` en `parts/*.json`.

## 4. Migración

- [x] 4.1 Codemod night-*/white-* → tokens; ejecutar por área y
      revisar diff (ui/ → components → app).
- [x] 4.2 Casos manuales: scrollbar, driver.js, leaflet, glow-neon,
      charts, selection, hexes literales, `text-night-950`→on-accent.

## 5. Verificación

- [x] 5.1 tsc --noEmit + i18n ALL_KEYS_OK + build web.
- [x] 5.2 impeccable detect --json sobre diff.
- [ ] 5.3 QA visual claro/oscuro 320/1024/1440 + persistencia +
      cambio SO en vivo.
- [ ] 5.4 Archivar change + handoff docs/.
