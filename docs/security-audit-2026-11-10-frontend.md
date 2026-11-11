# Auditoría seguridad frontend — 2026-11-10

`apps/web` (Next.js 15.5.28 / React 19.3.1, App Router, PWA), `netlify.toml`,
middleware, service worker y sinks del API. Método: grep/glob/read + headers
verificados por el agente padre con curl.

Postura general buena: CSP en middleware, cookies
`httpOnly`+`Secure`+`SameSite=Lax`, `safeInternalPath` en todos los `next=`,
JSON-LD escapado, sin tokens en storage. Sin ALTOS confirmados.

## MEDIO

### M1. URLs de actores sin validación de esquema → sinks `href`

- `details.url` de métodos `PAYMENT_LINK` persiste sin validar
  (`academy-claims.controller.ts:153-154`, `academy-claims.service.ts:91-99`,
  `producer-claims.controller.ts:54-55,166-171`) y se renderiza crudo en
  `own-method-picker.tsx:67-75`, `manual-pay-panel.tsx:356-365`,
  `series-pass-cta.tsx:258`. Expuesto a cualquier autenticado vía
  `GET /events/:id/payment-methods` / `GET /academies/:id/payment-methods`.
- `video.url` idem (`videos.controller.ts:26`, renders en `videos.tsx:208`,
  `academias/page.tsx:278`).
- Mitigación real: React 19 bloquea `javascript:` en href/src/action;
  Chrome/Firefox bloquean `data:` top-level. Queda: esquemas no-http que
  React no cubre (`file:`, handlers custom), phishing por dominio parecido.
- Atacante: owner academia, staff con capability, productor APPROVED.
- Fix: validar `https?:` en write (`cleanHttpUrl`, espejo de `cleanWebsite`)
  + helper front `safeExternalHref()` en los 3 renders.

### M2. Login CSRF — magic link GET reutilizable

`verifyMagicToken` es JWT puro, no consumible (`auth.service.ts:83-106`);
`GET /auth/verify` crea/upserta + setea cookie. Un atacante entrega su propio
link a la víctima → queda logueada en la cuenta del atacante (datos que suba
— comprobantes, perfil — caen ahí). `SameSite=Lax` viaja en GET top-level.
El OTP sí es single-use — la asimetría es notable.
Fix: consumir jti / single-use, o intersticial "Continuar como {email}".

### M3. CSP ancha

- `connect-src 'self' https: wss:` (`middleware.ts:80-98`) permite
  exfiltración a cualquier host → acotar a orígenes reales.
- `script-src 'unsafe-inline'` anula protección anti-XSS de la CSP
  (decisión documentada por scripts inline de Next; con GTM presente el
  nonce parcial aportaría poco — mejora, no bug).
- Falta `require-trusted-types-for 'script'` (evaluable a futuro).
- Clickjacking cubierto doble: `frame-ancestors 'none'` + `X-Frame-Options`.

### M4. SW `notificationclick` abre `data.url` sin whitelist

`sw.js:98-132` pasa `data.url`/`data.path` directo a `clients.openWindow`.
Emisores actuales solo mandan paths internos, pero el sink queda expuesto
ante un emisor futuro con entrada de usuario (push phishing con branding
real). Fix: misma regla `safeInternalPath` que `notification-nav.ts`.

### M5. Clarity sin masking explícito en superficies sensibles

Montado global en `<head>`; graba páginas/inputs por defecto. Superficies:
login, /perfil (email, teléfono), consolas de cobros con datos bancarios,
/admin/usuarios. Cero `data-clarity-mask` en el código; masking depende del
dashboard (no verificable). GTM = inyección arbitraria en el origen
(riesgo de gobernanza del workspace); `connect-src https:` agrava.
Fix: masking estricto en dashboard + `data-clarity-mask` en
comprobantes/PII + revisar permisos del workspace GTM.

### M6. Magic tokens de invitación: TTL días + reutilizable

Combinación con M2: reejecutar el link re-emite sesión y dispara
`consume` de la invitación vía bridge/toast.

## BAJO

- B1. `resolveWebsite` acepta esquemas no-http (`ftp:`, `file:`,
  `javascript://host/`); write path sí sanea (`cleanWebsite`). Exigir
  `protocol in {http:, https:}`.
- B2. `payout.evidenceUrl` sin validación de esquema (escribe admin,
  renderiza productor) — mismo fix.
- B3. `VenueMenu.pdfUrl` renderizado; write path no encontrado (seed/admin).
  Validar al agregar edición.
- B4. Páginas `/staff/*` cacheadas por el SW sobreviven al logout
  (`omnidance-pages-v1`; logout no limpia caches). Fix: `caches.delete` en
  logout o filtrar por sesión.
- B5. `serverApiUrl()` fallback a Host header (`lib/server-api.ts:22-38`):
  si faltan envs, el fetch SSR sale del Host del request con cookies del
  usuario. En prod la env está inlineada — riesgo solo si config cambia.
  Fix: eliminar paso 4 o whitelist.
- B6. `GET /payments/:id` dispara settle (GET con efecto, owner-only,
  idempotente — impacto casi nulo).
- B7. JWT sesión 30d sin rotación/revocación.
- B8. Logout no cierra socket realtime (la recarga lo cierra de facto).

## INFO

- Headers: `nosniff`, `XFO DENY`, `Referrer-Policy`, `Permissions-Policy`
  acotada. Faltan COOP, `report-uri`/`report-to`, `payment=()`. HSTS lo
  inyecta Netlify (sin includeSubDomains ni preload).
- `omnidance_lens` cookie JS-legible: hint de UI 5min, no sensible.
- `NEXT_PUBLIC_*` todas públicas por diseño; `.env` no en repo.
- `productionBrowserSourceMaps` ausente → default false (verificar en prod).
- Deps mínimas y legítimas; `pnpm.overrides` pinnea CVEs; Next ≥15.5.7
  (post middleware-bypass); `onlyBuiltDependencies` a 5 paquetes.
- Gates client-side son solo UX; el API re-verifica.
- Magic link apunta a `WEB_URL` de env, no de input.

## Verificado OK

- JSON-LD escapa `<` → `\u003c`; `dangerouslySetInnerHTML` solo en
  constantes/snippets de build.
- `safeInternalPath` rechaza `//`, `/\`, `%5c`; aplicado en login,
  bienvenida, notification-nav y API `internalNext`. Payment callbacks a
  `WEB_URL` + paths fijos.
- Mutaciones por métodos no-GET; cookie Lax no viaja en POST cross-site;
  socket.io auth por cookie same-origin.
- `target="_blank"` con noopener/noreferrer; iframes con `sandbox`+`srcDoc`;
  cero handlers postMessage.
- QR scanner: valor va al body del POST, nunca a URL.
- Notification deep links: destinos fijos por `type` + fallback sanitizado.
- SW cache: solo `/_next/static/` y documentos `/staff`; `/api/*` nunca.
- Push: VAPID por env, `userVisibleOnly`, endpoints muertos se limpian.
- 401 → `me=null` por contexto; socket `authRejected` no reintenta.
- Middleware: públicos por whitelist, `badLocalePrefix` sin bypass.
- `poweredByHeader: false`.
