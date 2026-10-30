# Change: private-class-checkout

## Why

La compra de clase particular hoy es un botón inline (BuyPrivateClass →
POST /checkout/private-class → stub poll o redirect). No tiene página
de checkout: sin revisión de orden, sin selección de medio de pago de
la academia, sin el patrón CTA-al-final + toast que ya es estándar en
membresía y eventos.

## What Changes

- Nueva page `/academias/[id]/checkout/particular`: mismo layout del
  checkout de membresía (quote card "Clase particular", medio de pago,
  breakdown, CTA al final) usando `GET /checkout/private-class-quote` +
  `POST /checkout/private-class`.
- `BuyPrivateClass` pasa a navegar a ese checkout (ya no compra inline).
- Claims manuales soportan la particular: `PaymentClaim.kind`
  ("PLAN" | "PRIVATE_CLASS"), `POST /academies/:id/claims/intent`
  acepta `{privateClass: true}` (amount = privateLessonPrice snapshot),
  reanudación por kind, y al aprobar materializa la PrivateLesson
  "por asignar" (misma lógica que el settle PRIVATE de pasarela).
- ManualPayPanel generaliza su contrato: `planId` | `privateClass`.
- Toast + returnHref al subir comprobante (mismo estándar).

## Impact

- API: PaymentClaim (+kind, migración), academy-claims intent/approve,
  checkout (reuso del settle PRIVATE para el claim aprobado).
- Web: nueva page + client del checkout particular, BuyPrivateClass
  → navegación, ManualPayPanel generalizado.
- i18n: keys nuevas del page (title, breakdown, CTA) ×4.
