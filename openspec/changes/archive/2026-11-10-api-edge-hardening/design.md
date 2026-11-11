# Design: api-edge-hardening

## Enfoque

Endurecimiento de borde del API sin tocar contratos: defensas baratas
(throttle por endpoint, caps in-memory, lock+cooldown del reconcile),
cierre de superficies (health sin DB, Swagger gateado, `.xls` fuera) y
dos cambios de semántica acotados: magic token single-use persistido y
settle conservador ante monto reportado menor.

## Decisiones

- **Health**: `GET /api/health` responde `{status, service}` sin tocar
  Postgres y mantiene `@SkipThrottle` a nivel método (el balanceador lo
  sondea); `GET /api/health/db` hace el `SELECT 1` SIN `@SkipThrottle`
  (cae bajo el límite global por IP).

- **Cooldown del reconcile**: estado in-memory por servicio
  (`reconcileInFlight` + `reconcileLastFiredAt`, ventana 60s), misma
  filosofía que `loginAttempts` en auth.controller - suficiente a
  escala monolito; multi-instancia queda para Redis después. Un sweep
  en vuelo impide solapamiento; requests extra responden 200 sin
  ejecutar. Se aplica en `SubscriptionsService.subscriptionWebhook` y
  `PlatformSubscriptionsService.subscriptionWebhook` (cada uno barre su
  tabla; locks independientes). El INBOUND auditado se mantiene siempre.

- **Throttles dedicados**: objetos compartidos en
  `common/throttle.config.ts` (`WEBHOOK_THROTTLE` 30/60s,
  `EXPORT_THROTTLE` 10/60s) con env overrides
  (`THROTTLE_WEBHOOK_LIMIT`, `THROTTLE_EXPORT_LIMIT`) y resolvers
  por-request igual que `AUTH_THROTTLE`. Webhooks: `/payments/webhook`,
  `/payments/webhook/:provider` y `/payments/subscription-webhook` (los
  tres generan llamadas salientes firmadas). Exports:
  `/query/export.{csv,pdf}`, `/events/:id/export.{csv,pdf}` +
  variantes `/events/series/:seriesId/export.{csv,pdf}` (mismo costo) y
  `/academies/:id/billing-report.{csv,pdf}`.

- **Cap por email**: mapa in-memory `emailSendAttempts` (5/hora por
  email destino), mismo patrón `loginAttempts`. El CHECK va al top de
  `magicLink`/`register`/`resendVerification` y lanza
  `ThrottlerException` (429 uniforme, igual al del guard); el CONTEO va
  dentro de `sendMagicLink` (cada correo de acceso real = 1 crédito:
  cubre link+OTP de magic-link, claim de register y resend). En
  multi-instancia se reemplaza por Redis como loginAttempts.

- **Swagger gate**: en `main.ts` el `SwaggerModule.setup` queda
  condicionado a `API_DOCS_ENABLED === 'true' || NODE_ENV !==
  'production'`; `export-api-docs.cjs` documenta el flag en su mensaje
  de error ante 404.

- **Magic token single-use**: tabla nueva `MagicTokenUse`
  (`tokenHash @unique`, `email`, `consumedAt`) - la marca es
  `sha256(token + key)` igual que el hash de OTP (nunca el JWT en
  claro). `AuthRepo.consumeMagicToken()` hace `create` y traduce P2002
  → `false`: el insert atómico ES el claim, cubre la carrera de dos
  verifies concurrentes. `verifyMagicToken(token, {reuseForPersonId})`
  devuelve `reused: boolean`; sin repo inyectado (specs JWT puros) el
  consumo se salta y queda comportamiento legado. En el controller,
  reuso solo pasa si la request trae la cookie `omnidance_session`
  válida de la MISMA Person (email del token === email de la sesión):
  entonces redirect a `next`/inicio SIN re-emitir efectos ni cookie
  (los efectos ya corrieron en el primer verify). En cualquier otro
  caso lanza y cae al 401 uniforme. El `next` del token reusado se
  valida con `internalNext` igual.
  - Tokens de invitación (staff/alumno, TTL días) usan el mismo
    `verifyMagicToken` → también quedan single-use. Es el
    comportamiento deseado: el link de invitación no debe re-usarse
    para emitir sesiones a terceros.
  - `GET /auth/verify` cambia firma a `(token, req, res)` para leer la
    cookie de sesión (grace); los specs manuales se actualizan.

