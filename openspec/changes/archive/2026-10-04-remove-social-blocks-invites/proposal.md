# Proposal — remove-social-blocks-invites

## Why

Decisión de producto: el sistema de bloqueo de personas y las
invitaciones a bailar / disponibilidad se eliminan — los bailes solo se
registran vía escaneo QR en la pista. Menos superficie de abuso, menos
código muerto (la UI nunca se expuso) y menos tablas.

## What Changes

- **Elimina** `UserBlock`, `PracticePartnerRequest`, `AvailabilityToggle`
  (modelos + migración DROP TABLE — las `DanceSession` históricas con
  estado INVITED quedan intactas como historial).
- **Elimina** `blocks.controller`, `partner-requests.controller`,
  `availability.controller` y su registro en `social.module`.
- **Elimina** el flujo de invitación de `sessions.controller`
  (`POST /sessions/invite`, `POST :id/confirm`, `POST :id/decline` y el
  chequeo de user-block) — se conservan `mine`, `rate`, `discard`,
  `declare`.
- **Agrega** `POST /sessions/scan` — el escaneo QR crea la
  `DanceSession` directamente `CONFIRMED` (el QR rotativo acredita
  presencia mutua; sin handshake). El escáner web (`/qr`) apunta a este
  endpoint — sin él, los bailes no tendrían alta.
- Limpia referencias web (`amigos/[id]` partnerRequests, types) e i18n.
- Specs canónicas: `safety/user-blocks` se remueve completa;
  `social-modules-scope` ya exige bailes-solo-QR (sin cambio).

## Out of scope

- `POST /sessions/declare` (retro-declarar propio baile) — backlog
  separado, sigue vivo.
