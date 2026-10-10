# Fix: SSR API URL en Netlify + proxy socket.io

## Por qué

En producción los módulos con fetch server-side siguen fallando
(`/eventos`, detalle, academias, clases, locales, checkouts, `/evaluar`,
`/reclamar`): `serverApiUrl` cae a `http://localhost:4000` porque
`API_PROXY_TARGET` (declarada en `[build.environment]` de netlify.toml)
**no llega al runtime** de la función serverless y `NEXT_PUBLIC_WEB_URL`
no está seteada en el UI de Netlify. Evidencia: `/reclamar/<token-falso>`
renderiza `errorTitle` ("No pudimos cargar la invitación") cuando el API
respondería 404 → `goneTitle`.

Además el polling de socket.io queda en loop 404: el edge normaliza
`/socket.io/` → 308 → `/socket.io` y el path sin barra no matchea
engine.io (Nest responde `Cannot GET /socket.io`).

## Qué cambia

- `lib/server-api.ts`: `SERVER_API_URL` (const module-scope) →
  `serverApiUrl()` request-scope con fallback al **origin del request**
  (`headers()` → `x-forwarded-host`/`host` + `x-forwarded-proto`): la
  propia web sirve `/api/*` por el rewrite — no depende de env vars.
- `netlify.toml`: `[[redirects]]` proxy `/socket.io/*` → API antes del
  runtime Next (preserva el trailing slash).
- 11 call sites actualizados a request-scope.

## Out of scope

- Errores React #418/#423 de consola: se re-evalúan tras el deploy
  (probable efecto del SSR roto o de caché edge con build mixto).
