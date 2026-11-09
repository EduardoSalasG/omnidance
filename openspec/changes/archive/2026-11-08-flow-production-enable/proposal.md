# Flow producción (habilitar endpoint productivo)

## Why

La integración Flow quedó deliberadamente limitada a sandbox:
`FLOW_BASE_URL` debía ser `https://sandbox.flow.cl/api` o el API no
booteaba (fail-close en `resolveGateway`). El flujo E2E contra sandbox
ya fue validado; para cobrar pagos reales en producción hay que
habilitar el endpoint productivo `https://www.flow.cl/api` sin perder
el fail-fast ante URLs inválidas. Bloqueo operativo: el `.env` de la VM
ya apunta a producción y el código actual crashearía el boot en el
próximo deploy.

## What Changes

- `resolveGateway` acepta los dos endpoints oficiales de Flow (sandbox
  + producción) en `FLOW_BASE_URL`; cualquier otra URL sigue fallando
  el arranque con error explícito.
- Spec de `resolveGateway` actualizada: endpoint productivo aceptado,
  URL desconocida rechazada, default sandbox sin cambios.
- Docs sincronizadas: `docs/ci-cd.md` (checklist `.env` de la VM),
  `docs/qa-flows-inventory.md` §0, docblocks que describían
  sandbox-only.

## Capabilities

### Modified Capabilities

- `payments/gateways`: nueva requirement de selección de ambiente Flow
  (los endpoints aceptados pasan de solo-sandbox a whitelist
  sandbox+producción).

## Impact

- `apps/api/src/payments/payments.module.ts` (guard de ambiente).
- `apps/api/src/payments/infrastructure/flow.gateway.spec.ts`.
- `docs/ci-cd.md`, `docs/qa-flows-inventory.md`.
- Operativo: el `.env` de la VM ya tiene `FLOW_BASE_URL=
  https://www.flow.cl/api` + credenciales productivas; deployar este
  cambio habilita cobros reales con Flow.
