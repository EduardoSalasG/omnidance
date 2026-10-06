# academy-payment-claims

## Why

Feedback de cliente real: la academia ya cobra por su lado (MercadoPago,
transferencia, efectivo) y no quiere otra comisión — lo que necesita es
**orden**: saber quién pagó, quién vence y a quién recordar. Hoy el cobro
externo existe solo informalmente (el staff marca `Enrollment.endsAt` a
mano tras ver el comprobante por WhatsApp). La propuesta: la academia
publica sus medios de pago, el alumno paga por fuera y sube la captura,
el owner la valida y la vigencia se extiende sola. Academias sin medio
propio siguen cobrando por la plataforma (Flow, passthrough vigente).

## What Changes

- `AcademyPaymentMethod` (nuevo): medios de pago por academia —
  `TRANSFER` (datos bancarios), `PAYMENT_LINK` (URL: MercadoPago,
  Flow u otro) y `CASH` (instrucciones). CRUD del owner, orden y activo.
- `PaymentClaim` (nuevo): comprobante subido por el alumno
  `{academyId, personId, enrollmentId?, planId?, amount, methodType,
  methodLabel, receiptKey, status, note}` — PENDING → APPROVED/REJECTED.
- Storage de archivos (nuevo módulo `src/storage`): puerto + adaptador
  de disco local (mismo patrón que video-repo): `UPLOADS_DIR` env,
  `storageKey` en DB, archivos servidos por endpoint autenticado —
  los comprobantes son evidencia financiera privada, no estáticos.
- Endpoints nuevos bajo `/academies/:id`:
  - `GET /payment-methods` (sesión: métodos activos para el alumno),
    `POST/PATCH/DELETE` (owner/admin) para el CRUD.
  - `POST /claims` (alumno: multipart imagen/PDF + planId?, amount,
    methodType, note?) → claim PENDING + notificación al owner.
  - `GET /claims?status=` (owner: cola de validación),
    `GET /claims/mine` (alumno: sus propios claims).
  - `POST /claims/:claimId/approve` (owner) → tx: claim APPROVED +
    `Enrollment.endsAt` extendido con `membershipBase`+`membershipEndsAt`
    (misma regla del webhook Flow) + `Payment{orderType:"MEMBERSHIP",
    gateway:"MANUAL",status:PAID}` para el libro de cobros +
    notificación al alumno. Sin enrollment previo → se crea.
  - `POST /claims/:claimId/reject {note}` → REJECTED + notificación.
  - `GET /claims/:claimId/receipt` → stream autenticado del
    comprobante (owner de la academia o dueño del claim).
- Web:
  - `/academia/cobros`: card "Medios de pago" (CRUD) + sección "Pagos
    por validar" (ver comprobante, aprobar, rechazar con motivo).
  - `/academias/[id]`: sección "Pagar a la academia" con los métodos
    activos (datos de transferencia copiables, botón al link,
    instrucciones de efectivo) + formulario "subir comprobante" +
    estado de mis comprobantes.
- Deploy: `UPLOADS_DIR` en `.env.example`/workflow/VM (`/data/omnidance`
  en el disco especial), volumen en docker-compose dev, docs ci-cd.

## Capabilities

### New Capabilities

- `academies/payment-claims`: medios de pago configurables por academia
  y validación de comprobantes con extensión automática de vigencia.

### Modified Capabilities

- (ninguna — Payment MANUAL y extensiones de endsAt reusan contratos
  existentes)

## Impact

- `schema.prisma` (+2 modelos, +enum, relaciones) + migración.
- API: módulo `storage` nuevo, `academy-claims.controller.ts` +
  `academy-claims.service.ts`, tests (unit vigencia ya cubierta;
  spec del service + e2e del flujo completo).
- Web: `academy-payments.tsx` (o nuevo), `academias/[id]/page.tsx` +
  componente claim-upload, i18n (`academyExtras.json`, nuevo part).
- Ops: `UPLOADS_DIR`, volumen compose, `docs/ci-cd.md`, `docs/flows.md`.
