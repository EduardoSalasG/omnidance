# Change: web-wave-2 — frontend del backlog + landing de conversión

## Why

La ola `backlog-wave` entregó los endpoints; falta la superficie web:
consola del productor completa, CRM UI, academia avanzada, superficies
consumidor (matches de viaje, pase de serie) y notificaciones en tiempo
real. Además la landing debe convertir (menos es más) y ser SEO-ready.

## What changes

| Slice | Scope | Archivos |
|---|---|---|
| F1 landing+seo | Conversión + SEO | `Landing.tsx`, `layout.tsx` metadata, `sitemap.ts`, `robots.ts`, JSON-LD |
| F2 producer | Consola eventos | `app/productor/eventos/**`, `components/producer/**`, payouts view, ops por evento (pases, sugerencias, reservas, ratings, staff) |
| F3 crm | CRM UI | `app/crm/**`, `components/crm/**` — people/tags/campaigns/triggers |
| F4 academia | Lecciones+videos | `components/academy/private-lessons.tsx`, `videos.tsx`, `app/academia` |
| F5 consumer | Matches+pase | `app/viajes` (matches), `app/eventos/[id]` (series-pass CTA) |
| F6 realtime | WS + push | `lib/realtime.ts`, `components/realtime/**`, push opt-in + `public/sw.js` |

## Constraints

- i18n: cada agente escribe `src/i18n/parts/<ns>.json` (fragmento propio);
  el padre mergea a `messages/es-CL.json`. NADIE toca `es-CL.json`.
- `layout.tsx` es de F1; F6 entrega `RealtimeProvider` y el padre lo wirea.
- Design system existente: átomos `components/ui` (Button, Card, Badge,
  PriceTag, EventDate), dark theme + neon, mobile-first, `active:scale`,
  `focus-visible`, `prefers-reduced-motion`, `text-white/50` mínimo AA.
- apiFetch (`src/lib/api.ts`) para toda llamada; rutas bajo `/api`.
- Estado de carga/vacío/error en cada superficie; confirmaciones para
  acciones destructivas.
