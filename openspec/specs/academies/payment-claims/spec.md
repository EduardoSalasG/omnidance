# academies/payment-claims Specification

## Purpose
TBD - created by archiving change academy-payment-claims. Update Purpose after archive.

## Requirements

### Requirement: Medios de pago configurables por academia

El owner/admin SHALL administrar los medios de pago de su academia con
CRUD bajo `AcademyAccess.requireAdminister`. Cada método tiene `type`
(TRANSFER | PAYMENT_LINK | CASH), `label`, `details` (JSON: datos
bancarios en TRANSFER, `url` en PAYMENT_LINK, instrucciones en CASH),
`order` y `active`.

`GET /academies/:id/payment-methods` SHALL responder a cualquier
usuario con sesión la lista de métodos `active`, ordenados por `order`.
Los campos `details` se devuelven completos (son datos que la academia
quiere difundir a sus alumnos).

#### Scenario: alumno ve cómo pagar

- **GIVEN** una academia con método TRANSFER activo con datos bancarios
- **WHEN** un alumno con sesión consulta `GET /academies/:id/payment-methods`
- **THEN** recibe `{id, type, label, details, order}` del método

#### Scenario: métodos inactivos ocultos

- **WHEN** un método tiene `active: false`
- **THEN** no aparece en el listado del alumno pero sí en el CRUD del owner

#### Scenario: CRUD solo del owner

- **WHEN** un usuario sin `requireAdminister` intenta POST/PATCH/DELETE
- **THEN** recibe 403

### Requirement: Comprobante de pago del alumno

`POST /academies/:id/claims` SHALL aceptar multipart con archivo de
comprobante (imagen o PDF, máx 5MB) más `planId` opcional (de un plan
activo de esa academia), `amount` (CLP declarado, >0), `methodType` y
`note` opcional. SHALL persistir el archivo vía el puerto de storage en
`UPLOADS_DIR` con key `claims/<academyId>/<uuid>.<ext>` y crear el
`PaymentClaim` en PENDING con `methodLabel` en snapshot (el método pudo
cambiar después). SHALL notificar `TRANSACTIONAL` a los admins de la
academia.

#### Scenario: claim creado

- **WHEN** un alumno sube una captura válida con `planId` y monto
- **THEN** se crea `PaymentClaim{status:PENDING}` enlazado a su
  enrollment vigente de esa academia si existe, y el owner recibe
  notificación `payment_claim_new`

#### Scenario: archivo inválido

- **WHEN** el archivo excede 5MB o no es imagen/PDF
- **THEN** responde 400 y no persiste nada

#### Scenario: cola y estado propio

- **WHEN** el owner consulta `GET /academies/:id/claims?status=PENDING`
- **THEN** ve los claims pendientes con nombre del alumno, plan,
  monto, método y fecha
- **WHEN** el alumno consulta `GET /academies/:id/claims/mine`
- **THEN** ve solo sus claims con status y `reviewNote`

### Requirement: Validación del comprobante

`POST /academies/:id/claims/:claimId/approve` (owner/admin) SHALL en
una transacción: marcar el claim APPROVED con `reviewedBy/reviewedAt`;
crear `Payment{orderType:"MEMBERSHIP", gateway:"MANUAL", status:PAID,
amount:claim.amount, fee:0, net:claim.amount, personId:claim.personId}`;
asegurar el `Enrollment` del alumno (crearlo ACTIVE si no existe) y
extender `endsAt` con `membershipBase(now, endsAt)` +
`membershipEndsAt(plan, base)` — idéntica regla del webhook Flow;
notificar `payment_claim_approved` al alumno.

`POST /academies/:id/claims/:claimId/reject {note}` SHALL marcar el
claim REJECTED con `reviewNote` obligatoria y notificar
`payment_claim_rejected` al alumno.

Claims ya resueltos MUST NOT poder re-aprobarse ni re-rechazarse (409).

#### Scenario: aprobar extiende la vigencia

- **GIVEN** alumno con enrollment ACTIVE y `endsAt` en 5 días y un
  claim PENDING por plan MONTHLY
- **WHEN** el owner aprueba
- **THEN** `endsAt` queda en fin del mes calendario siguiente a la
  base (vigencia +1 día), el `Payment` MANUAL queda en PAID y el alumno
  es notificado

#### Scenario: aprobar sin enrollment previo

- **WHEN** el alumno no tiene enrollment en la academia
- **THEN** la aprobación crea uno ACTIVE con `endsAt` derivado del plan

#### Scenario: rechazo con motivo

- **WHEN** el owner rechaza con `note`
- **THEN** el claim queda REJECTED, no toca el enrollment ni crea
  Payment, y el alumno ve el motivo

#### Scenario: doble resolución

- **WHEN** se aprueba o rechaza un claim no-PENDING
- **THEN** responde 409

### Requirement: Comprobante es evidencia privada

`GET /academies/:id/claims/:claimId/receipt` SHALL servir el archivo
solo a admins de la academia o al dueño del claim (con sesión); los
archivos MUST NOT exponerse por ruta estática ni URL pública — el
comprobante contiene datos bancarios del emisor.

#### Scenario: acceso permitido y denegado

- **WHEN** el owner o el alumno dueño piden el receipt → 200 con el
  archivo
- **WHEN** otro usuario con sesión lo pide → 403; sin sesión → 401

### Requirement: Coexistencia con la pasarela de la plataforma

Los medios BYO y el checkout Flow de membresía SHALL coexistir: una
academia sin métodos propios sigue ofreciendo pago por la plataforma
(modelo passthrough vigente, sin cambios de comisión). Los claims
MANUAL MUST NOT entrar a liquidaciones `Payout` — el dinero nunca pasó
por la plataforma.

#### Scenario: cobro directo no liquida

- **WHEN** un claim MANUAL es aprobado
- **THEN** su `Payment` queda en el libro (`/payments/by-academy`)
  pero no genera `Payout` ni deuda de comisión

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
