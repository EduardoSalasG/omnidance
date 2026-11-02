# Design: pago por transferencia en suscripciones

## Modelo

- Sub manual NO toca Flow (sin flowSubscriptionId). Estados nuevos:
  PENDING_PAYMENT (alta esperando claim), y en renovación el ciclo se
  representa por Payment PENDING por ciclo (refId con correlativo).
- Vigencia: `currentPeriodEnd` se fija al aprobar el claim del ciclo.
  Sin tarjeta registrada, la sub queda "manual" permanentemente hasta
  que el subscriber registre tarjeta (opcional, migración posterior a
  Flow con consentimiento).

## Datos bancarios

- Membresías: método propio `TRANSFER` de la academia (AcademyPaymentMethod
  existente - el checkout ya sabe mostrarlo para pagos one-off).
- Plataforma: params `platform_billing.transfer.*` (bank, accountType,
  accountNumber, rut, email) editables en /admin/params como el resto
  de la config SaaS.

## Activación

claim APPROVED → Payment→PAID → settle (ledger RENEWAL_SETTLED o nuevo
SUB_ACTIVATED) → sub ACTIVE + primer período + efectos del dominio
(Enrollment / academy.tier). Rechazo → claim REJECTED + sub queda
PENDING_PAYMENT con posibilidad de re-subir.

## Renovación manual

Cron (mismo scheduler de mora/gracia): subs manuales ACTIVE con
currentPeriodEnd en ventana → crea Payment PENDING ciclo N+1 +
notifica. Si vence sin claim aprobado → grace → suspende acceso
(enrollment blocked / billingBlockedAt plataforma).

## Revisión por dominio

- Claims MEMBERSHIP → cola de la academia (academy-deals/claims existente).
- Claims PLATFORM_SUB → cola admin plataforma (soporte/claims existente).
