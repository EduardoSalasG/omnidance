# Handoff 2026-10-17 — slice `producer-gateway-accounts`

## Completado (pendiente commit al momento de escribir - ver git log)

Slice 4/5 del programa de pagos. El productor ahora puede cobrar sus
ventas en **su propia cuenta** Flow/MercadoPago (feeMode `OWN_GATEWAY`):

- **Schema**: `ProducerGatewayAccount` (producerId, provider,
  credentialsEnc, keyMask, status, lastError, verifiedAt) +
  `Payment.gatewayAccountId` + `GatewayTransaction.gatewayAccountId`.
  Migración `20261017000000_producer_gateway_accounts` (aplicada con
  `prisma migrate dev` contra la DB local).
- **`common/secrets.ts`**: AES-256-GCM con `PRODUCER_GATEWAY_KEY`
  (64-hex env; blob `v1.<iv>.<tag>.<ct>`). Fail explícito sin key.
- **`GatewayAccountsService`**: upsert (valida provider FLOW/MP/STUB;
  STUB prohibido en producción; FLOW exige secret; una ACTIVE por
  productor - el upsert desactiva la anterior en la misma tx),
  `activeForProducer`, `adapterFor` (NotFound si inexistente/DISABLED -
  fail-closed), `viewForProducer` (masked + webhookUrl), cache de
  adaptadores por `id+updatedAt` (indispensable: el StubGateway guarda
  tokens en memoria - checkout y webhook deben caer en la misma
  instancia). El onTx envuelto estampa `gatewayAccountId` en
  GatewayTransaction y `lastError`/`verifiedAt` en la cuenta.
- **Checkout**: `purchaseTicket` + `purchaseSeriesPass` resuelven
  `orderGateway(producerId)` → cuenta ACTIVE del productor = su
  adaptador + `ownMethodBreakdown(mode:"OWN_GATEWAY")`; sin cuenta →
  default MANAGED. Academia/membresías/clases/particulares y
  suscripciones siguen por plataforma (`resolveGateway`) - nunca por
  cuenta de productor.
- **Webhook**: `POST /payments/webhook/:provider?account=<id>` -
  `adapterFor` + validación provider-ruta = provider-cuenta →
  `confirm(gateway, body, accountId)`. `confirm` exige
  `payment.gatewayAccountId === accountId` (una cuenta no confirma
  pagos ajenos; la ruta de plataforma tampoco confirma pagos de cuenta
  - ambos mismatch → 400).
- **Polling** `GET /payments/:id`: `gatewayAccountId` →
  `accounts.adapterFor` best-effort (cuenta apagada → null → devuelve
  estado local sin consultar).
- **Endpoints**: `GET|PUT|DELETE /api/producer/gateway-account`
  (SessionGuard + PRODUCER APPROVED o admin.access; respuesta masked).
- **Front**: sección "Mi pasarela" en `/productor/parametros`
  (`components/producer/gateway-account-section.tsx`) - estado +
  webhookUrl + formulario alta/rotación + desactivar con confirmación.

## Verificación

- API `tsc --noEmit` limpio · web `tsc --noEmit` limpio.
- i18n `ALL_KEYS_OK` · impeccable `detect` `[]`.
- Specs nuevos: secrets 6/6, gateway-accounts 7/7,
  producer-gateway.controller 5/5, +1 checkout OWN_GATEWAY (95),
  +6 webhook por cuenta (28), wiring.e2e actualizado.
- Suite completa: **1605 tests, 75 archivos** - el único fallo fue un
  flake propio del spec de secrets (replace del último char podía no
  adulterar); corregido adulterando el tag GCM determinista. Spec
  re-corrido 3x verde.
- `openspec validate producer-gateway-accounts` OK · tasks.md completo.
- Docs: architecture.md (sección cuentas + modelo + fila payments),
  ci-cd.md (`PRODUCER_GATEWAY_KEY` obligatoria, rotación invalida),
  omni-dance.md (credenciales por actor = implementado),
  `.env.example`, openapi.json/postman regenerados (220 paths).

## Pendiente

- **Slice 5/5 `producer-own-methods`**: métodos propios del productor
  (transferencia/efectivo/link) - configuración, selección en checkout,
  claim/confirmación manual, feeMode OWN_METHOD con netting
  `OWN_METHOD_FEE_NET/VAT`, sin tx de pasarela. Es el último slice del
  programa.
- QA funcional del flujo own-gateway contra Flow sandbox real (crear
  cuenta productor con credenciales de sandbox, comprar ticket,
  confirmar por `?account=`).
- Evaluar Fintoc como adaptador A2A (1.35%+IVA vs 3.19% tarjeta) +
  Batch Transfers para payouts - evaluación registrada en conversación.
- Releases: nada promovido a `main` - los 4 slices están en `dev`.

## Notas operativas

- El dev API en :4000 corre con watch - si `prisma generate` falla por
  lock (EPERM query_engine.dll), detener el server y regenerar.
- Ciclo de imports `session.guard ⇄ auth.controller`: los specs que
  importan controllers con SessionGuard deben importar
  `../../auth/infrastructure/auth.controller` primero (patrón
  establecido en events/people specs - aplicado también en
  producer-gateway.controller.spec).
