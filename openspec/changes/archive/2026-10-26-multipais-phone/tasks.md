# Tasks — multipais-phone

- [ ] 1. Dep `libphonenumber-js` en `packages/shared` (y `apps/web` si
      se consume directo); helper `normalizePhone(raw, defaultCountry)`
      en shared con tipo de error propio + tests de la matriz de
      formatos (CL nacional, E.164, `+` override, inválidos, vacío).
- [ ] 2. Migración de datos: backfill `phoneCountryCode='CL'` y
      normalización E.164 de `phone` existentes; pre-check de
      duplicados post-normalización (los que colisionen quedan
      intactos + reportados). NOTA: el `db:migrate` lo corre el
      orquestador; el implementador escribe el SQL.
- [ ] 3. API — people: `PATCH /me` y `POST /me/complete-profile`
      aceptan `phoneCountryCode`, normalizan a E.164, 409
      `phone_exists` sobre E.164; `GET /me` expone
      `phoneCountryCode`.
- [ ] 4. API — door-sale: DTO gana `phoneCountryCode?`; defaultCountry
      = país del venue del evento (null→CL); `findPersonByPhone` y
      `createLightPerson` operan sobre E.164.
- [ ] 5. API — leads: `POST /leads` acepta `phoneCountryCode`,
      normaliza `lead.phone`; convertLead hereda.
- [ ] 6. API — import CSV: columna `telefono` normalizada con país de
      la academia; fila inválida = error de fila.
- [ ] 7. Web — `PhoneInput` (selector de país + número nacional, o
      modo contexto): `/perfil/datos`, `/perfil/completar`,
      `/bienvenida` con selector; door-sale staff y `ProLeadForm` con
      default de contexto + override `+`. Keys i18n en parts existentes
      (no crear parts nuevos ni tocar `catalogs/*.ts`).
- [ ] 8. Specs vitest por write path + specs del helper.
- [ ] 9. Docs: `docs/architecture.md` (sección people/checkins),
      flujos QA — NOTA: `qa-flows-inventory.md` lo integra el
      orquestador; reportar flujos tocados al final del brief.
