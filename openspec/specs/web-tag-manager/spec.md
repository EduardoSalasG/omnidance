# web-tag-manager Specification

## Purpose
Carga del contenedor de Google Tag Manager en el documento de la web,
gateado por configuración de entorno, con los permisos CSP mínimos
para que el snippet oficial y su fallback `<noscript>` funcionen.

## Requirements

### Requirement: Container bootstrap en el documento

Cuando `NEXT_PUBLIC_GTM_ID` está definido, TODA página HTML de la web
SHALL incluir el script bootstrap oficial de Google Tag Manager en
`<head>` (antes del primer script externo cargado por la página) y un
`<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=…">`
como primer elemento dentro de `<body>`, ambos con el id de contenedor
configurado. Cuando la variable no está definida, ninguno de los dos
bloques MUST renderizarse.

#### Scenario: ID configurado

- **GIVEN** `NEXT_PUBLIC_GTM_ID=GTM-W9KC3378`
- **WHEN** se sirve cualquier página de la app (marketing o autenticada)
- **THEN** el HTML contiene el bootstrap `gtm.js` en `<head>` con
  `id=GTM-W9KC3378` y el iframe `ns.html` inmediatamente tras abrir
  `<body>`.

#### Scenario: ID ausente

- **GIVEN** `NEXT_PUBLIC_GTM_ID` no está definido
- **WHEN** se sirve cualquier página
- **THEN** el HTML no contiene referencias a `googletagmanager.com` ni
  inicializa `dataLayer` por GTM.

### Requirement: Permisos CSP para el contenedor

La política Content-Security-Policy de los documentos SHALL permitir
scripts desde `https://www.googletagmanager.com` y frames desde el
mismo origen (noscript iframe), sin abrir otros orígenes.

#### Scenario: Documento con CSP

- **WHEN** se sirve cualquier documento HTML de la web
- **THEN** la CSP incluye `https://www.googletagmanager.com` en
  `script-src` y en `frame-src` (o en `child-src`/default aplicable).
