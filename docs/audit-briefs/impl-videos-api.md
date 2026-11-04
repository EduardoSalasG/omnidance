# Brief: impl-videos-api (PATCH + GET-by-id de videos)

Lee `docs/audit-briefs/_impl-common.md`. Scope exclusivo backend:
`apps/api/src/academies/**` (controller/service donde viven los
endpoints de videos — ubícalos con grep `videos`).

La ficha `/academia/videos/[id]` (web, ya existe) necesita:

- `PATCH /academies/:id/videos/:videoId` — mismo gate que POST
  (`requireCapabilityWrite("schedule","videos")` o el que use el
  POST/DELETE existente); body: title?, url?, classId?,
  restrictedToAttended? (mismas validaciones del create: url externa,
  classId pertenece a la academia → 404 si no). Devuelve el video.
- `GET /academies/:id/videos/:videoId` — detalle para la ficha
  (mismo gate de lectura del listado; respeta la máscara `locked`
  para no-staff como hace el list).
- Spec/tests: caso happy + 404 classId ajeno + 403 sin cap, siguiendo
  el patrón de specs vecinos del módulo.
- `@ApiQuery`/dto decorators según convención del controller.

Verificación: `cd apps/api && npx tsc --noEmit` + vitest del archivo
spec tocado. NO git. Regenerar docs API NO es tu tarea (la hace el
orquestador). Reporta endpoints añadidos + shape.
