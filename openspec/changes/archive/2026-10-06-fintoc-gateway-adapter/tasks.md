# Tasks - fintoc-gateway-adapter

- [x] Puerto: `WebhookContext` opcional en `verifyWebhook`;
  `refreshStatus` gana `ctx.gatewayRef`; `main.ts` `rawBody:true`;
  controllers pasan ctx (webhook + polling).
- [x] `FintocGateway` + spec: createOrder (currency CLP/MXN, metadata),
  verifyWebhook (firma válida/inválida/expirada, fetch-confirm,
  non-terminal → retry vía error), refreshStatus.
- [x] Wiring: `resolveGateways` condicional; `gateway-accounts`
  provider FINTOC + buildAdapter + webhookUrl.
- [x] `.env.example` FINTOC_*; seed doc si aplica; architecture.md
  fila payments; openapi/postman regen; openspec validate; suite;
  commit en `dev`.
