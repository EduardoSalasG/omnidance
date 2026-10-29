# Design; add-gtm

## Decisiones

- **Snippet oficial, no `@next/third-parties`**: el usuario pegó el
  snippet canónico de Google; replicarlo con
  `dangerouslySetInnerHTML` + `<noscript>` evita una dependencia nueva
  (regla del repo: preguntar antes de sumar deps). El script es inline,
  así que cabe en la CSP actual (`'unsafe-inline'`); solo se abre
  `script-src`/`frame-src` para `googletagmanager.com`.
- **Componente `<GoogleTagManager/>` en `apps/web/src/components/gtm.tsx`**:
  un server component que devuelve `null` si `NEXT_PUBLIC_GTM_ID` no
  está seteado; exporta `GtmScript` (head) y `GtmNoScript` (body) o un
  par de exports nombrados. El layout raíz los monta: script como
  primer hijo de `<head>`, noscript como primer hijo de `<body>`.
- **Env var, no constante**: `NEXT_PUBLIC_GTM_ID` permite no medir en
  dev/staging y cambiar de contenedor sin redeploy de código. Valor
  real `GTM-W9KC3378` en `netlify.toml` `build.environment` (mismo
  patrón que `NEXT_PUBLIC_WEB_URL`); se documenta en el bloque de
  comentarios de env vars del toml.
- **CSP mínima**: `script-src … https://www.googletagmanager.com` y
  nueva directiva `frame-src https://www.googletagmanager.com`.
  `connect-src https:`/`img-src https:`/`style-src 'unsafe-inline'` ya
  cubren los beacons e inyecciones de estilo de los tags. Tags que
  carguen scripts de dominios propios (p.ej. Meta pixel) requerirán
  ampliar `script-src` cuando se configuren; documentado, no
  pre-agregado.
- **dev sin eval**: `script-src` en dev suma `'unsafe-eval'` ya
  existente; la CSP del snippet no cambia por entorno.

## Orden en el documento

`<head>`: `GtmScript` antes del `THEME_BOOT_SCRIPT` (Google pide "lo
más arriba posible"; el theme script es síncrono y su orden relativo es
irrelevante). `<body>`: `GtmNoScript` antes de `NextIntlClientProvider`.

## Riesgos

- CSP rota → tags no cargan. Mitigado por el escenario de spec + smoke
  manual en preview/deploy.
- Contaminación de datos en dev → mitigado por el gate por env var.
- El iframe noscript violaría CSP sin `frame-src` → incluido.
