# Handoff: release 1.17.0 + smokes BYO end-to-end VERDES

Sesión 2026-11-10 (tarde-noche). Se cerró el ciclo BYO: smokes manuales
MP + Flow en dev con retorno real, versionado 1.17.0 y promoción
dev→main en curso al cierre de este doc.

## Commits en dev (pusheados)

- `35de2ea8` test(scripts): smokes BYO e2e - mp init_point hosted
  con verify/cleanup y flow card-register por cuenta propia.
- `5e43cfdd` release: 1.17.0 (+ tag `v1.17.0`).

PR #3 dev→main creado; merge pendiente de checks (auto-merge no
habilitado en el repo - mergear manual cuando `gh pr checks 3`
esté verde).

## Smoke MercadoPago BYO - VERIFICADO

Receta final (la doc MP no la cuenta entera, esto salió de prueba y
error + doc oficial):

- **Collector y payer deben ser AMBOS real o AMBOS test user**
  ("Both payer and collector must be real or test users"). El
  `MP_SMOKE_ACCESS_TOKEN` original era de una cuenta REAL
  (`salas.eduardo.cl@gmail.com`) → un payer test user daba 400 al
  crear el preapproval, y un mail real (aunque sea cuenta MP propia
  del usuario) chocaba con el motor de riesgo / payer=collector.
- Solución: crear test user VENDEDOR vía `POST /users/test_user`
  (site_id MLC), loguearse en MP Developers como ese usuario y sacar
  SU Access Token (APP_USR-...3819790474). Ese token va en
  `MP_SMOKE_ACCESS_TOKEN` de `apps/api/.env` (ya actualizado, no se
  commitea).
- Payer = test user comprador `test_user_2720115583905910672@testuser.com`
  (pass `Xp38VuddGR`), creado igual. Persona local creada con ese
  email (id `cmwaz2umo0000sdjw5vjzhhay`).
- Bajo collector test, `v1/customers` SÍ acepta email @testuser.com
  (bajo real da "invalid domain user email"). MP jamás permite
  editar email de customer.
- `back_url` exige URL pública válida (localhost da 400). El
  devtunnel `hvr4lkk3-4000.brs.devtunnels.ms` está VIVO otra vez y
  la API corre con `API_URL` apuntando a él (ngrok quedó descartado;
  el interstitial de ngrok-free además molesta el redirect).
- Si el pago es rechazado, el preapproval entero queda `cancelled`
  (no reintentable, hay que crear otro).
- Resultado: sub `cmwazp24900ipuoap7467e0oz` ACTIVE, remoteId
  `f2ac8a96ce0e4044b0f46031d73ef9f3` authorized, Payment
  `mem_..._7033853931` PAID MERCADOPAGO, Enrollment ACTIVE,
  nextInvoice 2026-12-10.

## Smoke Flow BYO - VERIFICADO

- Cuenta FLOW de Academia Tumbao con las keys sandbox del `.env`
  RAÍZ (`FLOW_API_KEY`/`FLOW_SECRET_KEY`, `FLOW_BASE_URL` sandbox
  default).
- Script nuevo `smoke-flow-byo-subscription.cjs` (setup/--person/
  --verify).
- Ojo: personas que ya tienen customer Flow en ESE commerce dan
  "There is a customer with this externalId" (salas.eduardo03@ gmail
  y @outlook ya estaban); `salas.eduardo.backup@gmail.com` estaba
  limpia. `ensureFlowCustomer` no tolera duplicado remoto - edge
  case solo si se comparte un commerce (sandbox).
- Resultado: sub `cmwazwh4u000wxq5sjiccrbwe` ACTIVE, remoteId
  `sus_f44e032f52`, Payment `mem_..._1244968` PAID FLOW, nextInvoice
  2026-12-10.

## Estado de cuentas BYO en dev (Academia Tumbao)

La última PUT deja FLOW como ACTIVE (los PUT rotan: la MP test quedó
DISABLED). Re-sembrar con `pnpm db:enrich`/`seed` si se quiere MP.

## Operativo

- API dev corre `node dist/main.js` con `API_URL=https://hvr4lkk3-4000.brs.devtunnels.ms`
  (necesario para back_url/urlReturn públicos; sin eso MP/Flow
  rechazan localhost). Log: `apps/api/api-smoke.log`.
- Devtunnel activo; ngrok matado.
- El smoke MP deja una Person `test_user_...@testuser.com` y subs
  ACTIVE de prueba en dev DB - inofensivo, limpiable con los
  `* Test` del enrich.

## Pendiente tras el merge (post-deploy)

1. Health gate ya lo hace el workflow; verificar además
   `curl https://api.omnidance.eduardosalasg.dev/api/health`.
2. `POST /api/admin/subscriptions/migrate-legacy` con sesión admin:
   prod solo tiene seed → dry-run debe dar `scanned` ~0 (es
   verificación del endpoint, no migración real).
3. Migraciones que corren solas en el deploy:
   `20261126000000_enrollment_plan_simplify`,
   `20261127000000_academy_byo_collections`,
   `20261128000000_academy_import_national_id`,
   `20261129000000_academy_import_invites` (esta última pasa
   Enrollment ACTIVE sin planId → INACTIVE; en prod no hay data
   real, impacto nulo).

## Pendientes generales (sin cambio)

- multipais-foundation tasks 10/11/13 (slices grandes sin abrir).
- Decisión owner pendiente: modelo del import (a) enrollment
  INACTIVE sin plan vs (b) patrón AcademyInvite en bulk.

## Ideas no pedidas detectadas en el camino

- El retorno `?sub=error` por carrera: si el browser vuelve antes
  de que MP procese el authorized, `getRegisterStatus` ve pending
  → redirect error (la fila queda PENDING_CARD y la resuelve retry/
  sweep; el smoke lo confirmó - el verify posterior ya era ACTIVE).
- `mpSubscriptionReturn` GET público sin auth: activa por
  `external_reference` - ok por diseño pero un hit curioso puede
  gatillar el lookup.
