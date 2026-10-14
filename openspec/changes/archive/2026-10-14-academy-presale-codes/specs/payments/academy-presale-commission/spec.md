## ADDED Requirements

### Requirement: Código de preventa emitido por la academia

Un acuerdo ACTIVE SHALL permitir a la academia (staff con capacidad
`payments`) emitir códigos de descuento de un solo uso y 100% off, con
scope al evento/serie del acuerdo (`POST /academy-deals/:id/codes`). El
código SHALL ser legible y escribible a mano (`SLUGACADEMY-DDMMM-XXXX`)
y quedar vinculado al acuerdo (`DiscountCode.academySaleAgreementId`).

#### Scenario: código emitido

- **WHEN** la academia emite un código en un acuerdo ACTIVE
- **THEN** se crea un `DiscountCode` `ACADEMY_PRESALE` con
  `percentOff=100`, `maxUses=1` y scope del acuerdo

#### Scenario: cupo del acuerdo

- **WHEN** el acuerdo tiene `maxTickets` y los códigos emitidos más los
  tickets PAID por link ya alcanzan el cupo
- **THEN** `POST /academy-deals/:id/codes` responde 409

#### Scenario: listado con redemption

- **WHEN** productor dueño o staff de la academia consulta
  `GET /academy-deals/:id/codes`
- **THEN** recibe los códigos emitidos con su redemption (persona que lo
  usó, cuándo) y el pago asociado

### Requirement: Atribución por código en el checkout

Un código `ACADEMY_PRESALE` SHALL comportarse como atribución de la
academia del acuerdo: la orden queda con `soldByAcademyId` y
`academyCommissionClp` congelado sobre el precio de lista, además del
vínculo normal `Payment.discountCodeId` + `DiscountRedemption`. Si el
acuerdo no está ACTIVE, el código SHALL fallar como no redimible.

#### Scenario: redención con acuerdo vigente

- **WHEN** un comprador aplica un código `ACADEMY_PRESALE` válido en el
  evento del acuerdo
- **THEN** la orden sale $0 (FREE), el ticket se emite y el pago queda
  atribuido a la academia

#### Scenario: acuerdo desactivado

- **WHEN** se intenta redimir un código cuyo acuerdo fue DISABLED
- **THEN** el checkout rechaza el código

### Requirement: Deuda bidireccional del acuerdo

El saldo del acuerdo SHALL ser el neto de ambas direcciones: ventas por
link (productor debe la comisión a la academia) menos ventas por código
(la academia cobró el efectivo y debe `precioLista − comisión` al
productor) menos lo ya saldado. `AcademySaleSettlement.amountDue` SHALL
registrar el monto firmado cubierto por cada marca de pago (positivo =
productor pagó a la academia; negativo = academia pagó al productor).

#### Scenario: saldo a favor de la academia

- **WHEN** el acuerdo vendió 10 entradas por link a $10.000 con 50%
- **THEN** el saldo pendiente es +$50.000 (el productor paga)

#### Scenario: saldo a favor del productor

- **WHEN** la academia vendió 3 entradas por código a $10.000 con 50%
- **THEN** el saldo pendiente es −$15.000 (la academia paga al productor)
