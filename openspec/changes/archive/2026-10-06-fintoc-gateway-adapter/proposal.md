# Change: fintoc-gateway-adapter

## Por qué

Fintoc (A2A CL, bajo costo vs. tarjeta) queda como tercer adaptador del
`GatewayRegistry`: mismo patrón fetch-confirm que MercadoPago, más la
verificación de firma `Fintoc-Signature` (HMAC-SHA256 sobre el body
crudo) — lo que exige extender el puerto con un `ctx` opcional.

## Qué cambia

- `PaymentGateway.verifyWebhook(body, ctx?)` — `ctx = {rawBody?,
  headers?}`; adaptadores existentes lo ignoran. `main.ts` habilita
  `rawBody` para disponer del buffer firmado.
- `PaymentGateway.refreshStatus(refId, ctx?)` — `ctx.gatewayRef` permite
  al adaptador consultar por el id remoto persistido (`cs_…` de Fintoc
  no es buscable por metadata).
- `FintocGateway` (`name: "FINTOC"`, CLP/MXN): `createOrder` =
  `POST /v2/checkout_sessions` flow `payment` con `metadata.refId`;
  `verifyWebhook` valida `Fintoc-Signature` (`t`,`v1`, tolerancia 5min)
  y confirma por `GET /v2/checkout_sessions/:id`; `refreshStatus` por
  `Payment.gatewayRef`. NO implementa `SubscriptionProvider`.
- Registro: `FINTOC_SECRET_KEY` (+`FINTOC_WEBHOOK_SECRET`) en env;
  cuentas propias: provider `FINTOC` (`apiKey`=secret key,
  `secret`=webhook secret).
- `.env.example`, docs (`architecture.md`), openapi/postman regen.

## Fuera de scope

Suscripciones vía Fintoc, disbursements/payouts vía Fintoc, multi-moneda
más allá de CLP/MXN, y endpoints de webhook que no sean
`/payments/webhook/FINTOC` (compartido con cuentas `?account=`).
