# payments/private-lesson-product Specification

## Purpose
TBD - created by archiving change private-lesson-product. Update Purpose after archive.

## Requirements

### Requirement: Checkout de clase particular

El sistema SHALL exponer `GET /checkout/private-class-quote?academyId=` y
`POST /checkout/private-class {academyId}` (SessionGuard). La quote devuelve
`{listPrice, serviceFee, total, academy}` sin crear orden; el POST crea un
`Payment` `orderType=PRIVATE` con refId `pvt_<academyId>_<uuid>`, cobra
`privateLessonPrice + service_fee.membership_clp` y delega a la pasarela
igual que `purchaseClass`. Errores: academia inexistente → 404; academia
inactiva o sin `privateLessonPrice` configurado → 400.

#### Scenario: quote de academia con precio

- **WHEN** un usuario autenticado pide la quote de una academia activa con
  `privateLessonPrice=40000`
- **THEN** responde `listPrice=40000`, `serviceFee` del param de membresía y
  `total=listPrice+serviceFee`, sin crear Payment.

#### Scenario: academia sin precio configurado

- **WHEN** se intenta quote o compra de una academia con
  `privateLessonPrice` null o 0
- **THEN** responde 400 sin crear Payment.

#### Scenario: compra crea orden PENDING

- **WHEN** el alumno compra la particular de una academia vendible
- **THEN** existe un Payment `orderType=PRIVATE` `status=PENDING` con refId
  `pvt_<academyId>_<uuid>`, `unitListPrice`=precio configurado y retorno con
  `paymentUrl` + `paymentId`.

### Requirement: Settle materializa la lección por asignar

El sistema SHALL, en el settle idempotente de una orden PRIVATE al PAID,
crear un `PrivateLesson` `{academyId, personId: comprador, instructorId:
null, scheduledAt: null, price: unitListPrice, paymentId, status:
"REQUESTED"}`. Un pago FAILED SHALL NOT crear lección. El settle SHALL
notificar al owner de la academia que hay una clase particular pagada por
asignar.

#### Scenario: PAID crea lección sin instructor ni fecha

- **WHEN** el webhook confirma PAID de una orden PRIVATE
- **THEN** existe la PrivateLesson REQUESTED con `instructorId=null`,
  `scheduledAt=null` y `paymentId` poblado, y el owner recibe notificación.

#### Scenario: idempotencia del settle

- **WHEN** el mismo webhook se procesa dos veces
- **THEN** existe exactamente una PrivateLesson para el paymentId.

#### Scenario: FAILED no materializa nada

- **WHEN** el webhook confirma FAILED de una orden PRIVATE
- **THEN** no existe PrivateLesson con ese `paymentId`.
