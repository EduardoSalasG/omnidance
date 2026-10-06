# Tasks - academy-operations-insights

- [x] `schema.prisma`: `Person.birthDate DateTime?` + `pnpm db:migrate`.
- [x] `seed-common.ts`: params `academy.insights.expiring_days` (14) y
  `academy.insights.birthday_days` (30). `seed-dev.ts`: birthDate demo
  en alumnos (fechas relativas a hoy para que el demo siempre muestre
  data).
- [x] `people.controller.ts`: `birthDate` en `UpdateMeDto` +
  validación en `updateMe` + exposición en `GET /me`.
- [x] `academies.controller.ts`: `GET /academies/public` antes de
  `@Get(":id")`; dashboard con `expiringEnrollments` +
  `upcomingBirthdays` (ventanas vía ParamsService).
- [x] `academy.service.ts`: `computeUpcomingBirthdays` puro (año
  ignorado, wrap dic→ene, dedupe por persona) + spec unitario.
- [x] Tests: people.controller.spec (birthDate ok/400/clear),
  academies.e2e (public shape, dashboard insights).
- [x] Web: `birthDate` en type Me + `perfil/datos` (input date +
  display); i18n profile.json.
- [x] `academy-dashboard.tsx`: listas por vencer + cumpleaños (link a
  ficha, render condicional); type en `shared`; i18n academy.
- [x] `lib/public-academies.ts` + Landing strip por variante academy +
  i18n landing.json (copy features con vencimientos/cumpleaños).
- [x] Actualizar delta de `split-pro-landings` (strip = academias).
- [x] Verificación: API tests, builds, i18n audit, openspec validate.
