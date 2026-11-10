# Tasks: web-edge-hardening

## 1. API - validación http(s) en write

- [x] 1.1 `apps/api/src/common/http-url.ts`: `cleanHttpUrl(v, field)`
  espejo de `cleanWebsite` (sin esquema → `https://`, exige http/https
  + host con punto; `undefined` no toca, `""`/`null` limpia, inválida
  → 400) + `sanitizeMethodDetails(type, details)` que aplica la regla
  a `details.url` solo cuando el type es `PAYMENT_LINK` (url
  no-string → 400).
- [x] 1.2 `academy-claims.service.ts`: `createMethod`/`updateMethod`
  sanitizan `details` (update usa `method.type` de la fila cargada).
- [x] 1.3 `producer-claims.service.ts`: idem.
- [x] 1.4 `videos.controller.ts`: `create`/`update` aplican
  `cleanHttpUrl` a `url` (campo requerido - null/vacío → 400).
- [x] 1.5 `payouts.controller.ts` `pay` + `academy-sales.controller.ts`
  `markPaid`: `evidenceUrl` pasa por `cleanHttpUrl` antes de persistir.

## 2. Web - `safeExternalHref` en sinks externos

- [x] 2.1 `lib/safe-external.ts` nuevo + `safe-external.test.ts`:
  http/https → `u.href`; cualquier otro esquema/no-parseable →
  `undefined`.
- [x] 2.2 `own-method-picker.tsx` `OwnMethodDetails` (cubre
  `own-method-claim` y `series-pass-cta` vía componente compartido) y
  `manual-pay-panel.tsx`: `PAYMENT_LINK` renderiza solo con href
  sanitizado.
- [x] 2.3 Videos: `videos.tsx`, `academias/page.tsx`, `video-form.tsx`.
- [x] 2.4 `academias/[id]/page.tsx`: `resolveWebsite` exige
  `http:`/`https:` (B1); `admin/academias/[id]/page.tsx` `infoRow`
  sanitiza `href`.
- [x] 2.5 `evidenceUrl`: `productor/pagos/[id]/page.tsx` y
  `admin/finanzas/page.tsx`; `venue/page.tsx` `pdfUrl` (sin href válido
  la fila queda no-navegable).

## 3. Service worker

- [x] 3.1 `public/sw.js`: `notificationclick` aplica la regla de
  `safeInternalPath` (empieza `/`, no `//`, no `/\`, decodifica `%5c`)
  inline - cualquier otra cosa cae a `/notificaciones`.

## 4. Headers y config SSR

- [x] 4.1 `middleware.ts`: `connect-src` explícito (`'self'` + GTM/GA4/
  Clarity + `NEXT_PUBLIC_API_URL` si seteada); `https:`/`wss:` fuera.
- [x] 4.2 `lib/server-api.ts`: fallback Host restringido a loopback
  (localhost/::1/127.x exactos); prod con Host ajeno y sin envs →
  error explícito; dev → localhost:4000.

## 5. Sesión y masking

- [x] 5.1 `perfil/page.tsx` `logout()`: `caches.delete("omnidance-
  pages-v1")` guardado (`"caches" in window`), antes del redirect.
- [x] 5.2 `data-clarity-mask="true"`: `OwnMethodDetails`,
  `manual-pay-panel` (bloque AWAITING), fichas de comprobante
  (academia cobros claim/orden, productor comprobantes, admin
  facturación), `/perfil` card identidad, `/perfil/datos` card
  personal, `/admin/usuarios/[personId]` dl identidad.

## 6. Perf de borde

- [x] 6.1 `apps/web/package.json`: `browserslist` moderno
  (`>0.3%, last 2 versions, not dead`).
- [x] 6.2 `next.config.mjs`: `expireTime` (SWR de CDN para el HTML
  prerenderizado; `must-revalidate` del browser intacto).

## 7. Tests y cierre

- [x] 7.1 Specs: `http-url.spec.ts` (API) + `safe-external.test.ts`
  (web); spec de `videos.controller`/`payouts`/`academy-sales`
  ajustados (fixture evidenceUrl con host válido).
- [x] 7.2 `pnpm --filter @omnidance/web test` + `tsc --noEmit` (web y
  API) verdes; specs del API tocados en verde.
- [x] 7.3 `docs/qa-flows-inventory.md`: nota de validación de URLs
  externas (métodos PAYMENT_LINK/videos/evidencia) y del click de push.
- [x] 7.4 `openspec validate` verde.