- **Settle conservador**: la marca de revisión es el propio evento
  `AMOUNT_MISMATCH` del ledger (no hay columna/estado adecuado en
  Payment y agregar uno exigiría migración sin ganancia real: la
  resolución es manual admin). En cada `settle*`, tras
  `extractGatewayFields`: `gatewayReportedAmount < payment.amount` o
  `gatewayCurrency` distinta → `flagUnderpaid()`:
  tx con el advisory lock del ledger (`pg_advisory_xact_lock`,
  re-entrante con `emitPaymentEvent`) → claim `status ≠ PAID`
  persistiendo los campos `gateway*` como evidencia → dedup por
  existencia de `AMOUNT_MISMATCH` → emite `STATUS_CONFIRMED` +
  `AMOUNT_MISMATCH` (mismo payload que `emitSettleEvents`, sin
  `SETTLED`) → aviso admin existente. Resultado
  `{ok:true, status:"PENDING_REVIEW"}`. Una notificación posterior con
  `reported >= expected` liquida normal (el reporte corregido manda).
  Se chequea DENTRO de cada `settle*` porque `settleMembership`/
  `settlePlatformSub`/`settlePlatformCharge` también se llaman directo
  desde otros servicios (reconcile/claims), saltándose `settle()`.

- **`internalNext`**: agrega `!next.startsWith("/%")` a la regla
  existente (`//` y `/\` ya rechazados) - cubre `/%5cevil.com` que el
  browser podría normalizar a backslash.

- **`xlsx` → `exceljs`**: `XLSX.read` + `sheet_to_json(header:1)` se
  reemplaza por `ExcelJS.Workbook.xlsx.load` + iteración de filas con
  `cell.text` (equivalente a `raw:false`). `.xls` (BIFF binario legacy)
  NO lo soporta exceljs ni read-excel-file: el upload `.xls` ahora
  responde 400 guiando a guardar como `.xlsx`/`.csv` (desviación
  aceptada - `.xls` es formato pre-2007 raro en las planillas de
  migración reales). `.csv`/`.xlsx` quedan igual; caps de 2MB/500 filas
  sin cambio. `sheetRows` pasa a async (la API de exceljs es promesa).

- **Nginx vhost** `deploy/nginx/omnidance-api.conf`: proxy a
  `127.0.0.1:3002`, `client_max_body_size 6m` (uploads ≤4MB),
  `limit_req_zone` 10r/s burst 30 en `/` + `limit_conn_zone`,
  `/socket.io/` solo con `limit_conn` y timeouts largos (long-lived),
  timeouts cortos en HTTP. IP real: `x-nf-client-connection-ip`
  (Netlify) > `cf-connecting-ip` (Cloudflare) > `$remote_addr`, con el
  comentario de spoofing documentado en el propio conf (x-nf es
  spoofeable en hits directos; aceptado hasta que CF/WAF lo cubra).

## Riesgos

- **Prefetchers de correo** que consumen el magic link antes que el
  usuario: el spec resuelve grace solo con sesión válida de la misma
  Person - el caso scanner-consume/usuario-sin-sesión queda cerrado a
  propósito (pedir link nuevo).
- **Payment PENDING + AMOUNT_MISMATCH** queda visible como "pendiente"
  en las vistas de auditoría; la resolución es manual admin (no hay
  endpoint de resolución en este change - el aviso OPERATIONAL llega).
- **`.xls` rechazado**: usuarios con planillas Excel 97-2003 deben
  re-guardar; el 400 lo dice.
- **`NODE_ENV=test` salta el throttler**: los specs verifican la
  config/los límites, no el 429 del guard.
