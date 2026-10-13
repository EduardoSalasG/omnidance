## Purpose

Canal de preventa atribuido a academias invitadas por el productor: la
academia comparte su link, la orden queda marcada con su comisión
porcentual congelada, y la plataforma registra la deuda
productor→academia que el productor regulariza por fuera y marca pagada.

## ADDED Requirements

### Requirement: Acuerdo de venta invitado por el productor

El productor SHALL poder crear un `AcademySaleAgreement` por evento (o
serie) eligiendo una academia con rol APPROVED y un `commissionPct`
entero 1-90, con `status=INVITED`. La academia SHALL poder aceptarlo
(ACTIVE) o rechazarlo (DECLINED); solo acuerdos ACTIVE atribuyen ventas.
El productor SHALL poder desactivar un acuerdo (DISABLED): deja de
atribuir ventas nuevas sin afectar órdenes ya pagadas. Debe existir a lo
más un acuerdo por (evento, academia).

#### Scenario: invitación creada

- **WHEN** el productor crea un acuerdo para su evento con una academia
  aprobada y `commissionPct=50`
- **THEN** el acuerdo queda INVITED y la academia recibe notificación

#### Scenario: academia acepta

- **WHEN** la academia acepta el acuerdo
- **THEN** pasa a ACTIVE y su link de venta empieza a atribuir

#### Scenario: duplicado rechazado

- **WHEN** el productor intenta crear un segundo acuerdo para el mismo
  par (evento, academia)
- **THEN** responde 409

#### Scenario: edición con snapshot

- **WHEN** el productor cambia el `commissionPct` de un acuerdo ACTIVE
- **THEN** las órdenes nuevas usan el % nuevo y las ya pagadas conservan
  su `academyCommissionClp` congelado

### Requirement: Link de venta de la academia

Cada acuerdo ACTIVE SHALL exponer un link compartible del evento con
atribución de la academia (p. ej. `?a=<academyId>`). El link SHALL ser
público y la atribución silenciosa: la página del evento y el precio no
cambian para el comprador.

#### Scenario: compra atribuida

- **WHEN** un comprador completa una compra llegando por el link de una
  academia con acuerdo ACTIVE
- **THEN** el pago queda marcado con `soldByAcademyId` y su
  `academyCommissionClp` congelado

#### Scenario: link de academia sin acuerdo

- **WHEN** se compra con `?a=` de una academia sin acuerdo ACTIVE para
  ese evento
- **THEN** la compra procede normal sin atribución (el parámetro se
  ignora)

### Requirement: Deuda acumulada productor→academia

Por cada `Payment` PAID atribuido, el sistema SHALL acumular
`academyCommissionClp` como deuda del productor hacia la academia,
agrupada por período de liquidación. El payout del productor MUST NOT
descontar la comisión: su neto sigue siendo `amount −
platformDeduction` y la comisión es un pasivo registrado aparte.

#### Scenario: deuda tras ventas

- **WHEN** un evento tiene 10 órdenes PAID atribuidas con comisión de
  $2.500 c/u
- **THEN** la deuda registrada del productor a esa academia para el
  período es $25.000

#### Scenario: venta sin atribución no suma

- **WHEN** una orden PAID no lleva `soldByAcademyId`
- **THEN** no afecta la deuda de ninguna academia

### Requirement: Regularización marcada por el productor

El productor SHALL poder marcar la deuda de un período/academia como
pagada, opcionalmente adjuntando comprobante (`evidenceUrl`). El estado
pasa a PAID con `paidAt` — no hay confirmación del lado de la academia.
La academia SHALL ver su deuda acumulada por productor/período y su
estado (pendiente/pagada), sin acción disponible.

#### Scenario: productor marca pagado

- **WHEN** el productor marca la deuda del período con una academia
- **THEN** pasa a PAID con `paidAt` y la academia la ve saldada

#### Scenario: academia solo consulta

- **WHEN** la academia consulta sus acuerdos
- **THEN** ve ventas, comisión devengada y estado de pago, sin acción de
  cierre

### Requirement: Superficies de consola

La ficha del evento del productor SHALL mostrar una sección "Preventa
por academias": acuerdos (estado, %, link copiable), ventas y comisión
por academia, y deuda por período con acción marcar-pagado. La consola
de la academia SHALL mostrar sus acuerdos con link compartible, ventas
acumuladas, comisión devengada y estado de pago del productor.

#### Scenario: productor revisa el canal

- **WHEN** el productor abre la ficha de un evento con acuerdo ACTIVE
- **THEN** ve la academia, su %, el link, N ventas atribuidas y la
  comisión acumulada/deuda
