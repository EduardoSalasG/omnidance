# Tasks — spec-gap-closure

Orden por slice; cada tarea lleva verificación propia (TDD donde aplique).

## Slice A — Core loop y safety

- [ ] **A1 user-blocks**: `BlocksController` (`POST /blocks`, `DELETE /blocks/:personId`, `GET /blocks`) + enforcement en `sessions.invite` y `sessions.declare` → e2e.
- [ ] **A2 retro-declared**: `POST /sessions/declare` + filtro `retroDeclared:false` en queries de Prime Time/leaderboard/reveal del repo gamificación → e2e contador excluye.
- [ ] **A3 check-out**: `POST /checkins/:id/out` (owner o staff) idempotente → e2e.
- [ ] **A4 void check-in**: `POST /checkins/:id/void {reason}` staff-only + revert ticket + `AuditLog CHECKIN_VOID` → e2e.
- [ ] **A5 event-ratings**: `POST /events/:id/ratings` (check-in + ventana 24h, upsert) + `GET /events/:id/ratings/summary` (agrupado por actor, umbral ≥3, productor/admin) → e2e.

## Slice B — Social y ticketing

- [ ] **B1 friendships**: `FriendsController` (request/accept/decline/list) con par ordenado + notify → e2e.
- [ ] **B2 table-reservations**: `POST /events/:id/table-reservations`, `GET` (solo CONFIRMED), `PATCH` producer/admin, `DELETE` solicitante → e2e.
- [ ] **B3 song-suggestions**: `songSuggestion?` en checkout DTO → persistir en tx webhook PAID; `GET /events/:id/song-suggestions` top-20 para productor/DJ/admin → e2e.
- [ ] **B4 door-sale**: `POST /checkins/door-sale` — cuenta ligera por phone, ticket por canal (params door_cash/door_app), check-in MANUAL, doorCap, qrToken en respuesta → e2e.

## Slice C — Gamificación

- [ ] **C1 reveal**: `GET /events/:id/prime-time/reveal` — bayesiano por rol (C=10, m=media evento), min 3 evaluaciones, excluye retroDeclared, pareja de la noche, corona `PersonBadge(expiresAt +7d)` idempotente → unit + e2e.
- [ ] **C2 season-points**: `PointLedger` accrual con `sourceKey` único en hooks (confirm/rate/checkin-early/mission) + `GET /gamification/me/points` → unit + e2e.
- [ ] **C3 badge-rules**: madrugador / maratonista / mariposa_social en `BadgeAwarder` + stats del repo + seed de los 3 badges → unit tests de reglas puras.
- [ ] **C4 featured-badge**: `GET /qr/mine` +`featuredBadge` (featured activo > corona vigente > null) → e2e.

## Integración (padre)

- [ ] Registrar controllers en módulos (`*.module.ts` es exclusivo del padre).
- [ ] `GET /me` o payload QR: verificar shape final del featured badge.
- [ ] Regenerar `docs/openapi.json` + colección Postman (`scripts/export-api-docs.cjs`).
- [ ] Actualizar `docs/flows.md` (nuevas secuencias: door-sale, reveal, blocks) y `docs/architecture.md` (tabla de módulos si cambia).
- [ ] Seed: badges madrugador/maratonista/mariposa_social + corona prime_time_crown.
- [ ] Suite completa + typecheck + smoke + commit por scope.

## Auditoría SOLID/clean (paralelo, agente read-only → fixes después)

- [ ] Reporte de violaciones SOLID/clean en `apps/api/src` (fat controllers, dominio acoplado a Nest/Prisma, duplicación, N+1, manejo de errores, magic numbers).
- [ ] Implementar fixes de mayor impacto sin cambiar contratos.
