# Proposal — minor-polish-fixes

## Why

Restos menores registrados tras la auditoría DANCER/ALUMNO y el
feature de perfil de baile — copys incorrectos, glyphs residuales en
consolas no-dancer y un campo de perfil solo editable en un lente.

## What Changes

- **HomeHub `/inicio`**: el estado de error muestra "Tu sesión expiró"
  también cuando la causa es un 5xx/red — copy honesto por tipo de
  error (auth → sesión expirada; otro → error genérico) + retry.
- **Glyphs → SVG**: restos de `→ ↻ ✓ ✕ ★` usados como icono en
  superficies producer / CRM / admin / landing → átomo
  `components/ui/icons` (mismo patrón aplicado en F5b a la superficie
  dancer).
- **Género del perfil**: hoy editable solo en modo social de
  `/perfil/datos` — hacerlo editable también en modo academia (o
  trasladarlo a la sección común si el lente lo permite).
