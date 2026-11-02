# Handoff; payment-notifications implementado + verificado

**Rama**: `dev` · commit `f451e0b1` · working tree limpio.

## Estado

Change `payment-notifications` implementado, verificado y archivado
(`archive/2026-11-02-payment-notifications`, spec canónica en
`openspec/specs/payments/notifications/spec.md`).

## Implementación

- `PaymentSettlementService.emitPaidReceipts(payment, gw, product)`:
  llamado dentro de cada bloque `if (paidNow)` de las 6 ramas del
  settle (TICKET, SERIES_PASS, MEMBERSHIP, WORKSHOP, PRIVATE,
  PLATFORM_SUB) → el claim atómico `updateMany` garantiza una sola
  vez por Payment.
  - Notification OPERATIONAL `payment.confirmed` a cada PersonRole
    ADMIN APPROVED (data: paymentId, refId, orderType, amount,
    currency, media, payerId).
  - Mail de resguardo al pagador vía `MAILER` (ResendMailer, puerto
    de `auth/domain/ports`) - best-effort en try/catch: el PAID ya
    es la verdad. Pagador sin email → solo la notificación admin.
- `paymentReceiptEmailHtml` en
  `apps/api/src/payments/infrastructure/receipt-emails.ts` (misma
  convención `emailShell`/`escapeHtml` de auth/emails + renewal-emails).
- `media`/fecha se leen de `gw` (verdad recién persistida); el objeto
  `payment` en memoria es previo al update.
- MAILER como 4º param requerido del ctor: actualizadas las 8
  instanciaciones en specs (stub `{send: vi.fn()}`).

## Verificación

- Spec `payment-settlement.service.spec.ts`: 31/31 (6 nuevos:
  mail con producto/monto/medio/nº tx, payment.confirmed a admins,
  no-dup en re-webhook, PLATFORM_SUB con invoice, pagador sin email,
  FAILED sin efectos). Suite payments completa: 662/662.
- `npx tsc --noEmit` api: limpio.
- Smoke real contra stack local (PAYMENT_GATEWAY=stub,
  RESEND_API_KEY vacía): Payment smokepaynotif2 → webhook STUB PAID
  → 1 mail logueado (`Respaldo de tu pago - 1 entrada · Baila
  Cubano con Bachata · $8.000`) + 5 Notification payment.confirmed
  (admins APPROVED); re-webhook → duplicated, 0 efectos extra.

## Hallazgos / fixes colaterales

- `checkout.service.spec.ts` tenía aserción returnUrl obsoleta
  (`/checkout/return` vs `/api/payments/order-return` desde
  1505eda4): corregida; suite payments quedó en 662/662 (era 661+1
  fallo preexistente).
- `kill_shell` deja el node huérfano (EADDRINUSE al reiniciar):
  `taskkill //PID <pid> //F` si :4000 queda ocupado.

## Pendiente (sin cambio desde handoff anterior)

- Smoke membresías de alumnos (path idéntico a PLATFORM_SUB,
  confianza alta).
- `customer/collect` de Flow (cobros plataforma→actor): no
  implementado, requiere change nuevo.
- multipais-foundation tasks 10/11/13 (pases multi-día, socials
  free, congresos): diseño ya en el change, implementación futura.
- PENDING huérfanos de smokes previos en DB dev (sin limpiar;
  smokepaynotif1/2 quedaron PAID con sus tickets/notifications).
