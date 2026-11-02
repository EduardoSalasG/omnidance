# danger-confirm-variant

## Why

El confirm "Sí, cancelar" de suscripción era `secondary` (gris), indistinguible del resto. ConfirmSheet ya pintaba su confirm en `bg-red-500` hardcodeado pero el patrón no existía como variante de `Button`.

## What Changes

- Nueva variante `danger` en `Button` (`bg-red-500 text-white hover:bg-red-400`, misma roja que ConfirmSheet).
- `ConfirmSheet` usa la variante (fuente única) en vez de className.
- Confirms inline destructivos pasan a `variant="danger"`: cancel suscripción bailarín (`subscription-manage`), cancel suscripción academia (`academy-billing`), delete segmento CRM, cancel rental (venue, confirm sigue primary).

## Capabilities

Cambio visual de convención destructiva; sin delta de spec (no altera comportamiento ni contratos).

## Tasks

- [x] Variante danger en Button
- [x] ConfirmSheet + confirms inline migrados
- [ ] typecheck web + lint
