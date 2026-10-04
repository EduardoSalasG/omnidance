# Tasks — role-console-polish

## 1. Schema

- [x] 1.1 `AcademyInstructor.commissionPct Int?` + migración versionada.

## 2. API (TDD)

- [x] 2.1 Tests rojos: `PATCH :id/instructors/:personId` (owner 200,
  instructor no-owner 403, instructor inexistente 404, rango 400);
  `request()` snapshot de commissionPct; `mine?as=instructor` con
  commissionClp/netClp y `mine` student sin campos de comisión;
  `GET /academies/:id` expone commissionPct, `/profile` no.
- [x] 2.2 Implementar PATCH + snapshot + campos calculados.

## 3. UI

- [x] 3.1 `PrivateLessons`: sección "Mis clases como instructor"
  (fetch `as=instructor`, solo si hay filas) con neto por clase y total
  del mes (CONFIRMED/DONE).
- [x] 3.2 `AcademySettings` (o subsección): lista de instructores con
  commissionPct editable (owner/admin).
- [x] 3.3 i18n `parts/academyExtras.json` (y `academy` si aplica).

## 4. Cierre

- [x] 4.1 Specs verdes + `tsc --noEmit` api/web + build.
- [x] 4.2 `openspec validate --strict`; regen openapi/postman; docs;
  handoff.
