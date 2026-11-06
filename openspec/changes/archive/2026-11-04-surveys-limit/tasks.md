# Tasks

- [x] 1. `academies.controller.ts` `courseSurveys`: `@Query("limit")`
  + `@ApiQuery({ name: "limit", required: false })` + `slice(0,
  groupLimit)` (misma expresión que `instructorSurveys`); docstring
  actualizado.
- [x] 2. Spec del controller: caso `limit=2` capa grupos y default 12
  / max 60.
- [x] 3. Regenerar `docs/openapi.json` +
  `docs/postman/omni-dance.postman_collection.json` (script
  `export-api-docs.cjs`, API viva).
- [x] 4. Verificar: vitest del controller + `tsc --noEmit` api +
  `openspec validate --changes`.
