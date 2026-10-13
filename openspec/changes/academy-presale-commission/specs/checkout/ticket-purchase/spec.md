## ADDED Requirements

### Requirement: atribución de academia en la orden

`POST /checkout/ticket` SHALL aceptar `academyId` opcional (o resolverlo
del contexto del link `?a=` persistido por el front). Si existe un
`AcademySaleAgreement` ACTIVE para (evento, academia), el `Payment`
SHALL persistir `soldByAcademyId=academyId` y congelar
`academyCommissionClp = round(unitListPrice × commissionPct)` por orden
(multiplicado por `quantity`). Sin acuerdo ACTIVE el parámetro se ignora
— la compra procede idéntica. La atribución SHALL aplicar solo a órdenes
`channel=PRESALE`; nunca a DOOR ni otros tipos de orden.

#### Scenario: compra con acuerdo vigente

- **WHEN** una orden de 2 tickets a $6.000 llega con `academyId` de un
  acuerdo ACTIVE al 50%
- **THEN** `soldByAcademyId` queda en la orden y
  `academyCommissionClp = 6.000` (2 × 3.000)

#### Scenario: sin acuerdo o inactivo

- **WHEN** el POST trae `academyId` sin acuerdo ACTIVE para el evento
- **THEN** la orden se crea normal sin atribución ni comisión

#### Scenario: canal puerta no atribuye

- **WHEN** una orden DOOR llega con `academyId` válido
- **THEN** se crea sin `soldByAcademyId` ni comisión
