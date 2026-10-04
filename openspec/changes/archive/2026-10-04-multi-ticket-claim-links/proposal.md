# Proposal: multi-ticket-claim-links

## Why

El checkout actual permite comprar 1 entrada propia + regalar a amigos registrados (`recipientIds`). Dos brechas reales del flujo:

1. **El comprador no controla la cantidad** — la cantidad se deriva de los amigos marcados; no hay forma de comprar N entradas "sueltas" (pareja, grupo, revender/regalar después).
2. **El destinatario fuera de la app se escapa del embudo** — si la persona no está registrada o no es amiga, hoy la compra se bloquea. En la práctica el comprador igual quiere traerla: necesita un link de reclamo compartible (WhatsApp) — "crea tu cuenta y reclama tu entrada" — que además es el vector de crecimiento más orgánico del producto.

Sin esto, el caso más común de la vida real ("te compro la entrada y te la paso por WhatsApp") no existe en la plataforma.

## What Changes

- **Selector de cantidad en checkout** (1–10): el usuario elige cuántas entradas compra; asigna amigos hasta `quantity-1`; el resto quedan como **entradas por reclamar**.
- **`Ticket.claimToken` + `claimedAt`**: las entradas no asignadas se emiten al PAID con `ownerId=comprador` y un token de reclamo único. La trazabilidad queda en la tabla Ticket existente (`buyerId` original, `giftedFromId` al reclamar, `claimedAt` timestamp).
- **Endpoints de reclamo**: `GET /tickets/claim/:token` (público — renderiza la invitación con evento + quién regaló) y `POST /tickets/claim/:token` (sesión — asigna el ticket al reclamante, notifica al comprador).
- **`/reclamar/[token]`**: landing pública "X te regaló una entrada para Y — crea tu cuenta" → login/registro (con `next` preservando el token) → botón "Reclamar entrada" → la entrada aparece en Mis entradas.
- **Share por WhatsApp**: en el éxito del checkout y en la wallet, cada entrada pendiente de reclamo muestra botón "Enviar invitación" (`wa.me/?text=` con el link).
- **Checkout pide `quantity` explícito** (default 1) además de `recipientIds`; valida `recipientIds ≤ quantity-1`.
- **Onboarding**: quitar del tour de QR la mención "se actualiza cada 30 segundos".
- **Seed**: shows para TODOS los eventos publicados — jueves ≥3, viernes/sábado 4–5 (los que más tienen), mar/mié 1–2; rosters explícitos se mantienen.

No cambia: el pago real por tarjeta (Flow/Webpay sigue pendiente — stub en dev), los estados de Ticket (no se agrega PENDING_CLAIM — el reclamo se modela por `claimToken != null`), ni la emisión al PAID vía webhook.

## Capabilities

### New Capabilities
- `tickets/claim-links`: emisión de entradas no asignadas con token de reclamo, landing pública de reclamo, asignación al registrarse/entrar, notificación al comprador y share por WhatsApp.

### Modified Capabilities
- `checkout-ticket-purchase`: la orden ahora acepta `quantity` explícito (1–10); `recipientIds` pasa a ser asignación dentro de la cantidad comprada; el webhook emite N tickets (comprador + amigos + no asignadas con claimToken).

## Impact

- **DB**: `Ticket` + `claimToken String? @unique` + `claimedAt DateTime?` (db push).
- **API**: `checkout.service` (quantity + validación), `webhook` (emisión N + claimTokens), `tickets.controller` (mine expone claimToken; claim GET público + POST), `GET /payments/:id/tickets` (tokens para el éxito del checkout).
- **Web**: `checkout-client` (stepper de cantidad + share links en éxito), `/reclamar/[token]` (página pública nueva), `TicketWallet` (badge "reclamo pendiente" + botón WhatsApp), `middleware` (ruta pública), `tours.json` (copy QR), `es-CL.json` (keys nuevas).
- **Seed**: generador de shows para todos los eventos por weekday.
- **Docs**: openapi.json/postman regenerados; `docs/flows.md` si el diagrama de compra queda inexacto.
