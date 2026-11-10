# Proposal: academy-import-invites

## Why

El import masivo de alumnos crea `Enrollment.ACTIVE` siempre, incluso
sin plan: `planId:null` resuelve cuota UNLIMITED y `endsAt:null` nunca
vence, así una fila de Excel regala clases ilimitadas gratis y cuenta
como alumno vigente en KPIs/tier/sociales. El modelo del owner es que
el import sea un canal de **invitación** (el patrón `AcademyInvite`
individual ya existe): la academia invita, la persona se registra o
entra por su cuenta, aterriza en la ficha pública de la academia y
**compra su plan** - el enrollment nace de una compra/claim real, no
de una planilla. Además los enrollments ACTIVE sin plan ya creados
(legacy/import) mantienen ese agujero: se migran a `INACTIVE`.

El owner también pide operación seria del import: **validación previa
de la planilla** antes del CTA, **resumen del procesado** al terminar,
e **historial de corridas con detalle** fila a fila.

## What Changes

- `POST /academies/:id/import/students` deja de escribir `Enrollment`
  (ni create ni update). **BREAKING**: el resultado por fila cambia de
  `imported/updated/invited` a `invited/resent/skipped/error` según el
  caso; `plan`/`pagado_hasta` se eliminan del contrato y del template
  (un archivo que las traiga se procesa igual y se ignoran).
- Por fila válida: Person stub se crea/actualiza con los campos
  presentes (email, nombre, rut/dni, fecha_nacimiento, sexo, telefono
  - se conserva el aporte de `academy-import-slim-fields`) y se aplica
  el patrón invite existente: `AcademyInvite` pendiente idempotente
  por `(academyId,email)`, mail magic-link 7d con `next=/academias/:id`
  + push si la cuenta ya existe, Referral INVITE al consumir.
- Skip: email con `Enrollment` ACTIVE en la academia → fila `skipped`
  sin mail ni cambios (ya es alumno vigente). Con enrollment INACTIVE
  o sin enrollment → invite normal.
- **Validación previa**: el endpoint acepta `?dryRun=1` (misma
  tubería, sin escrituras ni envíos) y devuelve el resultado previsto
  por fila; el front exige validar antes de habilitar "Importar".
- **Resumen e historial**: cada corrida real persiste
  `AcademyImportRun` (academyId, kind, fileName, conteos, results por
  fila, createdById, createdAt). `GET /academies/:id/import/runs` +
  `GET /academies/:id/import/runs/:runId` (cap `students`) listan el
  historial y el detalle fila a fila. Aplica a ambos kinds
  (students/schedule): el historial registra todas las corridas.
- Migración versionada: `Enrollment` con `status=ACTIVE AND planId IS
  NULL` → `INACTIVE` (dejan de reservar ilimitado y de contar como
  vigentes; el staff puede reactivar manualmente los legítimos).
- Fix colateral absorbido por el nuevo modelo: re-import sin plan ya
  no puede borrar `planId` (el import ya no toca enrollments) y el
  `findFirst` sin filtro de status desaparece con la escritura.
- Front `/academia/configuracion/importar`: flujo validar → resumen
  previo → confirmar → resultado; nueva sección historial (lista de
  corridas → detalle); copy "importar invitaciones"; template sin
  columnas de plan.

## Capabilities

### New Capabilities

(sin capacidades nuevas)

### Modified Capabilities

- `academies/bulk-import`: el requirement "Import masivo de alumnos"
  cambia de crear/actualizar enrollments a crear invitaciones bulk con
  el patrón AcademyInvite; template sin `plan`/`pagado_hasta`; se
  agregan requirements de dry-run, resumen e historial de corridas.
- `academies/student-invites`: se agrega el canal bulk (el import es
  fuente de invites además del alta individual) y el skip por
  enrollment ACTIVE.
- `academies/enrollment-model`: se agrega la regla de saneamiento
  "sin plan → no vigente" y la migración one-shot ACTIVE sin plan →
  INACTIVE.

## Impact

- API: `academy-import.service.ts` (importStudents, dry-run, persistir
  run), `academy-import.controller.ts` (template, endpoints
  `?dryRun=1`, `GET import/runs`, `GET import/runs/:runId`),
  reuse/extracción de la lógica de invite de
  `academy-invites.controller.ts`, migración Prisma nueva
  (`AcademyImportRun` + UPDATE enrollments sin plan).
- Web: `import-section.tsx` → flujo validar/confirmar/resumen +
  historial con detalle (patrón consola: lista → ficha), catálogos
  i18n.
- Datos: `UPDATE Enrollment SET status='INACTIVE' WHERE planId IS
  NULL AND status='ACTIVE'` - irreversible como UPDATE masivo pero
  recuperable por toggle manual staff (la transición es libre).
- Docs: `omni-dance.md` (fila Alumnos), `qa-flows-inventory.md`,
  `flows.md`, `architecture.md`, `openapi.json`/postman regenerados
  (endpoints y response shapes nuevos).
- Tests: `academy-import.service.spec.ts` reescrito al nuevo contrato
  + e2e `academy-import.e2e.spec.ts` (dry-run, commit, skip ACTIVE,
  historial).
