# Handoff 2026-10-07a — Modo claro/oscuro

## Completado

- **Theming claro/oscuro** (`theme-light-mode`, archivado): preferencia
  `system|light|dark` en localStorage `omnidance:theme`; `system` sigue
  `prefers-color-scheme` y reacciona en vivo. Boot script inline en
  `app/layout.tsx` <head> evita FOUC (clase `.light`/`.dark` en <html>
  antes del primer paint; `suppressHydrationWarning`).
- **Tokens semánticos** en `globals.css`: `:root`=claro, `.dark`=oscuro
  (valores idénticos al dark-first anterior → regresión cero en dark).
  Vars: canvas/surface/elevated/raised/ink/line/on-accent + accent por
  tema y por data-mode (lente). `tailwind.config` expone los colores;
  `night-*` mapea a las mismas vars por compat.
- **Codemod** `apps/web/scripts/codemod-theme.cjs`: migró 179/246
  archivos de literales night-*/white-* a tokens. Excepciones manuales:
  badges de color en staff door (text-white sobre bg-green/red),
  iframe de preview de email (bg-white = documento), inputs
  bg-black/40 → bg-canvas, WhatsApp #25D366 literal (marca).
- **ThemeToggle** (`components/layout/ThemeToggle.tsx`): radiogroup
  segmentado Sistema/Claro/Oscuro en footer de AppSidebar (compact
  cicla en riel colapsado), SideDrawer y footers públicos
  (Landing + /pro). Keys `nav.theme*` en parts/navExtra.json.
- Casos manuales migrados en globals.css: scrollbar, ::selection,
  driver.js popover (--shadow-strength), glow-neon (--glow-alpha).
- themeColor del viewport sigue al SO (media queries).

## Verificado

- `tsc --noEmit` limpio; i18n `ALL_KEYS_OK`; `pnpm build` 79/79.
- `impeccable detect`: 4 warnings preexistentes (easings documentados,
  <img> de puerta) - ninguno nuevo.

## Brecha

- QA visual en claro pendiente (usuario): revisar contraste en cards,
  charts de analítica, mapa, tours y consola de puerta a 320/1024/1440.
  El preview en localhost:3000 sirve para recorrerlo (toggle en el
  footer del drawer/sidebar).
