# Handoff — 2026-09-21c — Multi-ticket + claim links por WhatsApp

## Qué quedó implementado (OpenSpec `multi-ticket-claim-links`, 4/4 artifacts)

**Compra multi-entrada con 3 destinos por orden** (`Payment.quantity` 1–10, una sola transacción):
1. Ticket del comprador.
2. `recipientIds` → amigos ACCEPTED registrados (asignación directa + `ticket.gifted`).
3. Sobrantes → **tickets reclamables** (`Ticket.claimToken` 16B hex `@unique`, `claimedAt`, `paymentId`) — el comprador comparte `/reclamar/<token>` por WhatsApp; el destinatario **no necesita cuenta ni amistad**.

**Flujo de reclamo**:
- `GET /api/tickets/claim/:token` **público** → `{buyerName, event:{name,startsAt,venue}}` | 404 (no distingue inexistente de quemado).
- `POST /api/tickets/claim/:token` SessionGuard → `updateMany({id,claimToken})` atómico: `ownerId`=reclamante, `giftedFromId`=comprador, `claimedAt`, token→null. Self-claim 409, no-ACTIVE 409, doble reclamo 404. `notifySafe ticket.claimed` al comprador.
- `POST /tickets/:id/transfer` **quema** claimToken+claimedAt.
- `GET /payments/:id/tickets` owner-only → tickets de la orden (éxito del checkout).
- `/reclamar/[token]` (pública en middleware): landing "X te regaló una entrada" → sin sesión "Crea tu cuenta" → `/login?mode=register&next=/reclamar/<t>`; con sesión botón Reclamar.

**UI**: stepper 1–10 en checkout (checkboxes de amigos capados a `quantity-1`, breakdown "N asignadas · M links"); éxito lista un botón WhatsApp (`wa.me/?text=`) por reclamable; wallet badge "Por reclamar" + "Enviar invitación" (sin QR link en reclamables).

**Compat**: `purchaseTicket` sin `quantity` → default `1+recipientIds.length` (clientes viejos intactos). Tickets históricos: claimToken/paymentId NULL.

**Otros pedidos**: tour QR sin "cada 30 segundos" → "Se renueva solo para que nadie lo copie". Seed: **todo** evento PUBLISHED con shows — vie/sáb 6–7, jue 4–5, resto 2–3 (rosters nombrados + pool genérico determinista por hash de id); verificado 0 sin shows.

## Verificado

- `tsc` API+web limpio · vitest checkout 39/39 (5 nuevos de quantity)
- E2E stub: qty=3 → $16.500 → webhook → 1 propio + 2 claimTokens → claim-info público → claim por 2º usuario (owner/giftedFrom/claimedAt correctos) → doble 404 → self 409 → `ticket.claimed` al comprador
- SSR `/reclamar/<token>` 200 anónimo con datos del evento
- Detector impeccable: 0 findings en UI tocada · docs API regenerados (163 paths) · `docs/flows.md` con diagrama de reclamo

## Gaps conocidos / próximo slice

- **Pago por tarjeta**: sigue pendiente — el puerto `PaymentGateway` existe con `FlowGateway` (Flow soporta tarjetas vía Webpay); falta configurar credenciales Flow + verificación HMAC en producción. No es código nuevo de checkout, es habilitar el gateway real.
- Claim links no expiran (decisión deliberada: mientras el ticket sea ACTIVE y no se transfiera, el link vive).
- Registro vía claim reusa `/auth/register` normal — no hay "tipo nuevo de registro" (decisión del spec: la trazabilidad la da `giftedFromId`, no un flag de signup).
