# Tasks — academy-presale-commission

## 1. Datos

- [ ] 1.1 `AcademySaleAgreement` + `AcademySaleSettlement` + campos
  `Payment.soldByAcademyId`/`academyCommissionClp` en schema + `pnpm
  db:migrate` — verifica: migración aplicada

## 2. Dominio (TDD)

- [ ] 2.1 Servicio de acuerdos: create/accept/decline/disable/editPct con
  permisos (productor dueño del evento; academia solo responde los suyos)
  — verifica: spec unitaria
- [ ] 2.2 Checkout: `academyId` opcional, resolución evento↔serie,
  snapshot `academyCommissionClp`, solo PRESALE — verifica: spec
  checkout.service
- [ ] 2.3 Deuda computada + `mark-paid` con remanente — verifica: spec

## 3. Endpoints

- [ ] 3.1 `POST/GET /events/:id/academy-deals`, `PATCH
  /academy-deals/:id`, `GET /academies/:id/sale-deals`, `POST
  /academy-sale-settlements/:id/mark-paid` — permisos RBAC por permiso
  DB, nunca rol literal — verifica: controller specs

## 4. Front

- [ ] 4.1 Sección "Preventa por academias" en ficha de evento productor
  (console-patterns) + persistencia `?a=` → checkout — verifica: flujo
  E2E local
- [ ] 4.2 `/academia/preventas` — acuerdos, link copiable, ventas,
  comisión, estado — verifica: render + i18n ALL_KEYS_OK

## 5. Integración (orquestador)

- [ ] 5.1 `openspec validate --changes` + build + tests — output citado
- [ ] 5.2 openapi/postman regenerados; architecture.md + flows.md +
  omni-dance.md §10 actualizados — verifica: diff
