# Change: academy-explore-flag

## Why

La operación puede requerir apagar el descubrimiento de academias en
cualquier momento (negociación con un cliente que no quiere que sus
alumnos vean la competencia, lanzamiento controlado, contingencia).
Hoy los scopes "explorar" de /academias y /clases son permanentes:
apagarlos exigiría un deploy bajo presión. Un flag global en el
catálogo existente da un kill-switch operable desde /admin/funcionalidades
en segundos, siguiendo el patrón de `academy_line`/`city_landing`.

## What Changes

- Flag nuevo `academy_explore` en `FEATURE_FLAG_SEED` (default ON:
  sin cambio de comportamiento al sembrar).
- Gating front de los scopes explorar:
  - `/academias`: con el flag OFF se oculta la pill "Explorar", la
    búsqueda y los CTAs que apuntan a explorar; `?s=explorar` y
    `v=explorar` legado normalizan a `mias`. El scope default de un
    bailarín sin inscripciones pasa a `mias`.
  - `/clases`: con el flag OFF se oculta la pill "Explorar", el
    filtro de academia y los CTAs a explorar; `s=explorar` y
    `view=explore` legado normalizan a `mias`.
  - Ficha `/academias/[id]`: se oculta el link "Explorar más clases"
    cuando el flag está OFF.
- Fuera de scope: gating server-side de `/academies`, `/classes/browse`
  o fichas (`/academias/[id]`, `/clases/[id]` siguen vivas por link
  directo - es la vía de reclutamiento de cada academia); landing de
  marketing; muro por academia (evaluación comercial diferida).

## Capabilities

### Modified Capabilities

- `academy-learner`: los scopes explorar de /academias y /clases pasan
  a estar gateados por el flag `academy_explore` (OFF → scope oculto,
  deep links normalizan a mias, fichas intactas).

## Impact

- `apps/api/prisma/seed-common.ts`: entrada en `FEATURE_FLAG_SEED`
  (upsert por key, no pisa `enabled` al re-sembrar).
- `apps/web/src/app/[locale]/(app)/academias/page.tsx`,
  `apps/web/src/app/[locale]/(app)/clases/page.tsx`,
  `apps/web/src/app/[locale]/(app)/academias/[id]/page.tsx`:
  `useFeatures()` + gating del scope explorar.
- i18n `es-CL`: copy de empty state sin invitación a explorar cuando
  el flag está OFF (reuso de claves existentes o una nueva).
- Tests: componente (scope/pills gated) + `docs/qa-flows-inventory.md`.
