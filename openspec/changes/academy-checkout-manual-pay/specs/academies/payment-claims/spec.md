# academies/payment-claims — deltas (academy-checkout-manual-pay)

## ADDED Requirements

### Requirement: Intento de pago registrado (claim AWAITING)

`ClaimStatus` SHALL incluir `AWAITING` además de PENDING | APPROVED |
REJECTED. Un claim AWAITING representa el intento de pago declarado del
alumno antes de adjuntar el comprobante: persiste `academyId`,
`personId`, `planId`, `amount` (snapshot del precio del plan al momento
del intento), `methodType`, `methodLabel` (snapshot) y `enrollmentId`
vigente si existe. `receiptKey` SHALL ser nullable; vale null solo en
AWAITING.

`POST /academies/:id/claims/intent` con `{planId, methodId}` SHALL
crear el claim AWAITING o devolver el existente del alumno para ese
plan en AWAITING o PENDING (idempotente: re-entrar al checkout o
re-seleccionar el medio no duplica el intento). El plan MUST existir,
estar activo y pertenecer a la academia; el método MUST estar activo y
pertenecer a la academia. El `amount` registrado SHALL ser el precio
vigente del plan (no un monto libre declarado).

#### Scenario: intento creado

- **WHEN** un alumno con sesión elige el método TRANSFER de la academia
  para un plan activo y POSTea `/claims/intent`
- **THEN** se crea `PaymentClaim{status:AWAITING, receiptKey:null,
  amount:plan.price}` y la respuesta incluye el claim con el método

#### Scenario: idempotencia al volver

- **GIVEN** el alumno ya tiene un claim AWAITING o PENDING para ese plan
- **WHEN** POSTea `/claims/intent` de nuevo (mismo u otro método)
- **THEN** responde el claim existente sin crear duplicado

#### Scenario: seguimiento del owner

- **WHEN** el owner consulta `GET /academies/:id/claims`
- **THEN** los claims AWAITING aparecen distinguibles (sin comprobante
  aún) y los PENDING primero en orden de acción

### Requirement: Comprobante sobre claim existente

`POST /academies/:id/claims/:claimId/receipt` SHALL aceptar multipart
`receipt` (imagen/PDF ≤5MB, mismas reglas que `POST /claims`) solo del
dueño del claim y solo si está AWAITING. SHALL guardar el archivo vía el
puerto de storage, setear `receiptKey`, transicionar a PENDING y
notificar `payment_claim_new` al owner. Claim en otro estado → 409.

#### Scenario: alumno vuelve y sube el comprobante

- **GIVEN** un claim AWAITING propio creado en el checkout
- **WHEN** el alumno POSTea `/receipt` con la captura
- **THEN** el claim pasa a PENDING con `receiptKey` y entra a la cola
  de validación

#### Scenario: claim ya resuelto

- **WHEN** se intenta subir comprobante a un claim PENDING/APPROVED/REJECTED
- **THEN** responde 409

### Requirement: Cancelar intento propio

`POST /academies/:id/claims/:claimId/cancel` SHALL eliminar el claim
solo si es del propio alumno y está AWAITING (borrador sin efecto
financiero ni evidencia). Otro estado u otro dueño → 403/409.

#### Scenario: cambio de medio antes de transferir

- **WHEN** el alumno cancela su claim AWAITING y elige otro método
- **THEN** el borrador se elimina y un nuevo intento crea un claim nuevo

### Requirement: Reanudar el checkout tras salir de la app

`GET /academies/:id/claims/mine` SHALL incluir `planId` y `methodType`
por claim para que el checkout identifique el intento del plan en
curso. El endpoint de comprobante SHALL responder 404 si el claim no
tiene `receiptKey`.

#### Scenario: salir y volver

- **GIVEN** un alumno que confirmó "transferencia" y cerró la app
- **WHEN** vuelve a `/academias/:id/checkout?plan=X`
- **THEN** ve de nuevo los datos bancarios del método elegido y el
  upload, sin repetir el intento

### Requirement: Medio de pago elegido en el checkout

La selección de medio de pago de la academia (métodos propios vs
pasarela Flow) SHALL ocurrir dentro de `/academias/:id/checkout`, no en
la ficha pública. Cuando el método elegido es TRANSFER, el checkout
SHALL mostrar los campos `holder` (nombre), `rut`, `bank`,
`accountType`, `accountNumber` y `email` del método con copia
individual y una acción "copiar todos" que produce un bloque de texto
pegable en apps de banco. La ficha pública SHALL mantener solo la lista
read-only de los claims propios del alumno (estado, monto, motivo de
rechazo).

#### Scenario: datos bancarios copiables

- **WHEN** el alumno confirma TRANSFER en el checkout
- **THEN** ve los seis campos etiquetados, cada uno copiable, y un
  botón que copia el bloque completo (incluido el monto)
