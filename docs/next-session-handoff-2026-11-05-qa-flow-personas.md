# Handoff: personas reales para QA con gateway=flow

**Rama**: `dev`. Stack al cierre: DB/Redis docker sanos; API dev con
`PAYMENT_GATEWAY=flow` (`.env` raíz) en :4000 viva; web `next start`
(prod build) en :3000 vivo de sesión anterior. Para dev normal:
`pnpm dev` (vuelve a leer `.env` → flow).

## Qué quedó hecho (pendiente del handoff enrich-cupo-fichas)

Preparación completa para QA manual con Flow sandbox; sin openspec
(tool interno de QA/seed + docs, sin cambio de comportamiento -
mismo criterio que `c691c793`).

1. **`apps/api/scripts/qa-real-personas.cjs`** (nuevo, idempotente) +
   `pnpm db:qa-personas` en package.json. Upsert PersonRole APPROVED y
   password `omnidance123` (scrypt, formato AuthService) a:

   | Email | Rol QA | Estado |
   |---|---|---|
   | salas.eduardo03@gmail.com | dancer | verified, DANCER |
   | salas.eduardo.cl@gmail.com | academy | verified, DANCER+ACADEMY_OWNER+INSTRUCTOR |
   | salas.eduardo03@outlook.com | producer | NO verified, DANCER+**PRODUCER nuevo** |
   | salas.eduardo.backup@gmail.com | backup | verified, DANCER+ACADEMY_OWNER |

   Login por password no exige `verifiedAt` (auth.controller.ts:324) -
   la cuenta outlook loguea igual.

2. **Claves Flow verificadas sandbox**: `FLOW_BASE_URL=https://
   sandbox.flow.cl/api`. No hay claves de prod en el repo.

3. **Login verificado**: `POST /api/auth/login` 200 en las 4 cuentas.

4. **Smoke checkout flow real**: `POST /checkout/ticket` (evento
   "Switch", dancer gmail) → orden `cmw3k3rda000c10iaxy17jvdr` TICKET
   PENDING $5.000, `paymentUrl` real a
   `sandbox.flow.cl/app/web/pay.php?token=…` (flowOrder 11503075).
   `payment/getStatusByCommerceId` responde status 1 (pendiente).

5. **Decisión de specs**: los specs e2e quedan en stub (PAID/FAILED
   deterministas). El tramo Flow es QA **manual**: el front de Flow
   pide RUT+pass/tarjeta de prueba (confirmado por el usuario) y no es
   automatizable. El `urlConfirmation` de Flow no alcanza localhost,
   pero el gateway ya lo cubre: `GET /payments/:id` hace polling por
   `getStatusByCommerceId` y captura el PAID al volver el usuario.

6. **Docs**: `docs/qa-flows-inventory.md` §0 "Palancas dev" documenta
   el mapa de cuentas y la mecánica; `AGENTS.md` suma `db:qa-personas`.

7. **Smoke real del ciclo collect completo** (`POST /admin/jobs/
   platform-charges.collect/run` con sesión admin):
   - `POST /admin/platform-charges` {personId outlook, $1.500} →
     Payment `cmw3khtnc002110iamk0ash9v` PLATFORM_CHARGE PENDING,
     `paymentUrl` real (Flow `customer/create` on-demand +
     `customer/collect` type≠1: sin tarjeta registrada degrada a link).
   - Job → JobRun OK `{scanned:1, pending:1, collected:0, failed:0}`:
     `retryPending` barrió el cargo, emitió `COLLECT_ATTEMPT` attempt 1,
     reintentó `customer/collect` (nuevo `gatewayRef` 11503204) y quedó
     PENDING - correcto, la persona sigue sin tarjeta registrada.
   - **Camino COLLECTED verificado**: `POST /admin/platform-charges`
     {personId gmail03 `cus_zf76435928` con tarjeta registrada, $1.000}
     → Flow cobró "Cargo automático" real (status 2, fee 29, balance
     965, flowOrder 11503259). Nuestra respuesta fue PENDING
     (`customer/collect` type=1 con resultado no terminal al momento
     de la llamada) y el polling `GET /payments/:id` lo liquidó:
     ledger `ORDER_CREATED`(admin) → `STATUS_CONFIRMED`(polling)
     → `SETTLED`(polling) → Payment PAID.

