# Tasks - producer-own-methods

- [x] Schema + migración `producer_own_methods`: `ProducerPaymentMethod`
  (producerId, type, label, details, order, active) + `TicketClaim`
  (paymentId, personId, producerId, receiptKey, snapshots, status,
  review audit).
- [x] `ProducerClaimsService` (métodos + claims): CRUD + list activos por
  productor (misma semántica que AcademyPaymentMethod).
- [x] Checkout: `methodId` en ticket + series-pass → Payment PENDING
  MANUAL/OWN_METHOD + instrucciones en la respuesta; sin pasarela.
- [x] `TicketClaimsService`: create (dueño + orden MANUAL PENDING),
  cola del productor (`ProducerClaimsService`), receipt autenticado, approve (atomic + settle),
  reject (motivo + notify).
- [x] Endpoints: `/producer/payment-methods*` (CRUD),
  `/events/:id/payment-methods`, `/payments/:id/claims` (buyer),
  `/producer/claims*` (cola + approve/reject + receipt).
- [x] Front: selector de medio en checkout evento/serie + instrucciones
  + upload; sección métodos en `/productor/parametros`;
  `/productor/comprobantes` + card en hub; i18n.
- [x] Specs: checkout own-method (Payment OWN_METHOD sin pasarela),
  claims (create/approve/reject/guards), settle PAID vía aprobación.
- [x] Docs: `docs/architecture.md` + `omni-dance.md` + tasks.md +
  openspec validate + suite completa + commit dev.
