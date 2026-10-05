## 1. Schema + migración + params

- [x] 1.1 `schema.prisma`: `MembershipPlan.weeklyClasses Int?`, `ClassBooking.enrollmentId/cancelledAt/refunded`; migración `20260928133000_class_credits_cancel_policy` aplicada.
- [x] 1.2 `seed-common.ts`: param `classes.cancel_refund_minutes = 60`. `seed-dev.ts`: weeklyClasses en planes (1 clase→1, 2 clases→2, ilimitado/VIP/largos→null).

## 2. Cuota + política en API (TDD)

- [x] 2.1 Tests rojos en `classes.controller.spec.ts`: book con cuota agotada → 409; waitlist no consume; re-book tras refund consume de nuevo; promoción salta al WAITLIST sin cuota; pack agotado → 409; ilimitado nunca bloquea.
- [x] 2.2 `classes.controller.ts`: resolución de inscripción con cuota (semanal → pack → ilimitado), `enrollmentId` en la reserva, conteo por (person, academy, semana ISO).
- [x] 2.3 Tests rojos de cancelación: `refunded` por corte (≥cutoff true / <cutoff false), cancel de WAITLIST no marca refunded=false, respuesta declara `refunded`. Implementado cutoff con `ParamsService` + `cancelledAt`.
- [x] 2.4 Cascade academia: `deactivate` serie + `deleteSlot` → `refunded=true, cancelledAt` en bookings afectados. Test en `class-series.controller.spec.ts`.
- [x] 2.5 `GET /classes/:id` → `myCredits` + `cancelRefundMinutes`. Test.

## 3. Contratos y UI

- [x] 3.1 DTOs de plan (create/PATCH) aceptan `weeklyClasses`; `plans-section.tsx` campo clases/semana.
- [x] 3.2 `class-booking-cta.tsx`: chip de créditos, copy del sheet según ventana, toast por `refunded`. Ficha pasa `myCredits`.
- [x] 3.3 `/clases` (mine): `credits` por card (cuota de la semana de la clase). i18n parts actualizados.
- [x] 3.4 openapi.json + postman regenerados (184 paths).

## 4. Cierre

- [x] 4.1 `vitest` spec de classes + suite completa 51 archivos/1167 tests verde; `tsc --noEmit` api+web limpio; build API OK; smoke live PACK book→cancel OK.
- [x] 4.2 `openspec validate class-credit-cancellation --strict` válido; `architecture.md` (param + cuota) + `flows.md` (secuencia reserva/cancelación) + `omni-dance.md` (regla de producto) actualizados.
