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

## Hallazgo: suscripciones divergentes Flow↔DB

El dashboard Flow sandbox muestra 3 suscripciones "Activa" con cargo
automático que en nuestra DB figuran **CANCELED**:
`sus_wb1a57f42b` (Academia PRO anual, gmail.cl, próximo cargo
03-11-2027), `sus_f8d317bdc1` (Mambo Madness Ilimitado, gmail03,
02-12-2026) y `sus_sb26ca3fa9` (Clave Timba Esencial, gmail.cl,
02-12-2026). En la fecha Flow cobrará la tarjeta igual: en prod el
webhook avisaría (y chocaría con la sub CANCELED local); en dev el
cargo pasa invisible. Hipótesis: la cancelación local no propagó el
`subscription/cancel` a Flow (cancel via admin/test, o DB restaurada).
Pendiente decidir si cancelarlas en el dashboard Flow para dejar el
sandbox limpio o investigar la rama de cancelación.

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

- **Completar un pago real en Flow sandbox** (la parte interactiva:
  RUT+pass en el front de Flow) y verificar el settle PAID por polling.
  Links vivos para probar: ticket Switch `cmw3k3rda000c10iaxy17jvdr` y
  platform charge `cmw3khtnc002110iamk0ash9v` (este último además
  prueba el settle PAID de un PLATFORM_CHARGE por link).
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
