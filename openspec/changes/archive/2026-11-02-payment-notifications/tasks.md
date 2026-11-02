# Tasks; payment-notifications

- [x] 1. Revisar enum Notification + tipo kind usado por los
  notification-creators existentes; definir `payment.confirmed` (o
  reutilizar).
- [x] 2. MailerService: template receipt one-off (producto, nº tx,
  monto, medio, fecha, asociado) - revisar templates existentes y
  convención (resend/ses?).
- [x] 3. Hook en settle PAID (one-off): tras updateMany claim
  ganador, enqueue mail pagador + Notification admin (post-commit,
  idempotente por payment.id - el mail no debe duplicarse en
  re-notificación).
- [x] 4. Mismo hook en settle PLATFORM_SUB: mail al owner del
  academy con datos del plan/invoice.
- [x] 5. Specs: settle dispara exactamente 1 mail + 1 notification
  por PAID (idempotencia en re-webhook/polling).
- [x] 6. Smoke dev: compra one-off stub/flow → mail log +
  Notification admin en /admin o inbox.
- [x] 7. docs/qa-flows-inventory.md + flows.md si aplica.
