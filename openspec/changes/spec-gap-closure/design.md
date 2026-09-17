# Design — spec-gap-closure

## Enfoque

Todo es **aditivo sobre schema existente** — cero migraciones: `UserBlock`, `Friendship`, `TableReservation`, `SongSuggestion`, `EventRating`, `PointLedger`, `retroDeclared`, `outAt`/`voidedAt` ya existen. Se agregan controllers + lógica de dominio siguiendo el patrón hexagonal vigente.

## Decisiones técnicas

### Safety / bloques
- `UserBlock` tiene `@@unique([blockerId, blockedId])` → upsert para idempotencia.
- Enforcement en `sessions.invite` y `sessions.declare`: check `blockedId=inviter, blockerId=invitee` antes de crear → `ForbiddenException` genérico ("no se puede enviar la invitación") — nunca revelar el bloqueo.

### Retro-declaradas
- `POST /sessions/declare` reutiliza el flujo de invite (misma validación de evento live, cooldown aplica igual — evita spam manual), setea `retroDeclared:true`, mismo notify.
- Prime Time / reveal / scoring filtran `retroDeclared:false` en las queries del repo de gamificación. Streaks/badges/puntos SÍ las cuentan.

### Check-out y void
- `POST /checkins/:id/out`: owner propio ("me fui") o staff del evento; setea `outAt`. Idempotente (out ya cerrado → 200 sin cambio).
- `POST /checkins/:id/void {reason}`: solo `checkins.write` (staff asignado o admin); setea `voidedAt`+`voidReason`, revierte `Ticket→ACTIVE` si el pase era ticket USED, y `AuditLog` acción `CHECKIN_VOID` — spec exige auditoría.

### Event ratings
- `POST /events/:id/ratings`: upsert por `@@unique([eventId, raterId])`; guard: check-in válido no voided + ventana `endsAt + 24h`.
- `GET .../summary`: agregado `avg`/`count` por dimensión, agrupado por actor (music→dj, occupation+organization→producer, floorComfort+temperature+lightingSound→venue). Umbral de agregación ≥3 evaluaciones (k-anonymity escena chica) — debajo devuelve `exposed:false`. Acceso: productor del evento, admin.

### Friendships
- `Friendship(personAId, personBId, status)` — se guarda siempre con `personAId < personBId` (par ordenado) → unicidad trivial por `@@unique`, queries en ambas direcciones con OR.
- Accept solo por el no-solicitante; decline/unfriend → delete. Notify SOCIAL al destinatario en request.

### Table reservations
- `TableReservation(eventId, personId, partySize, status)` — status `REQUESTED|CONFIRMED|CANCELLED`.
- PATCH solo productor del evento o admin; DELETE solo el solicitante (→CANCELLED). GET del evento devuelve solo CONFIRMED (nombre+partySize).

### Song suggestions
- Checkout DTO +`songSuggestion?` (max 140 chars). Se persiste en `SongSuggestion` **dentro de la tx del webhook PAID** (no en el checkout — solo cuenta con ticket pagado, idempotente vía flag `paidNow` + unique por ticket).
- `GET /events/:id/song-suggestions`: `groupBy song` normalizado (lowercase/trim), top 20, acceso productor/DJ del evento/admin.

### Door sale
- `POST /checkins/door-sale {eventId, channel: CASH|APP, name, phone, personId?}`:
  1. StaffAssignment check (o admin/productor del evento) + `checkins.write`.
  2. Person: find por phone → o create cuenta ligera (name+phone, sin email, rol DANCER APPROVED).
  3. `doorCap` check si definido.
  4. tx: Ticket(doorPrice, serviceFee por canal vía ParamsService `door_cash_clp`/`door_app_clp`, status ACTIVE) + Checkin(method MANUAL, staffId) + Ticket→USED.
- Respuesta incluye `personId` + `qrToken` minteado para que el staff muestre el QR al instante.

### Prime Time reveal
- `GET /events/:id/prime-time/reveal`: si `unlocked` (contador ≥ umbral) → computa por rol: score bayesiano `(Σv + C·m)/(n+C)`, C=10, m=media global del evento; solo sesiones `confirmed+evaluated`, `retroDeclared:false`, mínimo 3 evaluaciones por candidato.
- Pareja de la noche: max del promedio mutuo `(a→b + b→a)/2` donde ambos puntuaron ≥4.
- Persistir resultado? No — computo on-read + corona como `PersonBadge(expiresAt)` otorgada idempotentemente (unique personId+badgeId ya impide duplicados; si existe badge activo no re-otorga).

### Season points
- Tabla de montos en dominio puro (`POINT_VALUES`): session_confirmed=10, rating_closed=5, early_checkin=15, mission_completed=20.
- Idempotencia: `PointLedger` tiene `sourceKey` único por conducta (ej. `session:<id>:confirmed:<personId>`) — upsert/no-op en retry.
- Wiring en los mismos hooks que badges (confirm/rate/checkin/mission progress).
- `GET /gamification/me/points`: total + breakdown por `source` para la Season activa (o `seasonId` null = global si no hay season activa — revisar modelo).

### Badge rules nuevas
- `BadgeAwarder.evaluate` recibe `BadgeStats` extendido: `earlyCheckins`, `maxSessionsInNight`, `maxDistinctPartnersInNight` — el repo computa esos stats; las reglas quedan puras y testeables.

### Featured badge en QR
- `GET /qr/mine` respuesta +`featuredBadge`: PersonBadge con `featured:true` activo, o corona no expirada, o null.

## Riesgos

- **PointLedger.seasonId**: si `Season` no tiene una fila activa, usar `seasonId` nullable — verificar shape real antes de implementar.
- **Score bayesiano**: `m` = media global del evento (no de la plataforma) — escena chica, mejor contexto local.
- **Door sale sin email**: Person requiere `email @unique` — cuenta ligera usa `phone` como identificador; verificar si email es nullable en schema (si no, generar placeholder `light-<phone>@pending.local` — flag para reclamo posterior).
