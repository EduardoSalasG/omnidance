# Handoff — 2026-09-17 (post-olas paralelas "completa toda la app")

## Estado verificado

- **API**: 13 módulos Nest montados en `AppModule`, **443/443 tests** (21 archivos), `tsc` limpio.
- **Web**: **18 rutas**, `tsc` limpio, `next build` verde, las 14 páginas responden 200 en dev.
- **E2E real**: magic-link → sesión → checkout con descuento → webhook stub → ticket ACTIVE → redención → idempotencia. Fee flat $500 verificado en quote.
- Rama: `dev`. Último commit: `667a41a`.

## Módulos API (todos bajo `/api`)

| Módulo | Endpoints clave |
|---|---|
| auth | magic-link, verify, **logout**, /me |
| qr | GET /qr/mine (rotativo 60s) |
| events | GET /events, /events/:id |
| sessions | invite/confirm/decline/discard/mine/rate + cooldown 4min |
| checkins | scan QR, manual, lista por evento (STAFF/ADMIN) |
| payments | POST /checkout/ticket, webhook idempotente, GET /payments/:id, /tickets/mine |
| discounts | CRUD códigos (PRODUCER/ADMIN) + redemptions |
| notifications | centro in-app + push-tokens |
| social | rsvp, guest-lists, waitlist, practices, trips |
| academies | mine/create/plans/enrollments/students/slots/dashboard/attendance |
| admin | role-requests approve/reject + POST /roles/request |
| gamification | streak, badges, progress, leaderboard, prime-time, missions |

## Rutas web (18)

`/`, `/eventos`, `/eventos/[id]` (PrimeTime+RSVP+checkout CTA), `/eventos/[id]/checkout`, `/entradas`, `/escanear`, `/bailes`, `/qr`, `/login`, `/perfil`, `/notificaciones`, `/practicas`, `/viajes`, `/staff`, `/staff/[eventId]`, `/academia`, `/productor`, `/admin`. BottomNav global (oculta en escáneres/login).

## Decisiones de integración tomadas

- **Cargo por servicio = flat $500 CLP** (`SERVICE_FEE.PRESALE_CLP` en shared, overridable por `SERVICE_FEE_CLP` env). Se cambió `PricingService` de % a flat — spec manda.
- **Webhook `refId`** = order-ref `tkt_<event>_<code>_<uuid>` embebido en `stub://pay/<refId>` (NO el paymentId). El cliente lo extrae de paymentUrl.
- **Badges** shape: `[{badge:{key,name,category}, awardedAt}]` anidado.
- e2e `events` hecha autocontenida (fixture propio) — eliminado flake por DB compartida.

## Gaps conocidos (backlog priorizado)

### Schema (requieren migración)
- `Checkin.note` (cortesías manuales no persisten); constraint DB para doble check-in abierto.
- `Event.venueId` requerido → prácticas sin venue (parque/plaza) bloqueadas; spec lo quiere opcional.
- `GuestListEntry.createdAt` falta; `Academy.isDemo` falta.
- `RoleStatus` sin `REJECTED` (reject borra la fila); `EnrollmentStatus` sin `CANCELLED`; `Enrollment` sin `endsAt`.
- `PushToken.platform` vive dentro de `payload Json`.
- `Payment` sin `eventId`/`discountCodeId` (contexto va en refId codificado).

### Endpoints faltantes
- `GET /me/rsvp` (mi RSVP — hoy INTERESTED es session-only en el front).
- `GET /venues` (los inputs de venueId son texto crudo en /practicas y /productor).
- `PracticePartnerRequest` y `AvailabilityToggle` sin endpoints (matchmaking pendiente).
- Ticket transfer/gift sin endpoint ni UI.

### Wiring de dominio pendiente
- `NotificationsService.notify()` existe pero nadie lo llama (sessions confirm, payment paid, waitlist promote deberían notificar).
- Badge award es lazy (evalúa al consultar) — falta hook desde sessions/confirm.
- `SessionStatus.RATED`/`CLOSED` definidos pero sin uso.
- Missions: endpoint existe, sin UI.

### UX/datos menores
- Check-in vía EntryPass llega con `ticket:null` → staff lo muestra como "sin entrada" (ámbar).
- `GET /academies/:id/attendance` devuelve `personId` crudo (sin join a persona).
- `SUPPORT` falta en `profile.roleLabels` (cae a raw).
- Sin "hasta" en catálogo para rangos de fecha (viajes reusó labels existentes).

### Ops/QA
- `primeWindow`/`madrugador` usan TZ local del server — fijar America/Santiago en deploy.
- Flow gateway implementado (HMAC) pero no probado contra API real — stub en dev.
- Offline-first staff (IndexedDB) y cola de sync — TODO en código, sin implementar.
- Otras suites e2e pueden seguir corriendo contra DB compartida — mejorar aislamiento.
- PWA offline/cámara: falta QA en dispositivo real.

## Comandos

```bash
pnpm install && pnpm --filter @omnidance/shared build   # shared → dist (requerido por API)
docker compose up -d                                     # pg :5433, redis :6379
pnpm --filter @omnidance/api dev                         # API :4000 (/api prefix)
pnpm --filter @omnidance/web dev                         # Web :3000
cd apps/api && npx vitest run                            # 443 tests
```
