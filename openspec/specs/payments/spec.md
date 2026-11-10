# payments Specification

## Purpose
TBD - created by archiving change fintoc-gateway-adapter. Update Purpose after archive.

## Requirements

### Requirement: adaptador Fintoc para órdenes de un solo cargo

El sistema SHALL exponer `FINTOC` como provider del GatewayRegistry
cuando exista `FINTOC_SECRET_KEY`. `createOrder` SHALL crear una
checkout session `flow:"payment"` con `metadata.refId`, devolver
`redirect_url` como `paymentUrl` y persistir el `cs_…` id como
`Payment.gatewayRef`. SHALL rechazar monedas fuera de {CLP, MXN}.

#### Scenario: createOrder exitoso

- **WHEN** se crea una orden FINTOC por CLP 5000
- **THEN** el sistema POSTea a `/v2/checkout_sessions` con
  flow `payment`, amount 5000, currency CLP y `metadata.refId`, y
  devuelve `redirect_url` + `gatewayRef` = id de la sesión

### Requirement: verificación firmada del webhook

El sistema SHALL rechazar todo webhook FINTOC cuya firma
`Fintoc-Signature` no verifique (HMAC-SHA256 de `t.rawBody` con
`FINTOC_WEBHOOK_SECRET`, tolerancia de reloj ≤5min) o cuando falte la
firma o el body crudo. Tras validar, SHALL confirmar el estado por
`GET /v2/checkout_sessions/:id` (fetch-confirm) antes de liquidar.

#### Scenario: firma válida + sesión terminada

- **WHEN** llega `checkout_session.finished` con firma válida
- **THEN** el sistema GETea la sesión, extrae `metadata.refId` y liquida
  PAID con `gatewayData` normalizado (amount, currency, media, raw)

#### Scenario: firma inválida o ausente

- **WHEN** el header falta, no verifica, o el timestamp excede 5 min
- **THEN** responde webhook inválido sin consultar ni liquidar

#### Scenario: evento no terminal

- **WHEN** el evento es válido pero la sesión no está en estado terminal
- **THEN** responde error para que Fintoc reintente (misma semántica que
  el adaptador MercadoPago)

### Requirement: polling por gatewayRef

`GET /payments/:id` SHALL consultar `refreshStatus` con el `cs_…`
persistido en `Payment.gatewayRef` para órdenes FINTOC PENDING.

#### Scenario: sesión expirada

- **WHEN** la sesión consultada está `expired`
- **THEN** el polling liquida FAILED por el mismo settle del webhook

### Requirement: Cobro de ventas de academia por gateway propio (BYO)

El sistema SHALL cobrar las órdenes de una academia (MEMBERSHIP,
WORKSHOP, PRIVATE) a través de la cuenta de pasarela propia de la
academia cuando existe una credencial activa, usando el mismo
mecanismo de credenciales cifradas y enrutado de webhook que las
cuentas de productores. El dinero SHALL llegar directo a la cuenta de
la academia; Omnidance no recauda ni liquida esas ventas. Una academia
sin credencial propia SHALL vender solo por claim manual.

#### Scenario: Checkout con credencial propia

- **WHEN** un alumno compra un plan de una academia con cuenta de
  pasarela propia activa
- **THEN** la orden se crea con el adaptador de esa cuenta y el
  webhook `?account=` confirma el pago

#### Scenario: Academia sin credencial

- **WHEN** una academia sin cuenta de pasarela propia intenta vender
  online
- **THEN** el checkout no ofrece pago por pasarela; solo queda el
  claim manual por comprobante

### Requirement: Take de cobranza facturado mes vencido

El sistema SHALL devengar sobre cada `Payment` gateway-PAID de
academia un fee `amount × academy_fee.net_pct` (default 1,0)
congelado por orden, facturado a la academia al cierre del período
como neto + IVA dentro de su cobro de plataforma (o documento
equivalente). Omnidance SHALL facturar, nunca liquidar, a las
academias por este modelo.

#### Scenario: Devengado por orden

- **WHEN** una orden de academia queda PAID por su pasarela propia
- **THEN** el take se congela sobre esa orden con el pct vigente

#### Scenario: Factura del período

- **WHEN** cierra el período de liquidación
- **THEN** la academia recibe el cargo del take acumulado neto + IVA
  junto a (o dentro de) su factura de suscripción

### Requirement: Bloqueo de cobranza integrada por liquidación impaga

Si la academia no paga su liquidación del período, el sistema SHALL
deshabilitar sus medios de cobro integrados (checkout por pasarela)
manteniendo habilitado el claim manual por comprobante, hasta que la
liquidación quede pagada.

#### Scenario: Liquidación vencida

- **WHEN** la liquidación de una academia supera su gracia sin pago
- **THEN** el checkout por pasarela de sus alumnos responde error y
  solo el claim manual sigue disponible

#### Scenario: Regularización

- **WHEN** la academia paga la liquidación vencida
- **THEN** sus medios integrados vuelven a habilitarse sin acción
  adicional

### Requirement: Liquidación mensual exportable

El sistema SHALL emitir por academia un estado de cuenta mensual con
las operaciones cobradas por pasarela, el take devengado por orden y
los totales neto/IVA, exportable en PDF (mismo formato del reporte de
cobros) y CSV, visible en la consola de la academia y en finanzas
admin.

#### Scenario: Exportar liquidación

- **WHEN** el owner abre su liquidación del mes y elige PDF o CSV
- **THEN** descarga el estado de cuenta con operaciones y totales
