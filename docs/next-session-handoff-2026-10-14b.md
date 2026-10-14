# Handoff — 2026-10-14 (tarde)

## Completado esta sesión

### Jorge Camacho en el seed dev + SQL directo + release v0.8.5

Cuenta real de piloto `jokcar12345@gmail.com` (`DANCER`, magic link),
alumno de la academia **Erick Baez** con dataset completo sembrado en
`seed-dev.ts` (bloque dedicado "Jorge Camacho - alumno real de Erick
Baez", después de academias/eventos/clique):

- Plan de **2 clases/semana vigente y pagado**: `PaymentClaim`
  APPROVED + `Payment` MANUAL/PAID (misma forma que `claims.approve`),
  enrollment ACTIVE `endsAt` +30d.
- **Todas las clases de Erick Baez reservadas** (26): las pasadas con
  `Attendance` (12), las futuras solo booking.
- **Social**: check-ins en 5 sociales, 3 `Ticket` (2 usadas en eventos
  históricos + próxima Bachatamanía) con sus `Payment`, 7
  `DanceSession` con 4 ratings, `PersonStyleRole`, y membresía del
  clique (10 `Friendship` ACCEPTED con el grupo demo; badges/puntos/
  rachas los computa el bloque de gamificación existente).

### `apps/api/prisma/seed-jorge-camacho.sql`

Equivalente SQL directo para insertar a Jorge en una DB ya sembrada
sin correr `pnpm db:seed`. Transaccional e **idempotente**: no usa
solo `ON CONFLICT (id)` — las claims se guardan por natural key
(academia+persona+plan+APPROVED), las sesiones por par
(evento,inviter,invitee), los pagos de entradas por persona+evento+
orderType, porque el seed ya crea equivalentes con cuids. Verificado
como no-op contra la DB real poblada y en transacción con email de
prueba (dataset completo, rollback). Ojo al editarlo: mezclar
comma-joins con `JOIN ... ON` rompe referencias (`invalid reference
to FROM-clause entry`) — usar `CROSS JOIN`.

### Release v0.8.5 desplegada

- Version bump 0.8.4 → 0.8.5 (root, api, web; `shared` sigue 0.1.0).
- `CHANGELOG.md` entry 0.8.5 documenta **todos** los commits
  promovidos, no solo Jorge: OTP login, preventa academias + advisory
  lock, nómina de colaboradores, mejoras consola productor
  (ventas/reservas/filtros/paginación/comisión), fix orden $0, fixes
  sidebar, favicon, precio SaaS por meses facturados.
- Commit `f638265` en dev → fast-forward a `main` → tag anotado
  `v0.8.5` → push main+tag+dev.
- **Deploy CI verde**: run 38573402376, 5m58s, todos los pasos OK
  (tests API, build, migrate+seed test DB, imagen GHCR, deploy VM,
  health check Nginx).

## Estado

- `dev` == `main` == `f638265`, ambos sincronizados con origin.
- Stack local corriendo (`pnpm dev` shell 62d030, Postgres+Redis
  healthy, API :4000 y web :3000 en 200).
- DB local ya tiene a Jorge cargado vía seed run.

## Próximo slice / gaps

- Ninguno pendiente de este trabajo. Anotación CI menor: actions con
  Node 20 deprecado (warning, no error).
- Untracked pre-existentes no relacionados quedan sin commitear:
  `.agents/`, `.claude/`, `.devin/skills/brag/`, `brag-output/`,
  `skills-lock.json`.
