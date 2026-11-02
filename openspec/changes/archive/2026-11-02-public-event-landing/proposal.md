# public-event-landing

## Why

El productor quiere un link público compartible de su evento para
captar por redes/WhatsApp: landing del evento sin sesión, CTA compra
→ registro/login → vuelve al link normal `/eventos/:id` (post-auth el
flujo es el estándar de siempre). Precedente: `/reclamar/<token>`.

## What Changes

- Middleware: `/e` entra a PUBLIC_PREFIXES.
- Página `/e/[id]` (marketing, pública): landing del evento via
  `GET /events/:id` (ya público) + CTA "Comprar entrada" →
  `/login?next=/eventos/[id]` (registro→login→redirect normal).
- El productor comparte `/e/:id` desde su consola (link de captación).

## Capabilities

### New Capabilities

- `events/public-landing`: landing pública de captación por evento.

## Impact

- middleware.ts, nueva page (marketing)/e/[id], i18n, link en consola
  productor. Sin cambios de API ni schema.
