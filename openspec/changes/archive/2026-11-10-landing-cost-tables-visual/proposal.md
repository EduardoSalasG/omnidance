# Proposal: landing-cost-tables-visual

## Why

La sección "por cada $10.000" de las landings pro (`costTable` del
catálogo, en `/para-academias` y `/para-productores`) es una tabla de
texto plano: el argumento más concreto de la página (cuánto cuesta cada
medio de cobro y quién hace el trabajo) se presenta como un cuadro
denso. El owner pide hacerla visual. Además, en la landing de
productores la baja de fee por plan (Standard/Pro) es el argumento
fuerte y hoy vive escondida en la letra chica de la nota al pie.

## What Changes

- `/para-academias`, sección "Tu academia cobra sola": flujo de pasos
  del dinero (alumno paga → la plataforma ordena → la academia recibe)
  + cards por medio de cobro con el costo como dato primario y "quién
  hace el trabajo" como secundario. La tabla se reemplaza por cards.
- `/para-productores`, sección "Tu taquilla trabaja mientras produces":
  cards por medio de venta (mismo patrón) + banda destacada "con plan
  el fee baja" con los montos Standard/Pro por cada $10.000 como
  contenido principal, no como nota al pie.
- Catálogo i18n `costTable` (4 locales): nuevo `steps` (academy),
  `costNote` opcional por fila (sufijo del monto, ej. "+ tu pasarela"),
  `planFees` (producer) y `note` recortada a la letra chica real.
  Las claves `colMethod`/`colCost`/`colGain` salen del catálogo: la
  tabla deja de existir.
- Sin cambios de API ni de rutas: solo presentación del componente
  `Landing` y catálogo.

## Capabilities

### Modified Capabilities

- `landing-marketing`: la sección de comparación de costos deja de ser
  tabla de texto y pasa a cards + flujo de pasos (academy) + banda de
  fee por plan (producer).

## Impact

- `apps/web/src/components/landing/Landing.tsx` (renderer del bloque
  `costTable`).
- `apps/web/src/i18n/parts/{,en/,fr/,pt-PT/}landing.json`.
- Verificación: typecheck, lint, `node scripts/i18n-audit.cjs`,
  `impeccable detect`.
