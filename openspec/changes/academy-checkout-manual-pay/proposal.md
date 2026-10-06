# academy-checkout-manual-pay

## Why

La sección "Pagar a la academia" vive hoy en la ficha pública
(`AcademyPaySection`), separada del checkout de membresía. El alumno
compra un plan por un lado y declara el pago por otro — dos flujos
desconectados. Además, el claim actual nace solo cuando el comprobante
ya está subido (`receiptKey` requerido): el alumno que sale de la app
para hacer la transferencia y vuelve no tiene nada persistido que
retomar, y la academia no ve el intento hasta que el comprobante llega.

## What Changes

- **Checkout de membresía con selector de medio de pago**: si la
  academia tiene métodos activos, el checkout ofrece "tarjeta/Webpay"
  (Flow, comportamiento actual) **o** un método propio de la academia
  (TRANSFER | PAYMENT_LINK | CASH). La rama suscripción (`mode=sub`)
  sigue siendo solo Flow — un método manual no puede cobrar recurrencia.
- **Intento de pago persistido**: nuevo estado `AWAITING` en
  `ClaimStatus` y `receiptKey` nullable. `POST /academies/:id/claims/intent
  {planId, methodId}` crea (o devuelve el existente) el claim AWAITING
  con snapshot de monto/método — el intento queda registrado desde que
  el alumno confirma el medio, y la cola del owner lo muestra.
- **Reanudable**: al volver al checkout del mismo plan, un claim
  AWAITING muestra de nuevo las instrucciones y el upload; uno PENDING
  muestra "en revisión".
- **TRANSFER copiable**: el checkout muestra los datos bancarios del
  método (nombre, RUT, banco, tipo de cuenta, número de cuenta, email)
  con copia por campo y un botón "copiar todos" que arma el bloque
  listo para pegar en la app del banco.
- **Comprobante sobre claim existente**: `POST
  /academies/:id/claims/:claimId/receipt` (multipart) adjunta el
  comprobante a un claim AWAITING del propio alumno → PENDING +
  notificación al owner. `POST .../cancel` elimina un AWAITING propio
  (es borrador sin efecto financiero).
- **Ficha sin sección de pago**: `AcademyPaySection` sale del perfil;
  queda una lista read-only de "mis comprobantes" para visibilidad de
  estado. Los claims existentes siguen válidos (PENDING creados con el
  flujo viejo se aprueban igual).

## Impact

- `apps/api/prisma/schema.prisma`: `ClaimStatus + AWAITING`,
  `PaymentClaim.receiptKey` nullable. Migración versionada.
- `apps/api/src/academies/infrastructure/academy-claims.*`: intent,
  receipt sobre claim, cancel, `listMyClaims` con `planId`/`methodType`,
  `loadClaimForReceipt` tolerante a null.
- `apps/web/.../academias/[id]/checkout/membership-checkout-client.tsx`:
  selector de medio + panel manual (instrucciones, copyboard, upload,
  estados AWAITING/PENDING).
- `apps/web/src/components/academy/`: `academy-pay-section.tsx` →
  queda solo listado propio; `page.tsx` de la ficha lo reemplaza.
- Cola del owner (`claims-queue`): distingue AWAITING (intento sin
  comprobante) de PENDING (accionable).
- Docs: `docs/architecture.md`, `omni-dance.md`, openapi/postman.
