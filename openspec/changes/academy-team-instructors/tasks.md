# Tasks — academy-team-instructors

## 1. API

- [x] 1.1 `GET /academies/:id/instructors` (cap `team`): lista
  `{person, commissionPct, createdAt}` ordenada por alta.
- [x] 1.2 `POST /academies/:id/instructors` (cap `team` write):
  `{email, name?, commissionPct?}` — find-or-stub Person + invitación
  por magic link (TTL ≥72h) si no existe; upsert AcademyInstructor;
  guardas `owner_not_staff`/`cannot_modify_self`; valida comisión
  0–100.
- [x] 1.3 `DELETE /academies/:id/instructors/:personId` — 404 si no
  existe.
- [x] 1.4 `instructorInviteEmailHtml` en `invite-emails.ts`.
- [x] 1.5 Tests del controller (alta nueva/invitada, upsert, guardas,
  cap gate).

## 2. Web

- [x] 2.1 `InstructorSection` en `/academia/equipo`: lista con
  nombre/email, comisión editable (PATCH existente), quitar con
  confirmación.
- [x] 2.2 `staff-form.tsx`: selector de tipo Colaborador|Profesor —
  profesor muestra `commissionPct` y oculta caps; POST al endpoint
  correspondiente.
- [x] 2.3 i18n: keys nuevas en `academyStaff.json`; audit verde.

## 3. Integración

- [x] 3.1 `pnpm --filter @omnidance/api build` + tests del módulo.
- [x] 3.2 `pnpm --filter @omnidance/web exec tsc --noEmit` + i18n audit
  + `impeccable detect` sobre los archivos UI.
- [x] 3.3 Regenerar docs API (`export-api-docs.cjs`) + openspec
  validate.
