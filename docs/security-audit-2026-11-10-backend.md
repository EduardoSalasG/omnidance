# Auditoría OWASP backend — 2026-11-10

Lectura estática de `apps/api` (NestJS + Prisma). Muestreo amplio de
controllers, guards, webhooks, pagos, storage, auth y deploy. Confirmado =
evidencia `archivo:línea`; sospecha = depende de datos no verificables.

## ALTO — familia BOLA cross-tenant

Patrón: el guard exige permiso global, el servicio no verifica que el actor
pertenezca al evento. La asimetría con endpoints que sí scopean
(`voidCheckin`, `doorSale`, `requireOwnerOrAdmin`) prueba que es gap.

### A1. Check-ins: registro y manifiesto sin asignación

- `POST /checkins`, `/checkins/sync`, `/checkins/manual` →
  `CheckinsService.register()`/`syncCheckin()` no verifican
  `isStaffAssigned` (`checkins.service.ts:174-233`).
- `GET /events/:eventId/checkins`, `/events/:eventId/door-manifest` →
  `listByEvent`/`doorManifest` tampoco (`checkins.service.ts:235-269`).
- Impacto: staff de cualquier evento registra check-ins MANUAL sin pase en
  eventos ajenos (corrupción de asistencia/analíticas/reputación) y
  descarga manifiestos con PII (nombres, fotos, personIds).
- Fix: `hasWrite && (superuser || isStaffAssigned || event.producerId === actor.id)`
  en register/sync/listByEvent/doorManifest.

### A2. Guest lists sin ownership

- `POST/GET /events/:eventId/guest-lists`, `GET /guest-lists/:id`,
  `POST /guest-lists/:id/entries` — solo `social.manage` global.
- `POST /guest-lists/:listId/entries/:entryId/pass`: el tercer brazo del
  check (`social.manage`) deja emitir EntryPass LIST ($0) en eventos ajenos
  → bypass de ticketing.
- Fix: `event.producerId === me || staffAssignment || admin.access`.

### A3. `GET /events/:id/passes` expone teléfonos

`entry-passes.controller.ts:30-70` pasa con `social.manage` o
`checkins.write` global; la respuesta incluye `person.phone` de cada
asistente de cualquier evento. Fix: mismo scoping.

### A4. Discount codes: sabotaje económico + fuga

- `POST /discount-codes` acepta `eventId`/`seriesId` arbitrarios; `create`
  nunca valida ownership (`discounts.service.ts:175-183`). Código 100% off
  scoped a evento de competidor, redimible.
- `GET /discount-codes` lista todos los códigos sin filtro de ownership.
- `GET /discount-codes/:id/redemptions` expone redenciones ajenas.
- Fix: resolver evento/serie y exigir `producerId === caller || admin`;
  list/detail/redemptions filtrados por ownership salvo admin.

## MEDIO

- **M1. Swagger público en prod** (`main.ts:48-60`): schema completo =
  recon gratis. Fix: gate por env/auth o bloqueo nginx.
- **M2. Magic link no es single-use** (`auth.controller.ts:589-636`):
  GET con efectos (crea Person, consume invites, consentimientos) que
  mintea sesiones ilimitadas por 15min; login CSRF posible (víctima queda
  en cuenta del atacante). Fix: consumir jti o intersticial de confirmación.
- **M3. Settle marca PAID con monto distinto**
  (`payment-settlement.service.ts:285-309`): `AMOUNT_MISMATCH` solo alerta;
  con BYO un actor auto-liquida su orden PENDING con cobro menor.
  Fix: `reported < expected` → `PENDING_REVIEW`, no emitir efecto.
- **M4. `xlsx@0.18.5` con CVEs** (CVE-2023-30533 prototype pollution,
  CVE-2024-22363 ReDoS) parseando uploads de import
  (`academy-import.controller.ts`, cap 2MB/500 filas). Fix: migrar a
  SheetJS CE actualizado o `exceljs`/`read-excel-file`.
- **M5. Exports sin límite propio**: `/query/export.csv|pdf` "sin cap",
  `/events/:id/export.*`, `billing-report.*` construyen datasets/PDFs en
  memoria bajo solo el throttler global. Fix: `@Throttle` estricto (10/60s)
  o cola.
