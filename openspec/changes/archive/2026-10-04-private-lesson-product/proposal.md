# Change: private-lesson-product

## Why

La clase particular hoy es una solicitud gratuita que el alumno arma a mano
(elige academia, instructor, fecha y hasta el precio sugerido) desde un
escape al final de `/clases`. El modelo de negocio real la trata como un
**producto comprable** al mismo nivel que los planes y la clase suelta:
el alumno paga por adelantado y el **dueño de la academia** asigna fecha e
instructor después. La clase suelta (WORKSHOP) y la particular son el mismo
concepto — "clase individual" — diferenciadas solo por cuántas personas
asisten (N vs 1).

## What Changes

- `Academy.privateLessonPrice Int?`: precio único de la particular,
  configurable por el owner en `PATCH /academies/:id/settings` (null → la
  academia no vende particulares). `GET /academies/:id/profile` lo expone.
- `PrivateLesson`: `instructorId` y `scheduledAt` pasan a nullables (la
  lección pagada nace "por asignar"), `paymentId String?` enlaza la compra.
- Checkout: `POST /checkout/private-class {academyId}` +
  `GET /checkout/private-class-quote?academyId=` — orden `Payment`
  `orderType=PRIVATE`, refId `pvt_<academyId>_<uuid>`, cargo de servicio del
  param `service_fee.membership_clp` (línea academy).
- Settle: rama PRIVATE → al PAID crea `PrivateLesson` `REQUESTED` con
  `instructorId=null`, `scheduledAt=null`, `price`=precio de lista pagado,
  `paymentId`; notifica al owner (debe asignar) y al alumno (pago ok).
- `PATCH /private-lessons/:id` nuevo action `assign` (solo owner/ADMIN):
  body `{instructorId, scheduledAt}` → valida instructor de la academia,
  setea ambos + snapshot `commissionPct`, transiciona → `CONFIRMED`,
  notifica alumno e instructor.
- `POST /academies/:id/private-lessons` queda restringido a staff
  (requireManage): la solicitud libre del alumno desaparece — el alumno
  compra; el staff puede crear manualmente (clase regalada/convenio).
- Payouts: `paymentsByAcademy` atribuye órdenes PRIVATE a su academia.
- UI: se remueve el fallback "clase particular" del final de `/clases`;
  el perfil de la academia muestra la card "Clase particular" junto a los
  planes cuando hay precio configurado → checkout directo; la consola
  staff lista las "por asignar" con form instructor+fecha;
  `/clases/particular` queda como bandeja de estado del alumno (sin form
  de solicitud); `scheduledAt`/`instructorId` nulos se muestran como
  "por agendar"/"por asignar"; `/checkout/return` mapea PRIVATE.

## Impact

- Schema: 2 migraciones de columna (nullable — sin data migration).
- Endpoints nuevos: `POST /checkout/private-class`,
  `GET /checkout/private-class-quote`. Endpoints modificados:
  `PATCH /academies/:id/settings`, `GET /academies/:id/profile`,
  `PATCH /private-lessons/:id` (action assign),
  `POST /academies/:id/private-lessons` (ahora staff-only).
- UI: `/clases` (menos una card), `/academias/[id]`, `/clases/particular`,
  `/academia/particulares`, `/academia` settings, `/checkout/return`.
