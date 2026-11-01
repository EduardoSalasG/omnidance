# Proposal; payment-notifications

## Why

Tras el e2e Flow verificado, las transacciones no generan
notificaciones propias de la plataforma: el pagador solo recibe el
comprobante de Flow (email info@flow.cl, sin datos del producto),
el dueño de academia no recibe respaldo del cobro SaaS, y el admin
no se entera de pagos entrantes. Hace falta notificación propia con
los datos del producto comprado para seguimiento posterior.

## What Changes

- **Mail al pagador (todas las órdenes one-off)**: TICKET,
  SERIES_PASS (pase de temporada), SOCIAL_PASS (top-up),
  MEMBERSHIP (plan de academia), CLASS (WORKSHOP), PRIVATE_CLASS.
  Contenido: nº de transacción (payment.id / gatewayRef), nombre del
  producto, monto CLP, moneda, medio (gatewayMedia), fecha, evento/
  academia asociada, estado. Se dispara al settle PAID
  (PaymentSettlementService.emitSettleEvents ya es el punto único de
  verdad del pago; hoy NO usa MailerService).
- **Mail al academy owner** al PAID del PLATFORM_SUB SaaS
  (suscripción del plan): plan, ciclo, monto, período, nº invoice.
- **Notification in-app al admin** por cada PAID: tipo
  `payment.confirmed` (o existente del enum), con orderType, monto,
  medio, actor pagador. Modelo Notification existe (schema:1869).

## Hook points conocidos

- `PaymentSettlementService.emitSettleEvents` (payment-settlement.
  service.ts ~258-400): único punto donde la orden pasa a PAID con
  gatewayData completa → ideal para disparar mails (post-commit,
  fire-and-forget o job BullMQ para no acoplar latencia al webhook).
- `MailerService` existe y se usa en academies/admin/auth (no en
  payments aún).
- `PlatformSubscriptionsService.settle` liquida los invoices
  PLATFORM_SUB → mismo patrón.
- Notification enum/tipos actuales revisar en notifications.service.ts
  + schema (kind/type usados por academy-reminders/claims).

## Fuera de scope

- Notificación al productor/instructor por venta de ticket (solo el
  pagador + admin según pedido).
- Push notifications / WhatsApp.
- Mails de FAILED/reembolso.