## Hallazgo resuelto: suscripciones divergentes Flow↔DB

**Causa raíz**: la API de la sesión anterior quedó viva con
`PAYMENT_GATEWAY=stub`. El cron `subscriptions.reconcile` de las 09:00
(12:00 UTC) corrió con registry=[STUB] (resolveGateways registra solo
el primario; FLOW no entra aunque haya credenciales), el param
`payments.subscription_gateway="FLOW"` cayó al default STUB, y
`StubGateway.getSubscription(id desconocido)` devuelve CANCELED por
diseño ("la fila local converja"). Resultado: **42 subs CANCELED en
batch** (41 membership canceledAt ~12:00:00.7 + 1 platform), entre
ellas las 3 reales de Flow. Nunca hubo cancel remoto - Flow las sigue
reportando status=1.

**Reparación aplicada**: las 3 reales restauradas a ACTIVE +
nextInvoiceAt desde Flow (mems 2026-12-02, plat 2027-11-03,
canceledAt=null). Las 39 `sus_enrich_*` (ids fabricados por el enrich,
nunca existieron en Flow) quedan CANCELED - correcto.

**Trampa residual conocida**: correr `PAYMENT_GATEWAY=stub` contra una
DB con subs reales de Flow re-cancela todo en el próximo reconcile
(09:00). La receta e2e de AGENTS.md usa stub - ojo al correrla contra
esta DB. Fix durable propuesto (sin hacer): registrar FlowGateway en
`resolveGateways` cuando haya FLOW_API_KEY+SECRET aunque el primario
sea stub, igual que MercadoPago/Stripe se registran por credenciales.
Es cambio de comportamiento → change OpenSpec propio si se decide.

**Decisión del usuario**: dev se corre solo con `PAYMENT_GATEWAY=flow`
(como está en `.env`).

## QA manual con flow - receta

1. Stack: `pnpm dev` (API lee `PAYMENT_GATEWAY=flow` del `.env` raíz).
2. Login UI con cualquiera de las 4 cuentas / `omnidance123`.
3. Comprar ticket/plan/membresía → redirect a `sandbox.flow.cl` →
   pagar con credenciales/tarjeta de prueba de Flow (RUT+pass).
4. Vuelve a `/api/payments/order-return` → la app consulta
   `getStatusByCommerceId` y settle la orden (sin webhook local).
5. Debug de orden puntual: `node apps/api/scripts/flow-call.cjs
   payment/getStatusByCommerceId commerceId=<refId>`.

## Pendiente

- ~~Completar un pago real en Flow sandbox~~ **HECHO**: el usuario pagó
  ambos links (ticket Switch + platform charge) en el front de Flow
  (Webpay). Settle por **webhook real**: el `urlConfirmation` apunta a
  `API_URL=https://hvr4lkk3-4000.brs.devtunnels.ms` y el POST de Flow
  llegó al API por el tunnel - ledger `WEBHOOK_RECEIVED →
  STATUS_CONFIRMED → SETTLED`, ambos PAID con media "Webpay".
- **Bug encontrado y arreglado** (`5ab1af33`): el urlReturn de Flow
  vuelve por POST cross-site y `POST /payments/order-return` daba 404
  - `@Get`+`@Post` apilados en un handler solo registra GET en Nest 11;
  quedó `@All("order-return")` (303 a /checkout/return).
- **Camino COLLECTED de collect**: verificado (ver §7) - gmail03 y
  gmail.cl tienen tarjeta registrada en Flow (`flowCustomerId` en DB).
- `multipais-foundation` tasks 10/11/13 (épica: pases multi-día
  cross-academia, prácticas/socials free, congresos) - cada una es un
  change propio, requiere priorización.

## Notas operativas

- `git` no está en PATH de Git Bash: `export PATH="/c/Program Files/Git/bin:$PATH"`.
- DB en `localhost:5433` (no 5432 - hay un postgres local ajeno en 5432).
- La orden de prueba `cmw3k3rda000c10iaxy17jvdr` (Switch, $5.000,
  PENDING en Flow) quedó viva: sirve para completar el pago manual o
  expira sola en Flow.
