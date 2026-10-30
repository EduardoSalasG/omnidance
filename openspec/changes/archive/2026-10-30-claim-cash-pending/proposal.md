# Change: claim-cash-pending

## Why

El método CASH (efectivo en clase) no tiene comprobante que subir:
exigir el upload AWAITING→PENDING deja el intento huérfano en la app
del alumno sin camino a la cola del owner.

## What Changes

- `POST /academies/:id/claims/intent` con método CASH crea el claim
  directo en `PENDING` (plan y particular) y notifica al owner con el
  mismo `payment_claim_new` del upload de comprobante.
- El panel muestra el estado pendiente con copy propio para efectivo
  ("pago por validar", no "comprobante en revisión").

## Impact

- `academy-claims.service.ts` (ambas rutas de intent + helper de
  notificación), spec test nuevo, `manual-pay-panel.tsx`, keys ×4.
