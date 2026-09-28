# Handoff — 2026-09-28 (b) — créditos de clase + cancelación con corte

Sigue a `next-session-handoff-2026-09-28.md` (gaps de payments cerrados en `f568efa`).

## Qué quedó hecho

OpenSpec `class-credit-cancellation` (válido `--strict`, tasks completas):

- **Cuota del plan al reservar**: `MembershipPlan.weeklyClasses` (clases/semana ISO lun–dom sobre `Class.date` UTC; `null` = ilimitado) y `classCount` del pack como saldo global. `POST /classes/:id/book` exige inscripción vigente + cuota: orden semanal → pack → ilimitado; sin saldo → 409; clase llena → WAITLIST sin consumir.
- **`ClassBooking`**: `enrollmentId` (qué plan consumió), `cancelledAt`, `refunded`. Consumen crédito `BOOKED` + `CANCELLED` no-refund; no consumen `WAITLIST` ni `CANCELLED` con refund.
- **Cancelación con corte**: `DELETE /classes/:id/book` siempre libera el asiento y promueve waitlist (saltando candidatos sin cuota); `refunded=true` solo si `now ≤ inicio − classes.cancel_refund_minutes` (param operativo, default 60). Respuesta incluye `refunded`.
- **Cascada academia** (desactivar serie / borrar slot): bookings afectados → `CANCELLED` + `refunded=true` siempre.
- **Bug corregido de paso**: "la clase ya pasó" se evalúa contra `Class.date + slot.startTime`, no contra la medianoche UTC — reservar el mismo día vuelve a funcionar.
- **`GET /classes/:id`** → `myCredits {kind, used, limit}` + `cancelRefundMinutes`; `GET /classes/mine` adjunta `credits` por card (por academia+semana).
- **UI**: chip de créditos en CTA de ficha y en cards de `/clases` (mine); book deshabilitado en "Sin clases" (la waitlist sigue disponible si la clase está llena); sheet de cancelar declara consecuencia según ventana; aviso post-cancel refleja `refunded`. Form de planes de academia con "clases por semana" (solo tipos por tiempo); ficha pública de academia muestra "N clases/semana".
- **Seed**: param `classes.cancel_refund_minutes=60` + `weeklyClasses` en planes (1 clase→1, 2 clases→2, ilimitados→null). Migración `20260928133000_class_credits_cancel_policy` aplicada.

## Verificación

- Vitest completo: **51 archivos / 1167 tests verde** (54.7s, pool por worker ya capeado).
- `tsc --noEmit` api + web limpios; `nest build` OK; seed re-corrido idempotente.
- Smoke live: PACK book→cancel → `refunded:true`, `myCredits` 7→6.
- openapi.json/postman regenerados — sin delta de contrato (los DTOs internos no llevan decoradores swagger; consistente con el estilo del repo).
- Fix colateral: el baseline migration tenía un banner "Update available" de la CLI de Prisma pegado al final del SQL — rompía la shadow DB en `migrate dev`. Removido.

## Pendiente

1. **Flujo inscripción+pago del dancer — refinar** (pedido explícito del usuario, quedó diferido): la compra de plan vs. el alta de inscripción como recorrido único.
2. **Replicar patrones dancer → producer / dueño de academia / profesor**: catálogo de patrones del rol dancer (UI social + academia) → OpenSpec por rol → refinar pages y flujos backend donde falten.
3. **Flow sandbox real**: credenciales + alta de tarjeta + checkout autenticado en browser. Producción sigue bloqueado por diseño hasta que eso pase.
