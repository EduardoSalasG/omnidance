# class-credit-cancellation

## Why

El modelo de reservas actual (`ClassBooking` BOOKED/WAITLIST/CANCELLED) no
implementa la promesa comercial de los planes: "Mensual — 2 clases semanales"
es solo copy — `POST /classes/:id/book` exige inscripción vigente pero **no
descuenta ningún crédito**, así que un alumno puede reservar ilimitado con
cualquier plan. La regla de negocio definida — cancelar ≥1h antes devuelve la
clase, <1h la pierde — no tiene un contador sobre el cual operar.

## What Changes

- **Créditos de clase**: `MembershipPlan.weeklyClasses Int?` (clases por
  semana ISO para planes por tiempo; null = ilimitado) y `classCount` sigue
  como total del `CLASS_PACK` por vigencia de la inscripción. `ClassBooking`
  gana `enrollmentId` (qué inscripción consumió), `cancelledAt`, `refunded`
  (el cancel devolvió el crédito o no). Reservar consume: `BOOKED` + `CANCELLED
  con refunded=false` cuentan contra la cuota; `WAITLIST` no consume hasta ser
  promovida. Sin crédito disponible → 409.
- **Política de cancelación**: `DELETE /classes/:id/book` compara `now` contra
  `inicioClase − classes.cancel_refund_minutes` (PlatformParam, default 60):
  dentro de ventana → `refunded=true` y la respuesta lo declara; fuera →
  `refunded=false` (cancela, pierde la clase). El asiento siempre se libera y
  la waitlist promueve — pero la promoción re-chequea cuota y salta al
  siguiente si el candidato está sin crédito.
- **Cancelación por la academia** (desactivar serie, eliminar slot): los
  bookings afectados quedan `CANCELLED` con `refunded=true` — nunca quema
  crédito una cancelación ajena al alumno.
- **UI dancer**: ficha de clase muestra "Te quedan N de M esta semana" (o pack)
  junto al CTA; el sheet de cancelar distingue "recuperas tu clase" vs "la
  pierdes"; el toast refleja `refunded`. `/clases` muestra chip de créditos.
- **Planes**: DTOs de create/edit aceptan `weeklyClasses`; seed actualiza los
  planes (1 clase→1, 2 clases→2, ilimitados→null) + param
  `classes.cancel_refund_minutes=60` en seed-common.

## Capabilities

### New Capabilities

- `academies/class-credits`: cuota de clases por inscripción — semanal (planes
  por tiempo) o total (packs), consumo al reservar, devolución por la política
  de cancelación, enforcement en `book` y en la promoción de waitlist.
- `academies/booking-cancellation`: política de corte para cancelación del
  alumno — ventana configurable, devolución del crédito dentro de la ventana,
  pérdida fuera de ella, y refund garantizado cuando la cancelación la origina
  la academia.

### Modified Capabilities

_(ninguna — no existen specs previas de estas capacidades en openspec/specs/)_

## Impact

- `apps/api/prisma/schema.prisma` + migración versionada (`weeklyClasses`,
  `enrollmentId`, `cancelledAt`, `refunded`).
- `apps/api/src/academies/infrastructure/classes.controller.ts`: cuota en
  `book`, política en `cancel`, `myCredits` en `detail`, promoción con
  re-check de cuota.
- `apps/api/src/academies/infrastructure/class-series.controller.ts`: cascade
  de cancelación con `refunded=true`.
- `apps/api/src/academies/infrastructure/academies.controller.ts`: DTO de
  planes acepta `weeklyClasses`.
- `apps/api/prisma/seed-common.ts` + `seed-dev.ts`: param de corte + cuotas
  en planes demo.
- Web: `class-booking-cta.tsx`, ficha de clase, `/clases`, formulario de
  planes en consola academia (`plans-section.tsx`), strings i18n.
- Tests: specs de `classes.controller` (cuota, cutoff, waitlist skip, cascade
  refund) + e2e del flujo completo.
