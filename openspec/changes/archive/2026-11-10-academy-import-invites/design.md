# Design: academy-import-invites

## Decisiones (owner, sesión 2026-11-10)

- **(b) AcademyInvite en bulk**: el import no crea ni toca enrollments.
  La invitación es canal de adquisición: mail magic-link → registro →
  completa sus datos → aterriza en la ficha pública → compra su plan.
- Cuenta existente sin enrollment → segundo flujo ya definido: mail +
  push "te invitó" (idéntico al invite individual).
- `Enrollment` ACTIVE en la academia → fila `skipped`, sin mail.
- Enrollments ACTIVE con `planId` null existentes → `INACTIVE`
  (migración one-shot; reactivación legítima por toggle staff).
- Operación seria: dry-run obligatorio antes de importar, resumen del
  procesado, historial de corridas con detalle fila a fila.

## Arquitectura

### API

**`AcademyInvitesService` (nuevo, `academies/infrastructure/`)**:
extrae la lógica de `AcademyInvitesController.invite` (dedup por
pendiente, `invite.sent` activity, magic token 7d `next=/academias/:id`,
`academyInviteEmailHtml`, push a cuenta existente) como
`sendInvite(academy, {email, name, invitedById, dryRun?})` →
`{outcome: "invited"|"resent", personExists, sent}`. El controller
individual delega en él (mismo comportamiento, una sola fuente) y el
import lo consume por fila. Con `dryRun` no escribe ni envía: solo
clasifica (¿invite nuevo o reenvío? ¿cuenta existe?).

**`importStudents(academy, rows, {dryRun, fileName, invitedById})`**:
por fila: valida email/nombre → normaliza opcionales (rut, fecha,
sexo, teléfono con país de la academia) → dedup dentro del archivo
(segundo `email` repetido → `skipped` "duplicado en la planilla") →
resuelve Person (create stub / update campos presentes; en dry-run
solo predice) → skip si `Enrollment` ACTIVE en la academia (la fila
aún actualiza campos de Person en la corrida real - el roster sigue
sirviendo para sync de datos) → `sendInvite`.
Status por fila: `invited` | `resent` | `skipped` | `error`.
Respuesta: `{total, invited, resent, skipped, errors, results, runId}`.
`plan`/`pagado_hasta` se leen de la fila pero se ignoran (archivos del
template viejo siguen procesando).

**`AcademyImportRun`** (schema nuevo):

```prisma
model AcademyImportRun {
  id          String   @id @default(cuid())
  academy     Academy  @relation(fields: [academyId], references: [id])
  academyId   String
  kind        String   // "students" | "schedule"
  fileName    String?
  total       Int
  counts      Json     // {invited,resent,skipped,error} | {ok,warn,skipped,error}
  results     Json     // [{row,email?,serie?,status,detail}] (máx 500)
  createdById String
  createdAt   DateTime @default(now())
  @@index([academyId, createdAt])
}
```

`Academy.importRuns AcademyImportRun[]`.

**Endpoints**:
- `POST /academies/:id/import/students?dryRun=1` - misma tubería sin
  escrituras ni envíos; `runId:null`.
- `POST /academies/:id/import/schedule?dryRun=1` - idem (uniformidad;
  valida serie/día/horas/instructor sin crear nada).
- `GET /academies/:id/import/runs?take=50` - cap `students` (fallback
  `schedule`/`classes`, mismo criterio que scheduleTemplate).
- `GET /academies/:id/import/runs/:runId` - mismo gate + 404 si la
  corrida no es de la academia.
- `GET template/students` - headers
  `email,nombre,rut,fecha_nacimiento,telefono,sexo` (sin plan).

**Migración** `20261129000000_academy_import_invites`:
`CREATE TABLE "AcademyImportRun"` + `UPDATE "Enrollment" SET
status='INACTIVE' WHERE "planId" IS NULL AND status='ACTIVE'`.

### Web (`/academia/configuracion/importar`)

`ImportCard` pasa a flujo de 2 pasos (students y schedule por igual):

1. Elegir archivo → CTA **"Validar"** → POST `?dryRun=1` → panel de
   vista previa: chips de conteo + tabla fila/estado/detalle (misma
   tabla de resultados de hoy). Cualquier cambio de archivo invalida
   la validación.
2. CTA **"Importar"** (habilitado solo con dry-run fresco del mismo
   archivo) → POST real → panel de resultado final (misma tabla) +
   `ActionNotice` de éxito con conteo.

**Historial**: nueva card bajo las dos de import: lista de corridas
(fecha, badge kind, archivo, conteos) clickeable → ficha
`/academia/configuracion/importar/[runId]` con encabezado de la
corrida + tabla fila a fila (patrón consola lista→ficha;
`console-patterns`).

i18n: nuevas keys `academyImport.*` (validar, resumen, estados
`resent`/`skipped`, historial, detalle de corrida) en los 4 catálogos
+ verificación de paridad.

## Fuera de alcance

- Claim/settle posterior del alumno invitado (ya existe vía
  membership checkout + claims manuales).
- Edición/eliminación de corridas del historial (read-only).
- Import de horario no cambia semántica (solo dry-run + historial).

## Riesgos

- **Mail volume**: import de 500 filas → 500 correos. El mailer actual
  es secuencial por fila (mismo comportamiento que hoy); el import
  reporta `sent:false` por fila si falla sin abortar. Aceptable para
  el volumen real de academias.
- **Migración UPDATE masiva**: academias legítimas con plan-less
  ACTIVE pasan a INACTIVE. Recuperable por toggle (transición libre);
  se documenta en el handoff para ops.
- **Idempotencia dry-run vs commit**: entre validar e importar puede
  cambiar el mundo (alguien compra plan, invite se consume). Es
  best-effort UX, no garantía - el resumen final es el de verdad.
