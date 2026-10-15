# Handoff — 2026-10-15

## Completado esta sesión

### Limpieza de código muerto y dependencias (refactor interno, sin cambio de comportamiento — OpenSpec omitido)

Análisis con codebase-memory-mcp (índice fresco, coverage limpio) + knip 5.88 sobre el monorepo completo, con clasificación manual de cada hallazgo antes de tocar nada.

- **Archivos eliminados**: `apps/api/scripts/.tmp-smoke-planedit.cjs` (smoke temporal olvidado), `apps/web/src/components/social/types.ts` (resto del change archivado `remove-social-blocks-invites`), `apps/web/src/components/ui/BackLink.tsx` (componente sin ningún uso).
- **Declaraciones muertas eliminadas**: `ACADEMY_CAPABILITIES` (academy.service), `countThisWeek` (public-events), `useResolvedTheme` (theme), tipo `WaitlistStatus` (social.service), `AttendanceItem` (academy/shared), `UserRow` (admin/types).
- **Exports sin consumidor**: ~200 exports/tipos que nadie importaba pasaron a ser internos (se les quitó `export`) o se sacaron del barrel `ui/index.ts` y de re-exports sueltos (`export { MAILER, AUTH_REPO }` en auth.module). 17 tipos que SÍ deben seguir exportados por declaration emit (TS4053 — son tipos de retorno de métodos públicos de servicios usados por controllers) quedaron exportados a propósito; knip los seguirá listando como "unused exported types" y es esperado.
- **Dependencias**: `pg` removido del `package.json` raíz (nadie lo importaba); `@nestjs/schematics` agregado como devDependency explícita de la api (estaba referenciado en `nest-cli.json` pero solo llegaba transitivo de `@nestjs/cli` — phantom dep). `@types/multer` se mantiene: knip lo marca unused pero el código usa `Express.Multer.File` (namespace global).
- **Archivos "unused" que se quedan a propósito**: scripts standalone documentados (`smoke-*.cjs`, `export-api-docs.cjs`, `seed-counts.ts`, `i18n-audit.cjs`, `contrast-check.cjs`, `codemod-theme.cjs`, `gen-favicon.mjs`, `generate-icons.mjs`) y `apps/web/public/sw.js` (service worker servido estático — falso positivo de knip).

## Evidencia

- `tsc --noEmit` api: 0 errores. `tsc --noEmit` web: 0 errores.
- `pnpm -r run test`: api 97 archivos / 1902 tests verdes; web 1 archivo verde.
- knip post-limpieza: 0 unused deps, 0 unresolved, solo los 17 tipos TS4053 esperados y los scripts standalone intencionales.
- Diff: 91 archivos, +183/-472 líneas.

## Notas / pendientes

- `brag-output/` está sin trackear (artefacto generado del skill brag) — evaluar si va a `.gitignore` o se borra.
- Si se quiere automatizar la prevención de regresión: `pnpm dlx knip` puede correrse en CI; habría que agregar `knip.json` marcando como entry los scripts standalone para que el reporte quede en cero.
- No se tocó comportamiento: solo remoción de exports sin importadores, archivos sin referencias y una dependencia sin uso.

## Próximo slice sugerido

- Sigue lo del handoff anterior: QA manual del flujo de preventa de academia, o pendientes de gamificación §7 / social §8.
