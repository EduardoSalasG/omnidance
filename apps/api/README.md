# @omnidance/api

API NestJS 10 + Prisma + PostgreSQL. Arquitectura hexagonal: cada módulo
separa `domain/` (servicios, puertos) de `infrastructure/` (controllers,
repositorios Prisma, guards).

## Correr

```bash
# desde la raíz del repo
pnpm --filter @omnidance/shared build   # 1ª vez — la API importa shared/dist
pnpm db:up && pnpm db:push && pnpm db:seed
pnpm dev:api                            # http://localhost:4000
```

Swagger UI: http://localhost:4000/api/docs · JSON: `/api/docs-json`.

## Scripts (`pnpm --filter @omnidance/api …`)

| Script | Qué hace |
|---|---|
| `dev` | `nest start --watch` |
| `build` | `nest build` → `dist/` |
| `test` | `vitest run` — 860+ tests (unit + e2e contra DB) |
| `prisma db seed` | `tsx prisma/seed.ts` — `SEED_ENV=dev` (demo SBK) \| `prod` (baseline + admin) |
| `prisma studio` | Explorador de datos |

`node scripts/export-api-docs.cjs` (API viva) regenera `docs/openapi.json`
+ colección Postman — commitear junto a cambios de endpoints.
`node scripts/smoke-rbac-params.cjs` — smoke RBAC/params reproducible.

## Env vars (`.env` — ver `.env.example` raíz)

| Var | Uso |
|---|---|
| `DATABASE_URL` / `REDIS_URL` | Postgres / BullMQ |
| `JWT_SECRET`, `QR_SECRET` | Sesión y QR rotativo — `secretOrDevFallback` hace fail-fast en prod |
| `RESEND_API_KEY`, `EMAIL_FROM` | Magic links (sin Resend el link sale por log en dev) |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth Google |
| `CORS_ORIGINS`, `WEB_URL` | Origen del web / redirect del magic link |
| `SESSION_SAMESITE` | `none`+https para web y API en hosts distintos |
| `FLOW_*` | Pasarela de pagos — stub fail-close en producción |

## Módulos

| Módulo | Cubre |
|---|---|
| `auth` | Magic link, password, OAuth, sesiones cookie httpOnly |
| `academies` | Academias, instructores, planes, enrollments, series mensuales, slots, clases materializadas, reservas con cupo+waitlist, asistencias, clases particulares, videos |
| `events` | Series de eventos, eventos, DJs asignados, sugerencias de canciones, mesas, ratings agregados |
| `payments` | Checkout Flow, tickets, webhooks (fail-close en prod), liquidaciones con comisión plataforma |
| `checkins` | Check-in de puerta por QR rotativo TOTP, venta en puerta |
| `social` | Amigos, RSVPs, guest lists, waitlist de evento, entry passes, prácticas, venues + consola venue, blocks |
| `gamification` | Badges, misiones, streaks, puntos — conductas, nunca puntajes |
| `sessions` | Sesiones de baile por QR, ratings privados |
| `crm` | Scores/tags/campañas por actor (productor, academia, venue) |
| `notifications` | In-app + Web Push, best-effort (`notifySafe`) |
| `analytics` | `GET /analytics/summary?role=` — KPIs por lente (admin/productor/academia/venue) |
| `admin` | RBAC (roles/permisos/grants), params plataforma, catálogos, defaults por productor, consola soporte |
| `params` | `PlatformParam` + `ParamsService.getNumber` (cache 30s) |
| `people` | Búsqueda y perfiles respetando bloqueos |
| `home` | Feed del home por rol |

## Convenciones clave

- **RBAC DB-driven**: `@UseGuards(SessionGuard, RolesGuard)` +
  `@RequirePermissions(...)`. Catálogo vivo en `Role`/`Permission`/
  `RolePermission`. `req.person.roles` = solo APPROVED. Para "self o
  staff" puntual: `roleKeysHavePermission()`. Tras mutar grants:
  `invalidateRoleCatalog()`.
- **Acceso academia**: `AcademyAccess.requireManage` (owner/instructor/
  admin — clases, roster, alumnos) vs `requireAdminister` (owner/admin —
  settings, planes, enrollments).
- **Quórum de clases**: `effectiveCapacity()` en
  `academies/domain/academy.service.ts` — cadena `Class.capacity →
  ClassSlot.capacity → ClassSeries.quorum → Academy.defaultQuorum → 20`.
- **Fees por evento**: cadena `evento → ProducerParams → PlatformParam →
  default shared`. Solo admin edita; productor ve read-only.
- **PrismaService único**: los módulos importan `PrismaModule`, nunca
  re-declaran el provider.
- **Sin `any` ni `@ts-ignore`**. DTOs con `class-validator` (alimentan Swagger).

## Seed dev

`prisma/seed.ts` → `seed-common.ts` (catálogo RBAC, estilos, niveles,
tipos, badges, params) + `seed-dev.ts` (demo SBK Santiago: venues,
productores, DJs, academias, series de clases, alumnos, reservas, pagos).
Idempotente por claves naturales — re-correr no duplica. Cuentas
`*@omnidance.dev` / password `omnidance123` (tabla completa en el README
raíz).

`tsconfig.tsbuildinfo` (de `tsc --noEmit`) confunde al watch de Nest — si
`dist/` queda incompleto: `rm -rf dist tsconfig.tsbuildinfo` y reiniciar.
