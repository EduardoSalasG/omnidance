# Handoff — 2026-10-08 (a): analytics-query-engine

## Estado

Implementado y commiteado en `dev` (4 commits, `def3907..7d0ba63`), sin push.
El change OpenSpec `analytics-query-engine` queda **sin archivar** a propósito:
falta QA manual del usuario (task 6.3). Al aprobarse: `openspec archive` +
release gate `dev → main` (sigue pendiente aprobación; dev acumula bastante).

## Qué se construyó

- **`/analitica`** = Dashboard (insights por lente, sin cambios de fondo) +
  **`/analitica/consultas`** = builder read-only: dataset → scope → presets/
  fechas → filtros → preview (50 filas + total) → CSV/PDF → guardar consulta.
- **Motor `/query` en API**: `catalog`, `options`, `run`, `export.csv|pdf`,
  CRUD `/query/saved`. Catálogo declarativo en
  `packages/shared/src/query-catalog.ts` (PRODUCER 7 entidades,
  ACADEMY_OWNER 6, ADMIN 13). `/admin/browse/:entity` y
  `/events/:id|series/:id/export.*` delegan en el registry — back-compat.
- **`SavedReport`** nueva tabla (migración `20261008000000_saved_report`,
  generada con `migrate diff` + `migrate deploy` porque `migrate dev` exige
  TTY). Plantillas de sistema = `SYSTEM_QUERIES` en shared, no en DB.
- **`ExportSection` eliminado** de `/productor/eventos/[id]`; sus reportes
  (ventas, check-in, guestlist) viven ahora en Consultas como datasets del
  lente productor.
- **Refactor de filtros** en todos los módulos de listas (academia:
  alumnos/asistencia/clases/cobros/particulares/planes/series/equipo/videos;
  productor: eventos/listas/pagos/comprobantes/codigos; admin:
  datos/usuarios/finanzas/auditoria/campanas/facturacion) — mismo `FilterBar`
  y mismos params del catálogo; módulos conservan acciones, analítica es
  solo lectura.

## Seguridad / authz

- Scoping por ownership por entidad (producer→eventos propios, academy→
  academias propias, admin→global); scope ajeno → resultado vacío, no 404.
- Lente PRODUCER en `/query/*` (catalog/options/run/export) exige Pro
  efectivo (`403 pro.required`); `/query/saved` solo exige rol aprobado.
- `SessionGuard` permite `POST /api/query/run` a cuentas demo (read-only,
  scopiado al actor).
- Sin exposición de ratings individuales, claimToken ni IDs internos.

## Evidencia de verificación (fresh)

- `pnpm --filter @omnidance/api build` → exit 0; `pnpm --filter @omnidance/api test` → **88 archivos / 1758 tests verdes**.
- `pnpm --filter @omnidance/web exec tsc --noEmit` → `TSC_OK`; build web (dev server detenido + `.next` borrado) → **80/80 páginas**, incluye `/analitica/consultas`.
- i18n audit → `ALL_KEYS_OK`; `openspec validate` → 1 passed.
- `export-api-docs.cjs` → openapi.json 259 paths + postman 259 requests (commiteados).
- `impeccable detect --json` sobre los 33 archivos web del diff → `[]`.
- Smoke sin sesión: `/query/catalog`, `/query/run`, `/query/saved` → 401.

## Pendiente para el usuario (QA)

- QA autenticado por lente en `/analitica/consultas`: selección de entidad,
  filtros, presets de fecha, opciones FK dependientes de scope, preview,
  CSV/PDF, ciclo guardar→seleccionar→renombrar→borrar, scope ajeno → vacío.
- Layouts 320/768/1024/1440.
- Seeded roles: productor Pro, academy owner, admin.

## Limitaciones conocidas

- **Filtro sexo/género de alumnos**: no implementado — `Person`/`Enrollment`
  no tienen un campo confiable. Decidir: modelar el campo (migración nueva)
  o documentar como no disponible.
- Filtros client-side (declarados): payouts en `/admin/finanzas`, campañas
  admin, búsqueda de texto en guest-lists productor.
- `VENUE_MANAGER`: dashboard sí, sin datasets en Consultas este slice.
- No hay smoke E2E autenticado real todavía (solo 401s y tests).

## Gotchas de entorno

- `git` no está en PATH del shell: usar `/c/Program Files/Git/cmd/git.exe` o
  `export PATH="$PATH:/c/Program Files/Git/cmd"`.
- Build web con dev server corriendo falla por colisión `.next` — parar dev,
  `rm -rf apps/web/.next`, build.
- `prisma migrate dev` no corre non-TTY en Windows — usar `migrate diff` +
  `migrate deploy`.
