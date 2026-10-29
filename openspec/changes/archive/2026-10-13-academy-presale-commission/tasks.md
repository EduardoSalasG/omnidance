# Tasks; academy-presale-commission

## 1. Datos

- [x] 1.1 `AcademySaleAgreement` + `AcademySaleSettlement` + campos
  `Payment.soldByAcademyId`/`academyCommissionClp` en schema + `pnpm
  db:migrate`; verifica: migración `20261103000000_academy_sale_deals`
  aplicada al Postgres Docker

## 2. Dominio (TDD)

- [x] 2.1 Servicio de acuerdos: create/accept/decline/disable/editPct con
  permisos (productor dueño del evento; academia solo responde los suyos)
 ; verifica: `academy-sales.service.spec.ts` (16 tests)
- [x] 2.2 Checkout: `academyId` opcional, resolución evento↔serie,
  snapshot `academyCommissionClp`, solo PRESALE; verifica: spec
  checkout.service (5 tests nuevos de atribución)
- [x] 2.3 Deuda computada + `mark-paid` con remanente; verifica: spec
  (`markPaid materializa…`, `deuda = comisión PAID − marcas`)

## 3. Endpoints

- [x] 3.1 `POST/GET /events/:id/academy-deals`, `PATCH
  /academy-deals/:id`, `GET /academies/:id/sale-deals`, `POST
  /academy-deals/:id/mark-paid`; permisos por owner + `admin.access`
  DB-driven y capacidad `payments` de AcademyAccess; verifica:
  `academy-sales.controller.spec.ts`

## 4. Front

- [x] 4.1 Sección "Preventa por academias" en ficha de evento productor
  (console-patterns: CTA → `/academias/nueva`, card → ficha, destructivo
  en zona roja) + persistencia `?a=` en sessionStorage → checkout
- [x] 4.2 `/academia/preventas` + ficha; acuerdos, link copiable,
  ventas, comisión, estado; verifica: `tsc --noEmit` + i18n
  `ALL_KEYS_OK`

## 5. Integración (orquestador)

- [ ] 5.1 `openspec validate --changes` + build + tests; output citado
- [ ] 5.2 openapi/postman regenerados; architecture.md + flows.md +
  omni-dance.md §10 actualizados; verifica: diff
