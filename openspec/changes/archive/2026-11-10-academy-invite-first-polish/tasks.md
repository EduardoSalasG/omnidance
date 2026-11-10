# Tasks: academy-invite-first-polish

## 1. CTA invite-first en alumnos

- [x] 1.1 `students-section.tsx`: Invitar → botón primario; alta
      directa → `variant="secondary"`.
- [x] 1.2 `newEnrollment` → "Inscripción manual" en
      `messages/{es-CL,en,fr,pt-PT}.json`.
- [x] 1.3 Tour `academia-alumnos` s5: copy al orden nuevo (invitar
      como camino, manual como liquidación) en `tours.json` ×4.
- [x] 1.4 Revisar tests/e2e que matcheen "Nueva inscripción" u orden
      de botones.

## 2. Valores por columna en importar

- [x] 2.1 `academyImport.json` ×4: `studentsValues`/`scheduleValues`
      (arrays `{col, values}`).
- [x] 2.2 `import-section.tsx`: `<dl>` de valores bajo el párrafo de
      columnas, antes de "Descargar plantilla".

## 3. Seed fixtures

- [x] 3.1 `enrich-academy-seed.cjs`: 1 `AcademyImportRun` students por
      academia + 2 `AcademyInvite` pendientes, idempotentes por clave
      natural.
- [x] 3.2 `pnpm db:enrich` contra dev → corridas/invites creados;
      re-corrida → 0 nuevos.

## 4. Verificación y docs

- [x] 4.1 `node scripts/i18n-audit.cjs` → ALL_KEYS_OK; typecheck +
      lint; `page.test.tsx` de importar sigue verde.
- [x] 4.2 `impeccable detect --json` sobre los archivos UI tocados.
- [x] 4.3 `docs/qa-flows-inventory.md`: actualizar flujo de alumnos
      (CTA invite-first + inscripción manual) y nota de la página de
      importar.
