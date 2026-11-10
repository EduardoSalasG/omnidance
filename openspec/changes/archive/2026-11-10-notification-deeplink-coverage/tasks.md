# Tasks: notification-deeplink-coverage

## 1. Web

- [x] 1.1 `lib/notification-nav.ts`: `NavNotification` gana
  `category?`; fallback `data.path ?? data.url`; `payment.paid`
  discrimina por payload; `private_lesson.cancelled_paid|sold` →
  particulares; `assigned` por category; familias membership /
  academy.billing+subscription / producer.pro / collections /
  plan_expiring / sale_deal.invited / table / crm operativos /
  admin (user.registered, payment.confirmed|amount_mismatch) /
  class.instructor_assigned; eliminar case muerto
  `academy.private_lesson.purchased`.
- [x] 1.2 `public/sw.js`: `data.url ?? data.path ??
  "/notificaciones"`.

## 2. API (data.path por rama)

- [x] 2.1 `academy-claims.service.ts`: `payment_claim_new` (3
  sitios) → `/academia/cobros/claim/:claimId`;
  approved/rejected → `/academias/:academyId`.
- [x] 2.2 `producer-claims.service.ts`: `payment_claim_new` →
  PLATFORM `/admin/facturacion/comprobantes/:claimId`, productor
  `/productor/comprobantes/claim/:claimId`; approved/rejected →
  `/perfil/pagos`.
- [x] 2.3 `academy-sales.service.ts`: `sale_deal.responded` → path
  con eventId cuando el alcance es evento.

## 3. Tests

- [x] 3.1 `notification-nav.test.ts` nuevo: familias, payment.paid
  polimórfico, discriminación por category, fallback path/url.
- [x] 3.2 Specs de claims/sales: assert del `path` emitido por
  rama (donde haya spec existente; si no, cubierto por typecheck +
  el spec de nav).

## 4. Docs y cierre

- [x] 4.1 `qa-flows-inventory.md` §Notificaciones: mapa ampliado +
  path/url unificado.
- [x] 4.2 `architecture.md`: nota del mapa tipo→destino y la
  convención path/url.
- [x] 4.3 `openspec validate --changes` verde; archivar al
  completar.
