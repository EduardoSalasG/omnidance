# Tasks; academia-gaps-cierre

- [x] 1. API: `setLevels` rechaza >1 `levelId` por `classTypeId` (400)
  y actualiza el spec del controller (caso multinivel → 400).
- [x] 2. API: `DELETE /academies/:id/class-levels` bulk con guard de
  uso (409 con nombres) + spec Vitest.
- [x] 3. Web: `/academia/niveles` botón "Volver a la línea global" con
  ConfirmSheet + i18n + manejo del 409.
- [x] 4. Web: `AcademyKpiCards` renderiza `extra` en estado skeleton;
  el caller pasa skeleton del MiniKpi "Reservas hoy"; conteo de
  skeletons = `keys?.length ?? 6`.
- [x] 5. Comentarios stale "multinivel" (editor, spec) actualizados a
  un nivel por tipo.
- [x] 6. Regenerar `docs/openapi.json` + postman; revisar
  `docs/qa-flows-inventory.md`.
- [x] 7. Correr E2E Playwright del home de academia (gap del handoff).
- [x] 8. Verificación: `pnpm typecheck`, `pnpm test`, `pnpm lint`.
