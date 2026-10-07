# Diseño: theme-light-mode

## Resolución de tema

- `lib/theme.ts`: `ThemePref = "system" | "light" | "dark"`.
  - `readThemePref()` / `writeThemePref()` sobre `localStorage`
    `omnidance:theme`; evento `omnidance:theme` para sincronía entre
    componentes (mismo patrón que `sidebar-state.ts`).
  - `resolveTheme(pref)`: `system` → `matchMedia("(prefers-color-scheme:
    dark)")`; devuelve `"light" | "dark"`.
  - `applyTheme(resolved)`: `document.documentElement.classList` →
    `dark`/`light`; además `dataset.theme` para depuración.
  - Cuando pref = `system`, un listener de `matchMedia` reaplica al
    cambiar el SO.
- Script inline bloqueante en `app/layout.tsx` `<head>` (antes de
  pintar): lee `omnidance:theme`, resuelve sistema, setea la clase.
  Sin preferencia → `system`.
- `color-scheme` deja de estar fijo: `:root` declara `light` y `.dark`
  declara `dark` → form controls, scrollbars y date-pickers nativos
  siguen el tema.

## Tokens semánticos

Nuevas vars RGB-triplete en `globals.css`. `:root` (default) = claro,
`.dark` = valores actuales del dark-first. El acento `--accent`/
`--accent-soft` sigue swappeando por `data-mode` (lente social/academia)
y además tiene variante por tema en claro (más saturado para contraste).

| Token | Claro | Oscuro (= actual) |
|---|---|---|
| `--canvas` | `246 246 248` | `10 10 15` (#0a0a0f) |
| `--surface` | `255 255 255` | `18 18 26` (#12121a) |
| `--elevated` | `255 255 255` | `28 28 40` (#1c1c28) |
| `--raised` | `234 234 239` | `42 42 58` (#2a2a3a) |
| `--ink` | `22 22 30` | `255 255 255` |
| `--line` | `22 22 30` | `255 255 255` |
| `--on-accent` | `11 11 16` | `11 11 16` |
| `--accent` (social, claro) | `124 58 237` | `167 139 250` |
| `--accent` (academy, claro) | `5 150 105` | `52 211 153` |

Tailwind `colors` gana `canvas`, `surface`, `elevated`, `raised`,
`ink`, `line`, `on-accent` (`rgb(var(--x) / <alpha-value>)`). `night`
y `neon` permanecen (night mapeado a las mismas vars para no romper
nada no migrado; neon = acento, sin cambios).

### Reglas del codemod

- `bg-night-950` → `bg-canvas`; `bg-night-900` → `bg-surface`;
  `bg-night-800` → `bg-elevated`; `bg-night-700` → `bg-raised`;
  `bg-night-600` → `bg-raised`.
- `border-night-*/divide-night-*` → `border-line`/`divide-line`.
- `text-night-*` → `text-ink` salvo `text-night-950` sobre fondo acento
  → `text-on-accent` (los 28 casos se revisan uno a uno).
- `text-white` → `text-ink`; `text-white/N` → `text-ink/N`;
  `border-white/N` → `border-ink/N` (= `border-line/N`);
  `bg-white/N` → `bg-ink/N`; `divide-white/N` → `divide-ink/N`.
- Gradientes `from-night-*`/`via-`/`to-` → mismo mapa que `bg-`.
- Placeholders `placeholder-white/*` → `placeholder-ink/*`.

### Casos manuales (fuera del codemod)

- Scrollbar hex `#2a2a3a` → var `--raised`.
- Driver.js popover: vars de superficie/ink.
- Leaflet `venue-map-label`: ya claro → en dark pasa a vars dark.
- `glow-neon`: opacidad del radial más baja en claro.
- Charts analítica (recharts): colores de grid/texto por tema.
- `::selection` color `#fff` fijo → var.
- Hexes literales en componentes: se buscan y migran a vars.

## Toggle

`ThemeToggle` (client): `radiogroup` segmentado de 3 opciones
(Sistema/Claro/Oscuro) con íconos monitor/sol/luna, `min-h-9`,
`aria-checked` por opción. Ubicaciones:

- `AppSidebar` footer, sobre el botón de colapso (expandido muestra
  labels; rail colapsado muestra solo íconos).
- `SideDrawer` footer (mobile).
- Footer del layout de marketing (públicas).

i18n: `theme.system`, `theme.light`, `theme.dark`, `theme.label` en
`src/i18n/parts/navExtra.json` (o part nueva `theme.json`).

## Verificación

- `tsc --noEmit`, i18n `ALL_KEYS_OK`, build web.
- `impeccable detect --json` sobre el diff.
- QA visual claro+oscuro a 320/1024/1440 por arquetipo (hub, detalle,
  form, puerta, landing, login, legal) + toggle + persistencia tras
  reload + cambio de tema del SO con pref=system.
