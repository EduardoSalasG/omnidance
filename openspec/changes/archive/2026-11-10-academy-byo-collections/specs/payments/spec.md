# Delta: payments (BYO collections)

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Take COBROS por multiplicador de pasarela

El modelo nuevo SHALL reemplazar `academy_cobros.take_multiplier` /
`ACADEMY_COBROS_TAKE` por el take flat `academy_fee.net_pct` facturado
mes vencido; las líneas históricas se liquidan con el motor anterior
hasta agotarse y no se emiten nuevas.

#### Scenario: Histórico pendiente

- **WHEN** existe un payout de academia de un período previo al
  cutover
- **THEN** se liquida con las líneas del modelo anterior sin emitir
  líneas nuevas bajo esa mecánica
