# Tasks: academy-import-invites

## 1. Datos

- [x] 1.1 Schema `AcademyImportRun` + `Academy.importRuns`;
      `pnpm db:migrate` (versión `20261129000000_academy_import_invites`)
      con `CREATE TABLE` + `UPDATE Enrollment SET status='INACTIVE'
      WHERE planId IS NULL AND status='ACTIVE'`; aplicar a dev.

## 2. API - invite compartido + import

- [x] 2.1 `AcademyInvitesService.sendInvite()` extraído del controller
      (dedup pendiente, activity, magic token + mail, push existente,
      `dryRun` clasifica sin escribir); controller individual delega.
- [x] 2.2 `importStudents` reescrito a invites: statuses
      `invited|resent|skipped|error`, skip por `Enrollment` ACTIVE,
      dedup email dentro del archivo, `plan`/`pagado_hasta` ignorados,
      sin escritura de `Enrollment`, persiste `AcademyImportRun`,
      retorna `{total, invited, resent, skipped, errors, results,
      runId}`.
- [x] 2.3 `?dryRun=1` en ambos endpoints (students + schedule);
      schedule persiste `AcademyImportRun` en corrida real.
- [x] 2.4 `GET /:id/import/runs` + `GET /:id/import/runs/:runId`
      (cap students|schedule|classes; 404 cross-academy).
- [x] 2.5 Template students sin `plan`/`pagado_hasta`;
      `studentInviteEmailHtml` queda sin uso (eliminar si aplica).

## 3. Web

- [x] 3.1 `ImportCard` flujo Validar → preview → Importar → resumen
      (students + schedule); invalidación al cambiar archivo.
- [x] 3.2 Historial de corridas en `/academia/configuracion/importar`
      + ficha `/academia/configuracion/importar/[runId]` con detalle
      fila a fila (patrón consola).
- [x] 3.3 i18n `academyImport.*` en los 4 catálogos + paridad 0 drift.

## 4. Tests

- [x] 4.1 `academy-import.service.spec.ts` reescrito: invite nuevo,
      cuenta existente (push), skip ACTIVE, resent pendiente, dup en
      archivo, campos opcionales, dry-run sin escrituras, run
      persistido.
- [x] 4.2 e2e `academy-import.e2e.spec.ts`: dry-run → commit → run en
      historial; template nuevo; schedule dry-run.
- [x] 4.3 Migración verificada contra dev: enrollments sin plan
      quedan INACTIVE; `pnpm db:seed` idempotente OK.

## 5. Docs + cierre

- [x] 5.1 `omni-dance.md` fila Alumnos + flujo invite;
      `qa-flows-inventory.md` §importar; `flows.md`/`architecture.md`
      si aplica.
- [x] 5.2 Regenerar `docs/openapi.json` + postman (API viva).
- [x] 5.3 `pnpm typecheck` + `pnpm test` + `pnpm lint` verdes;
      archivar change; commit.
