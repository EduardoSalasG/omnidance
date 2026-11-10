# Handoff: academy-import-invites (API hecha, web+docs pendientes)

Sesión 2026-11-10 (tarde-noche). Decisiones del owner implementadas
en API; el frontend y docs quedan para la próxima sesión.

## Commits en dev

- `8f6c6c48` feat(academies): import de alumnos como canal de
  invitación bulk (API completa + change OpenSpec creado/validado).
- `ccef0ec8` fix(seo): canonical en /pase + sitemap solo con flags
  activos (review del export GSC omnidance.tech-Coverage-2026-11-10).

## Decisiones del owner (esta sesión)

- Modelo import = **(b) AcademyInvite en bulk**: invites son para
  personas NO registradas/sin enrollment; mail → registro → completa
  datos → ficha pública → compra plan. Cuenta existente sin
  enrollment → mail + push (segundo flujo ya definido). Ya tiene
  Enrollment ACTIVE → skip, sin mail.
- Enrollments ACTIVE sin plan (legacy/import) → **INACTIVE** por
  migración one-shot (aplicada a dev: `20261129000000`).
- UX pedida: **dry-run previo al CTA**, resumen del procesado, e
  **historial de corridas con detalle** fila a fila.
- El agujero `planId:null` = cuota UNLIMITED confirmado en código
  (`resolveQuota` classes.controller ~L247): era diseño
  "administrativa", cerrado para el futuro vía modelo invite.

## Implementado (API) - verificado

- `AcademyInvitesService` extraído (dedup pendiente, invite.sent,
  magic link 7d `next=/academias/:id`, push a cuenta existente,
  `dryRun` clasifica); `AcademyInvitesController` delega.
- `importStudents(academy, rows, {dryRun, createdById, fileName})` →
  `{total, invited, resent, skipped, errors, results, runId}`. Status
  por fila: `invited|resent|skipped|error`. Person update aplica
  también en filas skipped (roster sigue sync). plan/pagado_hasta
  ignorados. NUNCA escribe Enrollment.
- `importSchedule` idem con `{total, ok, warn, errors, results,
  runId}`; dryRun sin escrituras/materialización/push.
- `AcademyImportRun` (kind, fileName, total, counts Json, results
  Json, createdById) + `GET /:id/import/runs` +
  `GET /:id/import/runs/:runId` (cap `students`).
- Template students sin plan: `email,nombre,rut,fecha_nacimiento,
  telefono,sexo`.
- `studentInviteEmailHtml`/`sendStudentInvite` eliminados; mails usan
  `academyInviteEmailHtml`.
- Tests: 44 verdes (6 invites svc + 22 import svc + 5 invites ctrl +
  11 e2e con dryRun/historial/skip). `tsc --noEmit` limpio.

## Pendiente para la próxima sesión

1. **Web**: `ImportCard` flujo Validar (`?dryRun=1` → preview
   tabla+conteos) → Importar → resumen final + ActionNotice
   (invalidar validación al cambiar archivo). Card "Historial" en
   `/academia/configuracion/importar` (lista de runs:
   fecha+kind+archivo+conteos, clickeable → ficha
   `.../importar/[runId]` con tabla fila a fila; patrón consola,
   invocar `console-patterns` + `impeccable`/`ui-ux-principles`).
   Estados nuevos a traducir: invited/resent/skipped + copy "importar
   invitaciones" + sección historial + detalle. i18n 4 catálogos,
   paridad 0 drift (hoy `academyImport.status.*` cubre
   imported/updated/warn/error - agregar resent/skipped y revisar
   status obsoletos). OJO: el ImportCard viejo sigue funcionando
   (results sigue en el response) pero muestra copy viejo.
2. **Docs**: `omni-dance.md` fila Alumnos (import=invitación bulk,
   sin plan/pagado_hasta), `qa-flows-inventory.md` §importar,
   `flows.md`/`architecture.md` si aplica; `node
   apps/api/scripts/export-api-docs.cjs` con API viva → openapi.json
   + postman.
3. **Verificación final**: `pnpm typecheck` + `pnpm test` +
   `pnpm lint` completos; `pnpm db:seed` idempotente; **archivar**
   `openspec archive academy-import-invites` (deltas a
   bulk-import/student-invites/enrollment-model; revisar lock stale
   de archive si aparece).
4. **Web typecheck del fix SEO** (`ccef0ec8`) no corridó aún - cubre
   en la verificación global.

## Operativo

- Migración `20261129000000_academy_import_invites` APLICADA a dev
  (CREATE TABLE + UPDATE enrollments sin plan → INACTIVE). Generada
  por `migrate diff` + `migrate deploy` (migrate dev es interactivo
  y falla en shell no-PTY de Windows).
- API dev vieja (:4000, `node dist/main.js` PID 26916) se mató para
  liberar el DLL del prisma client al regenerar - levantar de nuevo
  con build fresco cuando toque.
- Postgres/Redis healthy (`docker compose ps`).
- Prod: la misma migración correrá en prod con el deploy - revisar
  cuántos enrollments ACTIVE sin plan quedan afectados (auditar antes
  si hay legítimos).

## Pendientes generales (sin cambio)

- multipais-foundation tasks 10/11/13 (slices grandes sin abrir).
- Migración legacy→BYO en prod (ops: dry-run → scoped → global).
- Smoke manual BYO/MP con humano (init_point hosted → retorno →
  ACTIVE).
