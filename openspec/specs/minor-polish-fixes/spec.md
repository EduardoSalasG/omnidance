# minor-polish-fixes Specification

## Purpose
Lote de polish menor: copy de error honesto en HomeHub (5xx ≠ sesión expirada), glyphs reemplazados por átomos `ui/icons` en consolas no-dancer, y género editable en el lente academia.

## Requirements

### Requirement: Error honesto por causa en el hub

El estado de error del hub (`/inicio`) SHALL distinguir fallo de sesión
(401/403) de error de servidor/red (5xx/timeout): la sesión muestra el
aviso de reingreso y el error técnico muestra un mensaje genérico con
control de reintento que re-ejecuta la carga.

#### Scenario: 5xx con retry

- **WHEN** `/api/home` responde 500
- **THEN** se muestra error genérico con "Reintentar" que vuelve a
  llamar al endpoint - nunca "Tu sesión expiró".

### Requirement: Iconografía consistente

Las superficies producer, CRM, admin y landing SHALL usar el átomo de
iconos SVG compartido en lugar de caracteres Unicode usados como icono.

#### Scenario: sin glyphs residuales

- **WHEN** se audita el diff
- **THEN** ningún `→ ↻ ✓ ✕ ★` renderiza como icono en esas superficies.

### Requirement: Género editable en cualquier lente del perfil

El campo género de `/perfil/datos` SHALL ser editable sin importar el
modo (social/academia) del perfil.

#### Scenario: editar en modo academia

- **WHEN** el usuario con lente academia abre sus datos
- **THEN** puede elegir y guardar su género igual que en modo social.
