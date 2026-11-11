# Tasks: api-edge-hardening

## 1. Health sin DB

- [x] 1.1 `health.controller.ts`: `GET /api/health` responde proceso sin
  Prisma (`@SkipThrottle` a nivel método); `GET /api/health/db` mueve el
  `SELECT 1` con throttler global (sin SkipThrottle).

## 2. Cooldown de reconcile por webhook

- [x] 2.1 `subscriptions.service.ts`: lock en vuelo + cooldown 60s
  (`reconcileInFlight`/`reconcileLastFiredAt` in-memory); el fire-and-
  forget pasa por un helper que salta si hay sweep corriendo o dentro
  de la ventana.
- [x] 2.2 `platform-subscriptions.service.ts`: mismo patrón sobre su
  `reconcileAll` (lock propio).

## 3. Throttle dedicado (webhooks + exports)

- [x] 3.1 `common/throttle.config.ts`: `WEBHOOK_THROTTLE` (30/60s,
  `THROTTLE_WEBHOOK_LIMIT`) y `EXPORT_THROTTLE` (10/60s,
  `THROTTLE_EXPORT_LIMIT`) exportados, resolvers por env.
- [x] 3.2 `webhook.controller.ts`: `@Throttle(WEBHOOK_THROTTLE)` en
  `POST /payments/webhook`, `/payments/webhook/:provider` y
  `/payments/subscription-webhook`.
- [x] 3.3 `@Throttle(EXPORT_THROTTLE)` en `/query/export.{csv,pdf}`
  (query.controller.ts), `/events/:id/export.{csv,pdf}` +
  `/events/series/:seriesId/export.{csv,pdf}` (events.controller.ts) y
  `/academies/:id/billing-report.{csv,pdf}` (academy-claims.controller.ts).

## 4. Cap por email en auth

- [x] 4.1 `auth.controller.ts`: mapa in-memory `emailSendAttempts`
  (5/hora/email); check `assertEmailSendCap` (ThrottlerException 429)
  al top de `magicLink`/`register`/`resendVerification`; conteo real
  dentro de `sendMagicLink`.

## 5. Swagger gate

- [x] 5.1 `main.ts`: `SwaggerModule.setup` solo si
  `API_DOCS_ENABLED === 'true'` o `NODE_ENV !== 'production'`.
- [x] 5.2 `scripts/export-api-docs.cjs`: mensaje de error documenta el
  flag requerido ante 404.

## 6. Magic token single-use

- [x] 6.1 `schema.prisma`: modelo `MagicTokenUse` (tokenHash @unique,
  email, consumedAt) + `pnpm --filter @omnidance/api prisma migrate dev
  --name magic_token_consumed` (DB docker arriba).
- [x] 6.2 `ports.ts`: `consumeMagicToken({tokenHash,email}) → boolean`
  en `AuthRepo`; `prisma-auth.repo.ts`: create + P2002 → false.
- [x] 6.3 `auth.service.ts`: `verifyMagicToken(token,
  {reuseForPersonId?})` consume vía repo (sin repo → comportamiento
  JWT puro legado); reuso pasa solo si `findById(reuseForPersonId)`
  resuelve una Person con el MISMO email del token → `reused:true`;
  si no, lanza. Devuelve `reused` en el resultado.
- [x] 6.4 `auth.controller.ts` verify: firma `(token, req, res)`; lee
  cookie `omnidance_session` → `verifySession` → personId para el grace;
  `reused` → redirect a next/inicio sin efectos ni cookie.

## 7. Settle conservador

- [x] 7.1 `payment-settlement.service.ts`: helper `isUnderpaid` +
  `flagUnderpaid` (advisory lock + claim `status≠PAID` persistiendo
  campos gateway* + dedup por `AMOUNT_MISMATCH` existente + emite
  STATUS_CONFIRMED/AMOUNT_MISMATCH + aviso admin existente); check en
  cada `settle*` tras `extractGatewayFields` (7 ramas). Resultado
  `{ok:true, status:"PENDING_REVIEW"}`.

## 8. `internalNext`

- [x] 8.1 `auth.controller.ts`: rechaza también `/%` (encoded
  backslash/protocol-relative).

## 9. xlsx → exceljs

- [x] 9.1 `pnpm --filter @omnidance/api add exceljs` + `remove xlsx`;
  `academy-import.controller.ts`: `sheetRows` async con ExcelJS
  (`cell.text` por celda); `.xls` → 400 claro (exceljs solo lee .xlsx);
  handlers await.

## 10. Nginx vhost

- [x] 10.1 `deploy/nginx/omnidance-api.conf`: proxy 127.0.0.1:3002,
  `client_max_body_size 6m`, `limit_req_zone` 10r/s burst 30 +
  `limit_conn_zone`, location `/socket.io/` laxo con timeouts largos,
  timeouts HTTP, cadena IP real `x-nf-client-connection-ip` >
  `cf-connecting-ip` > `$remote_addr` → `X-Forwarded-For`, comentario
  de spoofing documentado.

## 11. Tests

- [x] 11.1 `health.controller.spec.ts`: check no llama prisma; checkDb
  sí (`$queryRaw` spy).
- [x] 11.2 `subscriptions.service.spec.ts`: ráfaga de webhooks → un
  solo `reconcileAll`; sweep en vuelo bloquea; ventana expira → re-dispara.
- [x] 11.3 `throttle.config.spec.ts`: defaults/overrides de
  `THROTTLE_WEBHOOK_LIMIT`/`THROTTLE_EXPORT_LIMIT`.
- [x] 11.4 `auth.controller.spec.ts`: cap por email → 429 uniforme al
  6º envío, mailer llamado 5 veces; `internalNext` con `/%5cevil.com` →
  fallback; magic token reuso sin sesión → 401, con sesión de otra
  Person → 401, con sesión válida misma Person → redirect OK.
- [x] 11.5 `auth.service.spec.ts`: `verifyMagicToken` devuelve
  `reused:false` sin repo; con repo Fake consume y reporta reuso.
- [x] 11.6 `payment-settlement.service.spec.ts`: `reported < expected` →
  no PAID ni efecto + AMOUNT_MISMATCH + aviso admin; `reported >` →
  liquida normal; moneda distinta → revisión; re-notificación misma
  discrepancia → no duplica.
- [x] 11.7 `pnpm --filter @omnidance/api test` verde + `pnpm --filter
  @omnidance/api typecheck`.

## 12. Docs

- [x] 12.1 `docs/qa-flows-inventory.md`: notas de hardening (health,
  webhooks throttle/cooldown, cap por email, magic single-use, settle
  revisión, exports throttle, `.xls` fuera, swagger flag).
- [x] 12.2 `docs/security-hardening-owner-tasks.md`: nota sobre
  `API_DOCS_ENABLED` para export de docs y confirmación del vhost.
