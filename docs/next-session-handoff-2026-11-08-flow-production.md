# Handoff 2026-11-08 - Flow en producción (v1.15.6)

## Estado

Branch `dev` pusheada a origin. `main` = `006546a7` (release 1.15.6) +
tag `v1.15.6` pusheados. Deploy run `42546592570` success en 7m40s.
Working tree limpio al cierre salvo lo que agregue este handoff.

## Hecho esta sesión

### Auditoría de envs de prod (ejecutada y corregida)

Se compararon `.env` local, `.env.example`, `docs/ci-cd.md` y el
código contra las tres fuentes reales:

- **VM** `/opt/apps/omnidance/.env` vía SSH (`deploy@146.181.44.133`,
  clave `~/oracle_deploy_github` local; solo se leyeron nombres de
  claves, longitudes y valores no sensibles).
- **GitHub secrets** vía `gh secret list` (solo nombres).
- **Netlify** vía `netlify env:list` (CLI ya autenticado).

El usuario aplicó las correcciones en prod: keys reales de Flow,
`FLOW_BASE_URL=https://www.flow.cl/api`, typo `FINTOC_SECERT_KEY`→
`FINTOC_SECRET_KEY`, removidas las `NEXT_PUBLIC_*` muertas y
`REDIS_URL`, `NEXT_PUBLIC_CARTO_BASEMAP_KEY` agregada a Netlify.

### Change `flow-production-enable` (archivado como
`2026-11-08-flow-production-enable`)

- `payments.module.ts`: el guard de `resolveGateway` pasó de
  solo-sandbox a **whitelist** `{https://sandbox.flow.cl/api,
  https://www.flow.cl/api}`; default sandbox; URL desconocida sigue
  haciendo fail-fast al boot. Sin esto, el `.env` productivo
  crasheaba el próximo deploy.
- `flow.gateway.spec.ts`: describe `resolveGateway (ambiente Flow)` -
  prod aceptada, desconocida rechazada, sandbox default intacto (TDD:
  RED confirmado antes de implementar).
- Delta aplicado a spec canónica `payments/gateways` (requirement
  "Selección de ambiente Flow").
- Docs en el mismo cambio: `ci-cd.md`, `qa-flows-inventory.md` §0,
  `.env.example`; post-archivo también `architecture.md` línea Flow.

## Verificación (evidencia)

- `pnpm vitest run src/payments`: **29 archivos, 718/718 tests**.
- `pnpm --filter @omnidance/api typecheck`: exit 0.
- `openspec validate --changes`: 2/2 verde.
- Deploy: tests + build + imagen + migrate/seed + recreate + health
  gate + sonda HTTPS, todo verde.
- Prod vivo: `/api/health` 200, `/api/me` 401; logs del contenedor
  sin error del guard (Flow routes mapeadas).
- **Smoke Flow prod** (desde dentro del contenedor, firmado HMAC):
  `payment/getStatusByCommerceId` con commerceId inexistente →
  `400 {"code":1700,"message":"Transaction not found"}` = respuesta de
  negocio válida (auth + firma + endpoint productivo OK).
- Endpoints públicos que Flow invoca, desde internet: `POST
  /payments/webhook` → 400 validando; `GET /payments/order-return` →
  303 → `omnidance.tech/checkout/return`; `POST
  /payments/flow/customer-return` sin token → 303 → error fallback.

## Gaps conocidos (quedan abiertos)

- **Checkout real con tarjeta** (task abierta en el change): único
  tramo no probado; requiere compra chica manual. Verificar que Flow
  POSTee a `urlConfirmation` (PAID sin depender de polling) y que el
  `urlReturn` vuelva logueado a `/checkout/return`.
- **`PRODUCER_GATEWAY_KEY` sigue ausente en el `.env` de prod**:
  `PUT /producer/gateway-account` fallará cuando un productor
  configure su pasarela. `openssl rand -hex 32`.
- **`NEXT_PUBLIC_CARTO_BASEMAP_KEY`**: ya está en Netlify pero se
  inlinan en build; toma efecto en el próximo deploy del web (o
  rebuild manual). Hasta entonces los mapas usan Esri Dark Gray.
- Menores en prod `.env`: `SESSION_SECURE` (lo cubre
  `NODE_ENV=production`), `GOOGLE_WALLET_*` (503 graceful),
  `MAIL_FROM` (cubre `EMAIL_FROM`).
- `.openspec-archive.lock` stale del 6-nov removido; si vuelve a
  aparecer, mismo fix.

## Notas operativas para la próxima sesión

- `git` no está en el PATH del shell MSYS: usar
  `export PATH="/mingw64/bin:$PATH"` (o `C:\Program Files\Git\bin`).
- SSH prod: `ssh -i ~/oracle_deploy_github deploy@146.181.44.133`;
  `.env` en `/opt/apps/omnidance/.env`; contenedor `omnidance-api`.
- Netlify CLI autenticado: `cd apps/web && netlify env:list`.
- Zombie `next dev` visto otra vez: node.exe ~8 GB reteniendo :3000
  sin responder; fix documentado en AGENTS.md (matar PID + borrar
  `.next`).
- Stack dev dejado corriendo: API :4000 + web :3000 (Postgres/Redis
  en docker). En dev `FLOW_BASE_URL` sigue en sandbox vía `.env` raíz.

## Pendientes del usuario (vienen de handoffs anteriores)

- Modelo de video (categorías/selects, videos como add-on cobrado).
- Tracking de campañas (funnel enviados→tap→acción; `campaignId` en
  push + evento de apertura).
- Ads/conversión en Explorar + disponibilidad de instructores.
