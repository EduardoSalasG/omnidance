# Design: multi-ticket-claim-links

## Context

Hoy: `POST /checkout/ticket {eventId, recipientIds?}` → `Payment{quantity, recipients}` → webhook PAID emite 1 ticket comprador + 1 por amigo (ownerId=amigo, giftedFromId=comprador). `Ticket` ya tiene `ownerId`/`buyerId`/`giftedFromId` — la trazabilidad existe; el reclamo la extiende. `/tickets/mine` filtra por `ownerId`. La app está gated por middleware (público: `/`, `/pro`, `/login`); `/login` ya soporta `?next=`.

Constraints del repo: params operativos en `PlatformParam` (cache 30s); notificaciones vía `notifySafe`; sin `any`; i18n por catálogo; hora local del server (convención `nextDay`/`localMinutes`).

## Goals / Non-Goals

**Goals:**
- Cantidad explícita 1–10 en checkout; amigos ≤ quantity−1; sobrantes reclamables.
- Reclamo público con contexto mínimo (nombre comprador + evento) → CTA crear cuenta/entrar → asignación al POST.
- Share por WhatsApp desde éxito del checkout y wallet.
- Trazabilidad completa sin nuevo estado de ticket.

**Non-Goals:**
- Pasarela de pago real (Flow/Webpay sigue stub — pendiente aparte).
- Revocar/expirar links de reclamo (futuro: `claimExpiresAt` si se necesita).
- Reenvío/notificación al destinatario por el sistema (el comprador comparte el link manualmente).
- Edición del roster de shows por el productor (solo seed/lectura).

## Decisions

**1. Reclamo = `claimToken` en Ticket, no tabla `TicketClaim` ni estado nuevo.**
- Alternativas: (a) `TicketClaim` separado — más joins, duplica evento/precio, requiere migrar al reclamar; (b) `TicketStatus.PENDING_CLAIM` — rompe el invariante "ACTIVE = usable en puerta" y exige cambiar wallet/QR/cap.
- Elegido: ticket ACTIVE con `ownerId=comprador` + `claimToken` único + `claimedAt`. El comprador es dueño legítimo mientras no se reclame (puede compartir el QR o el link — su compra, su riesgo). Al reclamar: `ownerId→reclamante`, `giftedFromId=comprador`, `claimedAt`, `claimToken=null`. Wallet muestra "reclamo pendiente" leyendo `claimToken != null`. Trazabilidad: `buyerId` siempre el pagador; `claimedAt` marca cuándo cambió de manos.

**2. `quantity` explícito en el DTO (default 1), `recipientIds` ≤ quantity−1.**
- Antes quantity se derivaba de recipientIds; ahora el comprador elige. Sobrantes = reclamables. Cambio de contrato backward-compatible (quantity opcional=1).

**3. `GET /tickets/claim/:token` público con payload mínimo.**
- Devuelve `{buyerName, event:{name, startsAt, venue}}` — suficiente para la landing sin exponer ids internos ni el resto del ticket (frontera de privacidad de listados).
- `POST /tickets/claim/:token` bajo SessionGuard: self-claim del comprador → 409; token inexistente/usado → 404 (no distingue para no filtrar existencia).
- Concurrencia: `updateMany({id, claimToken: token})` → count 0 = ya reclamado → 404. Sin race.

**4. `/reclamar/[token]` pública en middleware + client component.**
- Server component fetcha claim info (pública) → landing "X te regaló una entrada para Y". Si hay sesión → botón "Reclamar entrada" (POST); si no → CTAs a `/login?next=/reclamar/{token}` (mismo mecanismo next del middleware). Post-login aterriza de vuelta y reclama con un tap.

**5. Tokens para el éxito del checkout: `GET /payments/:id/tickets`.**
- El éxito ocurre tras PAID; los claimTokens viven en tickets del pago. Nuevo endpoint owner-only que devuelve `{id, claimToken}` por ticket para renderizar links sin exponer la wallet completa.

**6. WhatsApp = `wa.me/?text=` universal (sin número).**
- Abre el share nativo — el comprador elige el contacto; no pedimos teléfonos ni enviamos por API (WhatsApp Business API es overkill y de pago).

**7. Shows para todos los eventos en seed — generador por weekday.**
- Rostros explícitos se mantienen; fallback determinista: `startsAt.getDay()` → vie/sáb 4–5, jue 3, mar/mié 1–2 shows desde un pool de coreografías, offset por índice del evento (sin random — reseed reproducible).

**8. Onboarding: quitar "se actualiza cada 30 segundos"** del step QR en `tours.json` — copy edit menor dentro del mismo cambio (no amerita change propio).

## Risks / Trade-offs

- **Ticket reclamable usable por el comprador** — el comprador podría entrar con él y además compartir el link. Mitigación: al reclamar, `claimToken=null` quema el link; si el ticket ya está USED el reclamo igual transfiere (status queda USED — verificar: rechazar reclamo si `status != ACTIVE` → 409 "la entrada ya fue usada"). Documentado en spec como validación.
- **Links sin expiración** — un token filtrado permanece válido hasta que alguien reclame. Trade-off aceptado en v1 (16+ bytes aleatorios, no enumerable).
- **`GET /payments/:id/tickets` expone tokens** — solo al dueño del pago bajo SessionGuard, consistente con la wallet.
- **Quantity cap de 10 hardcoded** — podría ir a PlatformParam (`checkout.max_tickets_per_order`); v1 constante igual que ArrayMaxSize(9) de recipients. Se registra como mejora futura.
