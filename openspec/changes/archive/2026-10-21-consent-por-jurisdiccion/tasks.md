# Tasks; consent-por-jurisdiccion

- [x] 1. Schema: `Person.jurisdiction`, `LegalText`, `ConsentRecord` +
  migración versionada (orquestador) + seed de textos (CL vigente del
  `/privacidad` actual, EU GDPR base con `draftNote`).
- [x] 2. Dominio/API: resolver jurisdicción por país (map EU/EEA→EU,
  else→CL) + `GET /legal/consent?country=` público (version+scopes+
  granular, fallback CL) + `POST /me/consent` extendido `{version,
  scopes?}` escribiendo `ConsentRecord` + `Person.jurisdiction` en
  register (campo `country` opcional) y editable en settings/perfil.
- [x] 3. Front: registro consulta `GET /legal/consent` por el país
  declarado (EU → checkboxes granulares; CL → checkbox único como
  hoy); `ConsentBanner` resuelve por jurisdicción del usuario y
  renderiza granular; i18n `es-CL` para todo string nuevo.
- [ ] 4. Specs vitest/playwright según superficie; `docs/architecture.md`,
  `docs/flows.md` si aplica, openapi/postman regen, qa-inventory;
  openspec validate + commit en `dev`.
