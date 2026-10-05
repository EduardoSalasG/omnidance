# Tasks — spec-gap-closure

Orden por slice; cada tarea lleva verificación propia (TDD donde aplique).

## Slice A — Core loop y safety

- [x] **A1 user-blocks**: `BlocksController` (`POST /blocks`, `DELETE /blocks/:personId`, `GET /blocks`) + enforcement en `sessions.invite` y `sessions.declare` → e2e.
- [x] **A2 retro-declared**: `POST /sessions/declare` + filtro `retroDeclared:false` en queries de Prime Time/leaderboard/reveal del repo gamificación → e2e contador excluye.
- [x] **A3 check-out**: `POST /checkins/:id/out` (owner o staff) idempotente → e2e.
- [x] **A4 void check-in**: `POST /checkins/:id/void {reason}` staff-only + revert ticket + `AuditLog CHECKIN_VOID` → e2e.
- [x] **A5 event-ratings**: `POST /events/:id/ratings` (check-in + ventana 24h, upsert) + `GET /events/:id/ratings/summary` (agrupado por actor, umbral ≥3, productor/admin) → e2e.

## Slice B — Social y ticketing

- [x] **B1 friendships**: `FriendsController` (request/accept/decline/list) con par ordenado + notify → e2e.
- [x] **B2 table-reservations**: `POST /events/:id/table-reservations`, `GET` (solo CONFIRMED), `PATCH` producer/admin, `DELETE` solicitante → e2e.
- [x] **B3 song-suggestions**: `songSuggestion?` en checkout DTO → persistir en tx webhook PAID; `GET /events/:id/song-suggestions` top-20 para productor/DJ/admin → e2e.
- [x] **B4 door-sale**: `POST /checkins/door-sale` — cuenta ligera por phone, ticket por canal (params door_cash/door_app), check-in MANUAL, doorCap, qrToken en respuesta → e2e.

## Slice C — Gamificación

- [x] **C1 reveal**: `GET /events/:id/prime-time/reveal` — bayesiano por rol (C=10, m=media evento), min 3 evaluaciones, excluye retroDeclared, pareja de la noche, corona `PersonBadge(expiresAt +7d)` idempotente → unit + e2e.
- [x] **C2 season-points**: `PointLedger` accrual idempotente por `refType`/`refId` en hooks (confirm/rate/checkin-early/mission) + `GET /gamification/me/points` → unit + e2e.
- [x] **C3 badge-rules**: madrugador / maratonista / mariposa_social en `BadgeAwarder` + stats del repo + seed de los 3 badges → unit tests de reglas puras.
- [x] **C4 featured-badge**: `GET /qr/mine` +`featuredBadge` (featured activo > corona vigente > null) → e2e.

## Integración (padre)

- [x] Registrar controllers en módulos (`*.module.ts` es exclusivo del padre).
- [x] `GET /me` o payload QR: verificar shape final del featured badge.
- [x] Regenerar `docs/openapi.json` + colección Postman (`scripts/export-api-docs.cjs`) — 95 paths.
- [x] Actualizar `docs/flows.md` (nuevas secuencias: door-sale, reveal, points, blocks/friends, out/void). `architecture.md` sin cambios (tabla es por módulo, no por controller).
- [x] Seed: badges madrugador/maratonista/mariposa_social + corona prime_time_crown (en `seed-common.ts`, params `early_checkin.cutoff_minutes`, `prime_time.*`).
- [x] Suite completa (635/635) + typecheck + smoke (21/21) + commit por scope.

## Auditoría SOLID/clean (paralelo, agente read-only → fixes después)

- [x] Reporte de violaciones SOLID/clean en `apps/api/src` (fat controllers, dominio acoplado a Nest/Prisma, duplicación, N+1, manejo de errores, magic numbers).
- [x] Implementar fixes de mayor impacto sin cambiar contratos: PrismaModule único (14 pools→1), notifySafe centralizado, `roleKeysHavePermission` reutilizable, stub-gateway fail-close en prod, cap PENDING con TTL 30min por `Payment.eventId`, `isRedeemable` compartido, `Payment.refId @unique`, `EventStatus` en check-in/door-sale, N+1 `missionsFor`, CORS allowlist, secretos fail-fast en prod.

### Correcciones post-auditoría (hechas)

- [x] `accruePoints` race → `@@unique([personId, reason, refType, refId])` en `PointLedger` + repo retorna null en P2002 (constraint = verdad, find = fast-path).
- [x] `checkout.controller` grande → extraído a `payments/application/checkout.service.ts` con errores de dominio (`EventNotFoundError`, `PresaleUnavailableError`, `PresaleSoldOutError`, `InvalidDiscountError`); `TicketsController` a `tickets.controller.ts`.
- [x] `PrismaCheckinsRepo` instanciaba `ParamsService` manual → DI vía `ParamsModule` en `CheckinsModule`.

### Pendientes conocidos (próximas iteraciones)

- Backlog spec §16: entry-passes desde guest lists, payouts, series-pass, trip matching, CRM, academia avanzada, producer event CRUD, WebSockets/BullMQ/Web Push.