- **M6. `POST /checkins/:id/out`** (`checkins.service.ts:315-329`):
  cualquier `checkins.write` cierra check-ins ajenos. Misma familia BOLA.
- **M7. Buckets compartidos vía Netlify** (confirmado por probe): tráfico
  del PWA por rewrite llega con IP de egreso de Netlify → throttler/lockout
  comparten bucket por egress IP. Fix: ver "exposure" A1/A6 — corregir
  cadena de IPs al unificar front door.

## BAJO

- B1. Sesión JWT 30d sin revocación ni rotación; `deletedAt` sí se
  re-verifica por request.
- B2. WS no re-verifica `deletedAt` (valida JWT una vez).
- B3. `FINTOC_WEBHOOK_SECRET`/`STRIPE_WEBHOOK_SECRET` vacíos degradan la
  firma a HMAC con clave vacía (mitigado por fetch-confirm).
- B4. `sanitizeGatewayPayload` solo enmascara `s`; apiKey Flow y tokens en
  `GatewayTransaction.requestBody`.
- B5. Emails en logs (warnings de auth/producer).
- B6. Rate limits anti-bruteforce en memoria (reset por deploy).
- B7. `internalNext` cubre `//` y `/\` pero no `/%5c…` (open redirect
  teórico en magic flow).
- B8. Datos bancarios de métodos de cobro legibles por cualquier
  autenticado (por diseño del checkout, pero enumerable por id).
- B9. Redis/Postgres del compose dev en 0.0.0.0 sin auth (solo dev).
- B10. `SESSION_SAMESITE=none` habilitable por env sin contramedida CSRF.
- B11. `addStaff` de productor agrega cualquier personId y devuelve
  `person.email` (enumeración débil).

## INFO

- `POST /payments/webhook` legacy sin firma: por diseño fetch-confirm;
  amplificación leve.
- `MERCADOPAGO_BASE_URL`/`FINTOC_BASE_URL`/`STRIPE_BASE_URL` por env sin
  whitelist (riesgo de operador).
- `/payments/mp/subscription-return` público: re-verifica estado remoto,
  replay sin ganancia.
- `X-Request-Id` hasta 128 chars reflejado en header/logs (benigno).

## Verificado OK (no re-auditar)

- OTP: sha256+pepper, TTL 10min, máx 5 intentos, consume-on-success,
  `timingSafeEqual`.
- Passwords scrypt `N=16384,r=8,p=1` autodescriptivo.
- Lockout login 10 fallos/10min email+IP + `@Throttle` 8/60s en
  magic/login/register/otp/verify.
- Errores uniformes anti-enumeración (salvo "account deactivated" post-código).
- Cookie `httpOnly`, `sameSite=lax`, `secure` en prod.
- `role` de magic token restringido a ACADEMY_OWNER|PRODUCER.
- RolesGuard DB-driven con cache+invalidación; `/admin/*` tras
  `admin.access`; `/support` tras SUPPORT|ADMIN.
- `AcademyAccess` aplicado en ~40 endpoints.
- Ownership: `requireOwnerOrAdmin` en eventos; payments/subscriptions
  owner-only; `assertOwnership` en payout-destinations; INTERNAL_ACADEMY
  con 404 uniforme; `platformFeePct` gateado a admin.
- Fintoc HMAC-SHA256 `timingSafeEqual` + tolerancia 5min + fetch-confirm.
- Flow/MP fetch-confirm; consistencia cuenta↔orden/sub.
- Settle idempotente con claim atómico + ledger + advisory lock.
- `$queryRaw`/`$executeRaw` todos parametrizados.
- ValidationPipe whitelist global; DTOs class-validator.
- Uploads: 5MB/2MB, whitelist mimetype, resolve() anti-traversal.
- Credenciales BYO AES-256-GCM con mask; logger redacta claves.
- Privacidad: ratings agregados con umbral; people search solo nombre/foto;
  friends-going solo amigos.
- Cobertura no exhaustiva: `crm`, `gamification`, `classes`,
  `private-lessons`, `trip`, `home`, `mail-campaigns`, `academy-*`,
  `payouts`, `producer-pro`, `practices/venues/table-reservations` quedan
  para una pasada dirigida con la misma lente.
