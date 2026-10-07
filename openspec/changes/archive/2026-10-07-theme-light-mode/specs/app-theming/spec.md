# app-theming Specification Delta

## ADDED Requirements

### Requirement: Resolución de tema del sistema

La app SHALL resolver el tema visual (`light` | `dark`) desde la
preferencia del usuario (`system` | `light` | `dark`). Con preferencia
`system` (default sin elección previa) MUST seguir
`prefers-color-scheme` del equipo y reaccionar a cambios del SO en
vivo. La preferencia MUST persistirse en `localStorage` y aplicarse
antes del primer paint mediante script inline en `<head>` (sin flash
de tema al cargar).

#### Scenario: Primera visita sigue al sistema

- **WHEN** un usuario sin preferencia guardada abre la app con el SO
  en modo claro
- **THEN** la app renderiza en tema claro desde el primer paint

#### Scenario: Cambio de SO en vivo

- **WHEN** el usuario tiene preferencia `system` y el SO cambia de
  claro a oscuro
- **THEN** la app cambia de tema sin recargar

#### Scenario: Preferencia explícita gana al sistema

- **WHEN** el usuario elige `dark` y el SO está en claro
- **THEN** la app permanece en tema oscuro y la elección persiste tras
  recargar

### Requirement: Tokens semánticos por tema

El design system SHALL exponer tokens semánticos (`canvas`, `surface`,
`elevated`, `raised`, `ink`, `line`, `on-accent`) cuyos valores cambian
por tema vía variables CSS. Los literales `night-*` y `white/*` del
código migran a estos tokens. El tema oscuro MUST conservar los
valores visuales actuales (regresión visual cero en dark).

#### Scenario: Migración sin regresión en dark

- **WHEN** el tema resuelto es `dark`
- **THEN** canvas/surface/ink/line renderizan los mismos colores que
  hoy (#0a0a0f, #12121a, #ffffff, white/N)

#### Scenario: Tema claro legible

- **WHEN** el tema resuelto es `light`
- **THEN** fondos son claros, texto principal es oscuro, bordes y
  superficies conservan jerarquía, y el acento mantiene contraste ≥4.5:1
  en textos sobre acento

### Requirement: Control de tema accesible

La app SHALL ofrecer un control visible para elegir entre Sistema,
Claro y Oscuro, operable por teclado (radiogroup) y disponible en
mobile (drawer), desktop (sidebar) y páginas públicas (footer).

#### Scenario: Toggle en navegación

- **WHEN** un usuario autenticado abre el drawer (mobile) o ve el
  sidebar (desktop)
- **THEN** encuentra el control segmentado de tema en el footer y al
  cambiarlo la app re-renderiza en el tema elegido de inmediato

#### Scenario: Toggle en públicas

- **WHEN** un visitante está en una landing o página legal
- **THEN** el footer expone el mismo control de tema
