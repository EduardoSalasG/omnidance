# Design: web-edge-hardening

## Enfoque

Dos barreras independientes delante del mismo sink (`<a href>` con dato
de actor): validación en write del API y sanitización en render del
front. La primera impide que entren esquemas no-http a la base; la
segunda protege data histórica ya persistida y cualquier bypass futuro
del write path.

- API: `cleanHttpUrl` en `apps/api/src/common/http-url.ts`, misma
  semántica que `cleanWebsite` (`academies.controller.ts`): sin
  esquema se asume `https://`, se exige `http:`/`https:` y host con
  punto, `undefined` no toca, `""`/`null` limpia. Para
  `details.url` de métodos `PAYMENT_LINK` la validación vive en el
  servicio (`sanitizeMethodDetails`), porque el DTO tipa `details`
  como `@IsObject` opaco y en update el `type` se lee de la fila
  cargada - no del body.
- Front: `safeExternalHref()` en `lib/safe-external.ts` devuelve
  `u.href` solo para `http:`/`https:`; `undefined` en cualquier otro
  caso y el caller omite el anchor. Espejo deliberado de
  `safeInternalPath` (`lib/safe-next.ts`) pero para URLs absolutas.

## Decisiones

- **Rechazo 400 vs null en write**: rechazo. Setear null en silencio
  haría que el owner "guarde" un método de pago cuyo link desapareció
  - peor UX y oculta el intento. Con 400 el actor corrige el dato.
  Datos viejos sin validar quedan cubiertos por `safeExternalHref`.
- **`details.url` no-string** (número/objeto en el JSON libre): 400
  igual - un PAYMENT_LINK con url no-string es malformado.
- **CSP `connect-src`**: `'self'` + `www.googletagmanager.com`,
  `*.google-analytics.com`, `analytics.google.com`, `*.clarity.ms`,
  más `new URL(NEXT_PUBLIC_API_URL).origin` cuando la env esté
  seteada (modo cross-site; vacía en los despliegues proxy). Se
  verificó que todo `fetch` del front va por `apiFetch`/server-side
  a `/api/*` same-origin y que socket.io queda en polling por el
  proxy (`/socket.io/*`, el upgrade ws no pasa) → `wss:` no hace
  falta y sale.
- **SW notificationclick**: el filtro se aplica en el handler del
  click (punto de estrangulamiento único) y no al guardar
  `data.url` en push: notificaciones emitidas por SWs viejos también
  quedan cubiertas. Fallback `/notificaciones` (antes `/inicio`):
  mismo destino que el default del payload.
- **`serverApiUrl`**: el paso 4 (Host header) no se elimina - se
  restringe a hosts loopback exactos (`localhost`, `::1`, IPv4
  `127.x`): sin proxy el header es cliente-supeable y un prefijo
  bastaría (`127.0.0.1.evil.com`) → se compara el hostname pelado con
  exactitud. Loopback es seguro de usar porque el destino queda
  confinado a la propia máquina (cubre `next start` de QA/e2e sin
  envs). En producción con Host ajeno y sin envs → throw explícito
  (B5): nunca derivar la base del request con cookies del usuario.
  `NEXT_PUBLIC_WEB_URL` se inlinea en build y sí llega al serverless,
  así que el fallback ya no se toca en el despliegue real.
- **SWR de landings**: `expireTime` en `next.config.mjs` (Next 15,
  antes `experimental.swrDelta`) agrega `stale-while-revalidate` al
  Cache-Control del prerender que consume la CDN (Netlify edge) sin
  tocar el `max-age=0, must-revalidate` del browser - la opción que
  no rompe el prerender ni cachea en el cliente una página que
  depende de sesión (redirect a /inicio).
- **Logout**: solo `omnidance-pages-v1` (documentos `/staff/*`). El
  cache estático `/_next/*` no es sensible (hashes públicos) y
  borrarlo penalizaría el próximo arranque.
- **Clarity**: `data-clarity-mask="true"` en el contenedor de cada
  bloque con PII/datos bancarios - no página por página. Cubre
  texto e inputs dentro del nodo; los comprobantes se sirven en
  otra pestaña por el API, así que el masking es por lo que la
  página misma muestra (datos de cuenta, nota del pagador).

## Riesgos

- Métodos `PAYMENT_LINK` ya persistidos con url inválida: el método
  sigue listando; solo el anchor se omite en front (defensa en
  profundidad, sin migración).
- `connect-src` acotado: si aparece un fetch a un host nuevo (p.ej.
  un proveedor de mapas distinto a tiles por `<img>`) la CSP lo
  corta - revisar al agregar integraciones client-side.
- `serverApiUrl` sin fallback Host: un despliegue prod sin
  `NEXT_PUBLIC_WEB_URL` falla explícito - es el comportamiento
  buscado, pero es un cambio de contrato de despliegue.
- `browserslist` más moderno: el baseline cubre los navegadores del
  segmento (móvil Chile reciente); verificar build + smoke e2e.
