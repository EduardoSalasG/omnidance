# subscription-manual-transfer

## Why

Cargo Automático de Flow tiene tope default $250.000/txn (PRO anual
$1.223.898 no cabe) y es solo tarjetas (no hay PAT). Se pide la alza a
soporte@flow.cl, pero el camino robusto es pagar por transferencia con
validación de comprobante, replicando el patrón OwnMethodClaim que ya
existe para pagos manuales (nota + archivo → claim → review → settle).

## Decisiones tomadas (con el usuario)

- Alcance: AMBAS suscripciones (membresía bailarín→academia y
  plataforma academia/productor→Omnidance).
- Validación: cada quien lo suyo - academia revisa claims de
  membresías (consola propia); admin plataforma revisa claims de subs
  de plataforma.
- Renovaciones: elección por subscriber - con tarjeta = auto (Flow);
  con transferencia = orden pendiente por ciclo + comprobante cada
  período (no existe PAT en Flow: cargo automático es solo tarjetas).
- Datos bancarios: membresías reusan los métodos propios de la
  academia (AcademyPaymentMethod ya existe); plataforma define datos
  de transferencia Omnidance como params admin
  (`platform_billing.transfer.*`).

## What Changes

- Nuevo estado de suscripción `PENDING_PAYMENT` (alta manual esperando
  comprobante aprobado) en ambos dominios.
- `subscribe` acepta `paymentMethod: "TRANSFER"` (además del default
  tarjeta/Flow): crea sub PENDING_PAYMENT + Payment PENDING
  claim-elegible (orderType MEMBERSHIP / PLATFORM_SUB, refId
  `mem_<planId>_manual_<cycle>` / `platsub_<subId>_manual_<cycle>`) y
  devuelve los datos bancarios + URL del claim.
- Checkout suscripción: opción "transferencia" muestra datos bancarios
  + OwnMethodClaim reutilizado (nota + png/jpeg/webp/pdf).
- Claim APPROVED → Payment PAID → suscripción ACTIVE + primer período
  + enrollment/tier (mismo settle, actor `claim`).
- Scheduler: al vencer período pagado de sub manual, crea el Payment
  PENDING del ciclo siguiente + notificación al subscriber (ventana de
  pago); sin claim aprobado al vencer gracia → suspende/CANCELED.
- Consolas: academia revisa claims de membresías (reusa
  /academia/claims o sección de su consola); admin plataforma revisa
  claims PLATFORM_SUB (reusa flujo de /soporte claims).
- Params admin: `platform_billing.transfer.{bank,accountType,
  accountNumber,rut,email}` editables en /admin/params.

## Capabilities

### Modified Capabilities

- `payments/subscriptions`: alta por transferencia, estado
  PENDING_PAYMENT, activación por claim, renovación manual por ciclo.
- `payments/claims` (o como quede nombrada la capability de
  comprobantes): claims aplicables a órdenes de suscripción y revisión
  por dominio (academia vs plataforma).

## Impact

- Prisma: status nuevo en MembershipSubscription + PlatformSubscription;
  posible flag `manualBilling` o paymentMethod en la sub.
- API: subscriptions.service, platform-subscriptions.service,
  payment-claims/academy-claims (revisión por dominio), scheduler
  renovación manual, params.
- Web: membership-checkout-client, academy-billing, consola claims
  academia, /soporte claims, /admin params.
- OpenSpec deltas + qa-flows-inventory + handoff.
