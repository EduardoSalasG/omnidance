# spec-gap-closure

## Why

La spec de producto (`omni-dance.md`) define ~50 entidades y un roadmap completo. El build actual cubre el core (auth, QR, sesiones, check-ins, ticketing, social, academias, gamificación básica, RBAC, admin), pero **el schema ya tiene ~70 modelos con campos preparados que ningún endpoint usa** (`retroDeclared`, `outAt`, `voidedAt`, `UserBlock`, `EventRating`, `Friendship`, `TableReservation`, `SongSuggestion`, `Payout`, `SeriesPass`, `PointLedger`, `StreakFreeze`, `actor_tag`, `campaign`, `crm_trigger`, `RelationshipScore`…). Cerrar esos gaps completa el core loop de la spec (fases 0–3) antes de expandir a SaaS/CRM.

## What Changes

### Slice A — Core loop y safety (esta ola)
- `user_block`: endpoints block/unblock/list + enforcement en `sessions.invite` (silencioso: el bloqueado solo ve "no se puede enviar") — spec §4 Safety.
- Bailes retro-declarados: `POST /sessions/declare` marca `retroDeclared:true`, requiere confirmación mutua, **excluido del contador Prime Time** — spec §4.
- "Me fui": `POST /checkins/:id/out` setea `outAt`; cierre explícito de asistencia — spec §8.
- Anular check-in: `POST /checkins/:id/void` con `voidReason` + AuditLog (staff, `checkins.write`) — spec §10 reglas operativas.
- Event ratings: `POST /events/:id/ratings` (solo asistentes con check-in, editable dentro de ventana ~24h post-evento) + `GET` agregado por dimensión para productor — spec §5.

### Slice B — Social y ticketing (esta ola)
- Friendships: `POST/GET /friends`, request + accept/decline + lista — spec §8.
- Table reservations: `POST /events/:id/table-reservations`, `GET` productor, PATCH confirm/cancel — spec §8/§13.
- Song suggestions: campo opcional en checkout + `GET /events/:id/song-suggestions` top-N para productor/DJ — spec §8/§13 DJ.
- Venta en puerta: `POST /checkins/door-sale` — staff crea cuenta ligera (nombre+teléfono) si no existe, registra venta cash (`service_fee.door_cash_clp`) o marca compra app (`door_app_clp`), emite ticket + check-in — spec §10 Caso B.

### Slice C — Gamificación profunda (esta ola, backend)
- Prime Time reveal: `GET /events/:id/prime-time/reveal` — ganadores Leader/Follower por score bayesiano + "Pareja de la noche"; otorga corona 👑 (`PersonBadge` con `expiresAt` +1 semana) — spec §6/§7.
- Season points: accrual en `PointLedger` por conductas (sesión confirmada, rating cerrado, check-in temprano, misión cumplida) — spec §7.
- Badge rules adicionales: madrugador (check-in <23:00), maratonista (15+ sesiones/noche), mariposa social (8+ parejas únicas/noche) — spec §7.
- Featured badge en payload QR: `GET /qr/mine` incluye badge destacado o status activo (corona) — spec §7 exhibición.

### Backlog documentado (NO en esta ola — quedan como specs para próximas)
- Entry pass issuance desde guest lists (self-service "list" + artist/staff/comp).
- Payouts: compute + mark paid (liquidación productor/academia).
- Series pass purchase; trip matching; reports/verification safety endpoints.
- CRM: actor_tag, campaign, crm_trigger, relationship_score compute, segments, funnel, LTV.
- Academias avanzado: private_lessons, videos, academy_score, workshop sales, reportes.
- Producer event CRUD completo (crear evento/serie, lineup, staff assignment).
- Infra spec §16: WebSocket gateway (contador Prime Time live, invitaciones), BullMQ jobs (expiry sweeps, crm triggers, rating windows), Web Push send, analytics_event writes, Google OAuth, Sentry.

## Capabilities

### New Capabilities
- `safety/user-blocks` — bloqueo entre bailarines y enforcement en invitaciones.
- `sessions/retro-declared` — declaración retroactiva con exclusión de Prime Time.
- `events/event-ratings` — evaluación del evento con atribución por actor.
- `social/friendships` — amistades entre bailarines.
- `events/table-reservations` — reserva de mesa por evento.
- `events/song-suggestions` — sugerencia de canción en checkout + top-N.
- `checkins/door-sale` — venta en puerta con cuenta ligera.
- `gamification/prime-time-reveal` — reveal de ganadores + corona + pareja de la noche.
- `gamification/season-points` — accrual de puntos de temporada.
- `gamification/badge-rules` — reglas de conducta adicionales.

### Modified Capabilities
- Ninguna (no hay specs existentes; el resto del sistema queda como baseline implícito).

## Impact

- **API**: ~10 controllers nuevos/extendidos; `sessions`, `checkins`, `events`, `gamification`, `payments`, `social` módulos; `admin` audit actions nuevas (`CHECKIN_VOID`).
- **Schema**: sin cambios — todas las entidades/campos ya existen.
- **Web**: endpoints consumibles en siguiente ola front (esta ola es API-first; `/bailes` y consolas se actualizan después).
- **Contratos**: aditivos — ningún endpoint existente cambia shape salvo `GET /qr/mine` (campo extra `featuredBadge`) y `POST /checkout/ticket` (campo opcional `songSuggestion`).
- **Anti-gaming**: retro-declared no alimenta Prime Time; event ratings solo con check-in validado — reglas §5 respetadas.
