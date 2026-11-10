# Proposal: academy-invite-first-polish

## Why

Decisión del owner: en `/academia/alumnos` la invitación es el embudo
de venta (la persona se registra, aterriza en la academia y compra su
plan) y el alta directa es solo liquidación administrativa del alumno
que ya pagó presencial. Hoy ambos caminos compiten con igual jerarquía
y el alta directa se lee como el camino principal. Además la página de
importación muestra los nombres de columnas pero no los valores
aceptados, y el seed demo deja vacíos el historial de corridas y la
sección de invitados.

## What Changes

- `/academia/alumnos`: "Invitar" pasa a ser el CTA principal; el alta
  directa baja a secundario y se renombra "Inscripción manual" (la
  clave `academy.newEnrollment` cambia de valor → también renombra el
  título del form de `/alumnos/nuevo`, coherente: es el mismo camino).
  Copy del tour de la página actualizado al orden nuevo.
- `/academia/configuracion/importar`: bajo los nombres de columnas,
  muestra de valores aceptados por columna (sexo `m/f/otro`,
  dia_semana nombres o `0-6`, hora `HH:MM`, fecha_nacimiento
  `DD/MM/YYYY`, mes `YYYY-MM`, estilo/nivel tal como están en la
  consola), antes de "Descargar plantilla".
- `enrich-academy-seed.cjs`: fixtures `AcademyImportRun` (corrida de
  students con counts/results representativos) y `AcademyInvite`
  pendientes para las academias demo, idempotentes.

## Capabilities

### Modified Capabilities

- `academies/student-invites`: la invitación se establece como camino
  principal de alta en consola; el alta manual queda como fallback
  etiquetado.
- `academies/bulk-import`: la página de importación muestra los
  valores aceptados por columna antes de la descarga de plantilla.
- `academy-demo-seed`: la demo siembra corridas de import e
  invitaciones pendientes.

## Impact

- `apps/web/src/components/academy/students-section.tsx`,
  `enrollment-form.tsx` (título vía clave renombrada),
  `import-section.tsx`.
- `apps/web/messages/{es-CL,en,fr,pt-PT}.json` (`newEnrollment`),
  `apps/web/src/i18n/parts/{,en/,fr/,pt-PT/}academyImport.json` y
  `tours.json`.
- `apps/api/scripts/enrich-academy-seed.cjs`.
- `docs/qa-flows-inventory.md` (flujo de alumnos).
