# Change: academy-videos-flag

## Why

La superficie de videos de academia (`/academia/videos*`) hoy es
permanente para academias PRO. La operación necesita un kill-switch:
poder apagar el módulo completo (lanzamiento controlado, negociación
comercial, contingencia) sin deploy, igual que el resto de superficies
apagables del catálogo de flags (`academy_explore`, `city_guides`,
`trip_planner`). El flag es adicional al gate de tier: con el flag OFF
ni PRO lo ve; con el flag ON aplica la regla `videos` del tier como
hoy.

## What Changes

- Flag nuevo `academy_videos` en `FEATURE_FLAG_SEED` (default ON:
  sin cambio de comportamiento al sembrar; el upsert por key no pisa
  `enabled` al re-sembrar).
- Gate de superficie en las tres páginas del módulo:
  `/academia/videos`, `/academia/videos/[id]` y `/academia/videos/nuevo`
  muestran el estado "módulo desactivado" cuando el flag está OFF
  (mismo patrón que `/admin/ciudades` y `/mi-viaje`; se evalúa antes
  del `AcademyTierGate`, así el flag OFF nunca muestra paywall).
- Hub `/academia`: la card "Videos" de `visibleHubModules` se oculta
  cuando el flag está OFF (parámetro `flags` nuevo; fail-closed igual
  que el mapa público `GET /features`).
- i18n: clave `videos.disabled` en `academyExtras` (es-CL + stubs
  en/fr/pt-PT).

## Capabilities

### Modified Capabilities

- `academies/videos`: las páginas del módulo y sus puntos de entrada
  (card del hub, ítem del sidebar del owner) pasan a estar gateadas
  por el flag `academy_videos`, además del gate de tier `videos`.

## Impact

- `apps/api/prisma/seed-common.ts`: entrada en `FEATURE_FLAG_SEED`.
  Requiere re-correr `pnpm db:seed` (idempotente) para crear la fila;
  mientras tanto fail-closed la deja oculta. Se togglea desde
  `/admin/funcionalidades` como el resto del catálogo.
- `apps/web/src/components/feature-flag-gate.tsx` (nuevo): gate
  compartido flag → skeleton / "desactivado" / children.
- `apps/web/src/app/[locale]/(app)/academia/videos/page.tsx`,
  `.../videos/[id]/page.tsx`, `.../videos/nuevo/page.tsx`: envoltura
  con el gate.
- `apps/web/src/lib/academy-modules.ts` + `academia/page.tsx`:
  `flags` en `visibleHubModules` y `flag` opcional por módulo.
- Tests: `apps/web/src/lib/academy-modules.test.ts`.
- Docs: `docs/qa-flows-inventory.md` (sección videos + catálogo de
  flags).

## Fuera de scope (integración pendiente del orquestador)

- `apps/web/src/components/layout/BottomNav.tsx`: el ítem
  `/academia/videos` del sidebar del owner (~línea 630) debe recibir
  `flag: "academy_videos"` (el componente ya soporta `flag` por ítem,
  igual que `city_guides`). Lo edita otro agente; este change deja la
  página y el hub gateados para que el deep link tampoco muestre el
  módulo aunque el nav aún lo enlace.

## Future work (anotado, no implementar)

- Reestructura del modelo de video: categoría (clase / taller /
  coreografía / material) con asociación opcional a clase; el form
  pasaría de "id de clase" a selects serie → horario → clase.
  Decisión de diseño a madurar (docs/academy-console-ux-review-
  2026-11-05.md, Slice F).
- Idea de producto: videos como add-on cobrado a alumnos; queda para
  revisión comercial.
- Gate server-side de `/academies/:id/videos*` (404 con flag OFF) si
  la operación lo requiere; hoy el gate es de superficie, coherente
  con `academy_explore`/`academy_line`.
