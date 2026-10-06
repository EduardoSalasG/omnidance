# academies/payment-claims — deltas

## ADDED Requirements

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
