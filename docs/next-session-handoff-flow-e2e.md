# Handoff; Flow sandbox e2e - one-off PAID end-to-end

**Rama**: `dev` · Sin commit aún (git no estaba en el PATH del
entorno de sesión; commitear desde VS Code).

## Estado

Pago one-off verificado real contra Flow sandbox:
`Payment PAID · fee $160 · media Webpay · currency CLP` y
ticket `cmvy6exgx000asu6x9kdch41z` ACTIVE
(payment `cmvy5zxn2000t91nwe16umazu`, refId
`tkt_cmu62tr86001lyo423gke8z9l_rtcxf555`, flowOrder 11431518).

## Fixes aplicados (descubiertos por el smoke, todos auditados en
`GatewayTransaction`)

1. `order-ref-45-limit` (change): Flow rechaza `commerceOrder` >45.
   refId → sufijo `shortUid()` 8 base36; ticket deja de llevar
   `codeId` (vive en `Payment.discountCodeId`); decoder acepta
   formato corto (3 partes) y legacy; guard `fits()` explota local.
   Spec `order-ref.spec.ts` 8/8.
2. `flow-e2e-smoke-fixes` (change):
   a. Migración `20261101190000_payment_gateway_currency` — el
      settle ya escribía `gatewayCurrency` pero la columna no
      existía (spread evade excess-property check) → webhook 500.
   b. `GET|POST /payments/order-return` → 303 a
      `/checkout/return?paymentId=` — Flow devuelve al pagador con
      POST cross-site, cookies SameSite=Lax no viajan → el retorno
      caía a /login. Los 5 returnUrl del checkout apuntan al
      endpoint.
   c. `refreshStatus`: param `commerceOrder` → `commerceId`
      (getStatusByCommerceId; sin él el polling devolvía 400
      "Missing service params").

## Hallazgos de ambiente (documentados, no bugs)

- Credenciales: prod vs sandbox son cuentas distintas; las primeras
  eran de prod → 401 `apiKey not found`.
- **Sandbox exige payer email = usuario Flow registrado en
  sandbox.flow.cl** (error `1620` para cualquier otro email,
  incluso gmail válidos). Se probó con `salas.eduardo.cl@gmail.com`
  (Person ya existía). En prod no aplica.
- Tarjeta de prueba: `4051885600446623` · `11/27` · CVV `123`
  (RUT `11111111-1` / clave `123`).
- Tunnel: devtunnels público en `API_URL` (`.env` raíz) hace llegar
  webhooks reales; `WEB_URL` queda localhost (order-return/
  customer-return redirigen ahí).

## Pendiente

- **Smoke suscripciones Flow: VERIFICADO** (2026-11-01). Traza:
  plans/get 401→plans/create 200 → customer/create+get+register 200
  → platform-customer-return → getRegisterStatus → subscription/
  create 200 → `PlatformSubscription` ACTIVE (academia La Casa del
  Mambo, pagador salas.eduardo.cl@gmail.com). Primer cobro invoice
  queda por confirmarse vía `subscription-webhook` (urlCallback del
  plan apunta al tunnel) o reconcile diario. Para el smoke se hizo
  owner a Eduardo de Mambo Madness y La Casa del Mambo + PersonRole
  ACADEMY_OWNER APPROVED + createdAt adelantado (consola ordena por
  createdAt asc).
- Membresías de alumnos (mismo motor, otro caller) sin smoke
  explícito - alto grado de confianza por el path idéntico.
- Cobros sueltos plataforma→actor (`customer/collect` existe en
  Flow; no implementado).
- PENDING huérfanos de los intentos fallidos (sin limpiar).
- Archivar changes `order-ref-45-limit` + `flow-e2e-smoke-fixes`
  (openspec archive) al cerrar la verificación.
