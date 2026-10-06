# Tasks - academy-bulk-import

- [x] `src/common/csv.ts`: `parseCsv` (BOM, comillas, `""`, \r\n) + spec.
- [x] `AcademyImportService`: `importStudents` (Person stub + invite
  email + Enrollment upsert con endsAt=max) e `importSchedule`
  (series upsert + slots dedup + materialización de clases del mes).
- [x] `AcademyImportController`: POST `/import/students` +
  `/import/schedule` (multipart, caps) + GET templates CSV.
- [x] Email de invitación a alumno importado (reusa magic token largo).
- [x] Web: `/academia/importar` (descargar plantilla, subir, reporte).
- [x] Tests: parser spec, service spec, e2e students (invite/dedup/plan
  error) + e2e schedule (series agrupada, dedup, día inválido).
- [x] Docs: `flows.md` (sección migración), `architecture.md` (endpoints).
- [x] Verificación: suite API, tsc web, i18n, openspec validate.
