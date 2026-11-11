# Evaluación rendimiento Lighthouse — 2026-11-10

Lighthouse 13.6.0 real contra `https://omnidance.tech` (Chrome headless).
Artefactos: `lh-mobile.json`, `lh-desktop.json` en la raíz del repo.
Alcance: solo landings públicas (`/`); la app autenticada quedó fuera
(`/eventos` → 307 → `/login`).

## Scores

| Categoría | Mobile | Desktop |
|---|---|---|
| Performance | 0.99 | 1.00 |
| Accessibility | 1.00 | 1.00 |
| Best practices | 0.77 | 0.77 |
| SEO | 1.00 | 1.00 |

## Core Web Vitals (lab, mobile simulado Moto G + 4G lenta + CPU 4x)

| Métrica | Mobile | Desktop | Umbral |
|---|---|---|---|
| FCP | 1.3s | 0.4s | <1.8s |
| LCP | 1.3s (el H1 "Si bailas, ya eres de acá") | 0.4s | <2.5s |
| TBT | 120ms | 0ms | <200ms |
| CLS | 0 | 0 | <0.1 |
| Speed Index | 2.0s | 0.5s | <3.4s |
| TTI | 4.7s | 0.4s | — |

TTFB: 408ms observado por Lighthouse; curl ~0.40s en edge hit, ~1.77s frío.
HTML prerenderizado (`X-Nextjs-Prerender: 1`, stale 300) con
`max-age=0,must-revalidate`.

## Peso primera carga: 25 requests / 375 KB

| Recurso | Bytes | % |
|---|---|---|
| gtm.js (GTM) | 185 KB | 49% |
| clarity.js + pings | ~27 KB | 7% |
| JS propio (11 chunks) | ~122 KB | 33% |
| HTML | 19.5 KB | 5% |
| CSS | 10.9 KB | 3% |

Brotli activo, cero webfonts (system stack), cero `<img>` en landing,
polyfills gateados con noModule.

## Lo que ya está bien

- Landings prerenderizadas desde `src/content/*.json` (sin fetch al API).
- JS propio 122KB br, CSS único 11KB, hydration liviana.
- Sin fotos hosteadas por diseño; cards de eventos son texto.
- Lazy loading correcto: leaflet, qr-scanner, driver.js, socket.io por
  `next/dynamic`/`import()` — fuera del bundle inicial.
- `_next/static/*` immutable; SW con cache-first de estáticos y
  network-first solo para `/staff` (offline de puerta).
- Theme boot inline sin FOUC; polling de checkout acotado (~30s máx).

## Oportunidades por impacto

1. **Clarity carga dos veces**: snippet propio (`clarity.tsx` en layout) +
   tag dentro del contenedor GTM `GTM-W9KC3378` → doble beacon + 8
   third-party cookies (única causa del 0.77 en Best practices).
   Fix: una sola vía (config GTM o quitar el snippet).
2. **gtm.js 185KB = 49% de la página**, ~223ms scripting mobile, 66KB sin
   ejecutar. Fix: auditar tags del contenedor (GA4 `G-WRMD1D9BX7` +
   Clarity duplicado + ¿más?), diferir carga post-load/consent.
3. **Third-party cookies deprecadas** (Clarity/Bing) — resuelve el punto 1.
4. **Legacy JS ~11KB** recuperables en chunk principal (polyfills de
   `Array.prototype.at` etc.) — ajustar browserslist.
5. CSS render-blocking 10.9KB — pequeño, no justifica critical CSS inline.
6. **HTML `must-revalidate`** → TTFB ~400-535ms es el mayor componente del
   LCP. Landings solo cambian con `content:sync`+deploy →
   `stale-while-revalidate` a nivel Netlify o subir staleTime/revalidate.
7. Falta `preconnect`/`dns-prefetch` a googletagmanager/clarity — trivial.
8. **Brecha de medición**: la app autenticada no tiene datos de campo.
   Correr `pnpm --filter @omnidance/web analyze` (baseline de chunks,
   `/eventos` page.tsx ~771 líneas es candidata pesada) + Lighthouse con
   sesión (storage state de Playwright) en `/eventos` y checkout; revisar
   INP/LCP real en Clarity.

## Quick wins vs estructurales

- Quick wins: dedup Clarity, limpiar tags GTM, browserslist, dns-prefetch.
- Estructurales: diferir/condicionar GTM, SWR de landings, medición en
  campo de la app autenticada (bundle analyzer + Lighthouse con sesión +
  RUM vía Clarity).
