# Tasks: multi-ticket-claim-links

## 1. Datos y contratos (API)

- [x] 1.1 Schema: `Ticket.claimToken String? @unique` + `claimedAt DateTime?` → `pnpm db:push` + `prisma generate`
- [x] 1.2 `CheckoutTicketDto.quantity Int? 1..10` (default 1, `@IsInt @Min(1) @Max(10)`)
- [x] 1.3 `purchaseTicket`: quantity explícito; `recipientIds.length ≤ quantity-1` → RecipientError; `Payment.quantity = quantity` (sin quantity → default `1+recipients`, compat)
- [x] 1.4 Webhook: emitir `quantity` tickets — comprador + amigos + `quantity-1-R` reclamables (`claimToken` aleatorio ≥16 bytes); `Ticket.paymentId` vincula orden→ticket
- [x] 1.5 `GET /tickets/mine` expone `claimToken` (para badge + share en wallet)
- [x] 1.6 `GET /tickets/claim/:token` público → `{buyerName, event:{name,startsAt,venue}}` | 404
- [x] 1.7 `POST /tickets/claim/:token` SessionGuard: atómico `updateMany({id, claimToken})`; self-claim 409; status≠ACTIVE 409; set `ownerId`, `giftedFromId`, `claimedAt`, `claimToken:null`; `notifySafe` al comprador
- [x] 1.8 `POST /tickets/:id/transfer` limpia `claimToken`/`claimedAt` (quema el link si se transfiere manual)
- [x] 1.9 `GET /payments/:id/tickets` owner-only → `[{id, claimToken, ownerId}]` para el éxito del checkout
- [x] 1.10 Tests spec: quantity en DTO, cap multi, emisión con reclamables (spec service: quantity/clamp/cap/recipients-vs-quantity; E2E cubre claim feliz/self/doble)

## 2. Web

- [x] 2.1 `checkout-client`: stepper cantidad 1–10 + checkboxes de amigos capados a `quantity-1` + submit `{quantity, recipientIds}`
- [x] 2.2 Éxito del checkout: fetch `/payments/:id/tickets` → links `/reclamar/{token}` con botón WhatsApp (`wa.me/?text=`)
- [x] 2.3 `TicketWallet`: badge "Por reclamar" en tickets con claimToken + botón "Enviar invitación" WhatsApp (sin QR link)
- [x] 2.4 `/reclamar/[token]` (pública en middleware): landing con nombre/evento + CTA crear-cuenta/entrar (next=token) + botón "Reclamar" autenticado + estados reclamado/inválido
- [x] 2.5 `tours.json`: quitado "cada 30 segundos" del step QR → "Se renueva solo para que nadie lo copie"
- [x] 2.6 i18n: `parts/claim.json` registrado + keys checkout.qty*/share* y wallet.claim*/sendClaimLink en `es-CL.json`

## 3. Seed + docs

- [x] 3.1 `seed-dev.ts`: rosters explícitos + pool genérico determinista por weekday para TODO evento PUBLISHED (vie/sáb 6–7, jue 4–5, resto 2–3) — verificado: 0 eventos sin shows
- [x] 3.2 `export-api-docs.cjs` → openapi.json + postman regenerados (163 paths)
- [x] 3.3 `docs/flows.md`: diagrama checkout multi-entrada + sección "Entradas reclamables"

## 4. Verificación

- [x] 4.1 `tsc` API+web, vitest checkout (39/39)
- [x] 4.2 E2E stub: compra qty=3 → webhook → 2 reclamables con claimToken; GET público claim-info; segundo usuario reclama → ownership + token quemado + notificación al comprador; doble reclamo 404; self-claim 409
- [ ] 4.3 `impeccable detect` sobre UI tocada; commit → dev → push
