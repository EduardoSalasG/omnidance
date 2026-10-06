# Tasks - wallet-passes

- [x] TicketDayOfService + TicketsScheduler (cron 13:00 UTC ≈09:00 CL):
  eventos PUBLISHED/LIVE del día CL → notify ticket.day_of a dueños de
  tickets ACTIVE, dedup por (person, event, día). Spec.
- [x] WalletService: GET /wallet/google → saveUrl (JWT RS256 GenericPass
  lanzador a /qr, env-gated) o 503. Spec.
- [x] Front: TicketWallet acepta pendingOrders (PENDING de
  /payments/mine, orderType TICKET/SERIES_PASS) → cards ámbar "pago en
  validación"; /eventos?view=mios las mergea. Botón "Google Wallet" en
  /qr (oculto si 503). i18n.
- [x] Docs architecture/omni-dance (day-of push, launcher wallet,
  pendiente en validación); openapi/postman regen; openspec validate;
  suite; commit en dev.
