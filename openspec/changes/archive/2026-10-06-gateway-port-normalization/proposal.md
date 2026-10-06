# Proposal - gateway-port-normalization

## Por qué

Hoy el puerto `PAYMENT_GATEWAY` inyecta **una sola** pasarela elegida
por env (Flow o stub): el webhook `/payments/webhook` no sabe de qué
proveedor viene la notificación, `createOrder` hardcodea CLP y no hay
cómo montar un segundo proveedor sin reescribir el wiring. La spec
§10 define la arquitectura destino (Flow/MP/Fintoc como adaptadores,
currency ISO por orden, cuentas de pasarela propias por actor). Este
slice deja el puerto normalizado para que los proveedores se enchufen
- la prueba es el adaptador MercadoPago (habilita Europa).

## Qué cambia

- **`GatewayRegistry`** (nuevo): mapa `provider → adapter` registrado
  en el módulo (`PAYMENT_GATEWAYS`). `Payment.gateway` ya persiste el
  proveedor por orden - el registry resuelve el adaptador correcto
  en webhook/polling/refresh.
- **Webhook por proveedor**: `POST /payments/webhook/:provider`
  normaliza la confirmación vía el adaptador correspondiente
  (`NotFoundException` si el provider no está registrado). El
  endpoint legacy `POST /payments/webhook` rutea al provider default
  (el `urlConfirmation` de Flow ya configurado en prod sigue igual).
- **Confirmación normalizada**: `verifyWebhook`/`refreshStatus`
  devuelven además `amount`/`currency` de la verdad reportada;
  `createOrder` recibe `currency` (Flow deja de hardcodear CLP - lo
  pasa del Payment).
- **`MercadoPagoGateway`** (nuevo adaptador): `createOrder` vía
  preference API (`init_point` = paymentUrl, `external_reference` =
  refId), `verifyWebhook` parsea la notificación `payment` →
  `GET /v1/payments/:id` → normaliza `approved`→PAID /
  `rejected|cancelled|refunded`→FAILED con `gatewayData`
  (`transaction_details.net_received_amount`, `fee_details`,
  `payment_method_id`, `date_approved` como verdad monetaria), y
  `refreshStatus` por `external_reference` (search) o `gatewayRef`.
- **Selección de provider por orden**: param
  `payments.default_gateway` (`FLOW` en prod, `STUB` en dev) - la
  orden persiste `Payment.gateway` con el provider elegido al crear.
  La elección por actor (pasarela propia del productor) queda para
  `producer-gateway-accounts`.
- **Currency**: `Payment.currency` (ya existe, default CLP) viaja a
  `createOrder`; el adaptador valida que la moneda esté soportada y
  la confirmación expone la moneda reportada (el settle la cruza
  contra el Payment - mismatch → `AMOUNT_MISMATCH`).

## Alcance / riesgos

- MercadoPago es `PaymentGateway` **solamente** - no implementa
  `SubscriptionProvider` (suscripciones siguen Flow-only; MP tiene
  preapproval pero es trabajo aparte, slice `subscription-port-generic`).
- Fintoc queda para un slice posterior sobre esta misma normalización.
- `Event.currency`/`Academy.currency` (venta multi-moneda real) fuera
  de V1 - `Payment.currency` ya congela la ISO y el mecanismo está.
- Sin credenciales MP el adaptador no se registra (como Flow hoy) -
  el stub sigue cubriendo dev/test.
