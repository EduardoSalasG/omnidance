# Omnidance

Plataforma del ecosistema SBK de Santiago (salsa, bachata, cubano). Una sola
base para dos líneas de producto:

- **Omnidance Nightlife** — eventos sociales, ticketing con cargo de servicio,
  check-in por QR rotativo, reputación privada, gamificación de conductas.
- **Omnidance Academy** — academias, series de clases mensuales, reservas con
  cupo + lista de espera, quórum parametrizable, asistencias, planes y
  membresías.

Monorepo pnpm: una API compartida y una PWA única que cambia de navegación y
módulos según el rol/lente activo del usuario.

## Stack

| Pieza | Tech |
|---|---|
| Web | Next.js 14 + React 18 + TypeScript — PWA instalable, dark-first, mobile-first |
| API | NestJS 10 (arquitectura hexagonal) + Prisma + PostgreSQL 16 |
| Realtime | WebSockets + BullMQ sobre Redis 7 |
| Compartido | `@omnidance/shared` — enums, constantes y types front/back |
| i18n | next-intl, catálogo `es-CL` en parts (`apps/web/src/i18n/parts/`) |
| Auth | Magic link (Resend) + password dev; sesión por cookie httpOnly |

## Estructura

```
apps/web        PWA — bailarín, staff y consolas B2B role-gated
apps/api        API NestJS — dominio, infraestructura, RBAC DB-driven
packages/shared Tipos y constantes compartidos
openspec/       Spec-driven changes (propuestas, tasks)
docs/           Arquitectura, flujos, handoffs, openapi.json + Postman
omni-dance.md   Spec de producto (fuente de verdad de negocio)
AGENTS.md       Guía de trabajo para agentes
```

## Quickstart

```bash
pnpm install
pnpm db:up                        # Postgres + Redis (docker compose)
pnpm --filter @omnidance/shared build   # requerido la 1ª vez (API importa shared/dist)
pnpm db:push
pnpm db:seed                      # baseline + demo SBK Santiago (idempotente)
pnpm dev                          # API :4000 + Web :3000
```

Abrir http://localhost:3000 — login con cualquier cuenta `@omnidance.dev`
por password (`omnidance123`) o magic link (en dev el link se imprime en el
log de la API si no hay Resend configurado).

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` / `dev:web` / `dev:api` | Servidores de desarrollo |
| `pnpm build` | Build de todos los paquetes |
| `pnpm test` | Vitest (API: 860+ tests) + smoke e2e |
| `pnpm db:up` / `db:down` | Postgres 16 + Redis 7 |
| `pnpm db:push` / `db:migrate` | Schema Prisma / migración versionada |
| `pnpm db:seed` | Seed idempotente (`SEED_ENV=dev` default, `prod` solo baseline+admin) |
| `pnpm db:studio` | Prisma Studio |

Docs de API: Swagger en `/api/docs` (API viva), `docs/openapi.json` y
`docs/postman/` se regeneran con `node apps/api/scripts/export-api-docs.cjs`.

## Cuentas de prueba (seed dev)

Todas usan dominio `@omnidance.dev` y password **`omnidance123`**.
Magic link también habilitado en dev.

### Cuentas por rol

| Email | Nombre | Rol(es) | Para probar |
|---|---|---|---|
| `admin@omnidance.dev` | Admin Omnidance | `ADMIN` | `/admin` — RBAC, params, catálogos, defaults por productor |
| `dancer@omnidance.dev` | Bailarín Demo | `DANCER` | Flujo completo: eventos, ticket en billetera, QR, amigos, reservas de clases, prácticas |
| `staff@omnidance.dev` | Staff Puerta | `STAFF` | `/staff` — check-in por QR, asignado a puerta de Bachatamanía |
| `profe@omnidance.dev` | Valeska Torres | `INSTRUCTOR` + `DANCER` | `/academia/clases` — clases en **2 academias** (MuéveteOnTour + Tumbao), rosters con quórum, fichas de alumnos |
| `rodrigo@omnidance.dev` | Rodrigo Fuentes | `INSTRUCTOR` + `DANCER` | Segundo instructor — clases de salsa, clases particulares |
| `muvet@omnidance.dev` | Dueño MuéveteOnTour | `ACADEMY_OWNER` + `PRODUCER` | Consola academia completa (settings quórum, series, planes, alumnos) + consola productor |
| `tumbao@omnidance.dev` | Dueño Academia Tumbao | `ACADEMY_OWNER` | Segunda academia — gate multi-academia |
| `carlos@omnidance.dev` | Carlos Andrés | `PRODUCER` | `/productor` — eventos, ProducerParams 5% comisión, descuento `OMNI10` |
| `ardilla@omnidance.dev` | Ardilla | `PRODUCER` + `DJ` | Multi-rol: selector de lente en Perfil |
| `cesar@omnidance.dev` | César Moreno | `PRODUCER` + `DJ` | Multi-rol, sin ProducerParams (comisión 0%) |
| `steban@omnidance.dev` | DJ Steban | `DJ` | `/dj` — gigs Jueves Cubano + ranking de sugerencias |
| `matias@omnidance.dev` | Matías Herrera | `DJ` | DJ de Bachatamanía |
| `fabian@omnidance.dev` | Fabián Valladares | `DJ` | DJ de Social con Estilo |
| `jesus@omnidance.dev` | DJ Jesús | `DJ` | DJ de Havana (sáb/dom) |
| `venue@omnidance.dev` | Manager Orixas | `VENUE_MANAGER` | `/venue` — KPIs, arriendos REQUESTED/CONFIRMED/CANCELLED |
| `soporte@omnidance.dev` | Soporte Omnidance | `SUPPORT` | `/soporte` — buscador de usuarios, fichas read-only |

### Alumnas/os de academia (`DANCER`)

| Email | Nombre | Estado enrollment | Detalle |
|---|---|---|---|
| `camila@omnidance.dev` | Camila Rojas | ACTIVE (muvet + tumbao) | Amiga del Bailarín Demo, series pass vigente, guest list "Cumpleaños de Camila" |
| `josefa@omnidance.dev` | Josefa Martínez | ACTIVE | Pack 8 clases, solicitud de amistad enviada por dancer |
| `diego@omnidance.dev` | Diego Sanhueza | ACTIVE | Reserva de mesa REQUESTED |
| `francisca@omnidance.dev` | Francisca León | TRIAL | Clase de prueba |
| `sebastian@omnidance.dev` | Sebastián Pino | PAUSED | Enrollment pausado |
| `antonia@omnidance.dev` | Antonia Reyes | ACTIVE + TRIAL | Solicitud de amistad entrante al dancer |
| `felipe@omnidance.dev` | Felipe Contreras | FROZEN | Enrollment congelado |
| `daniela@omnidance.dev` | Daniela Fuentes | ACTIVE | Clase particular REQUESTED con Vale |

### Qué cubre el seed

- **Academias**: MuéveteOnTour (quórum default 15) y Academia Tumbao (12);
  planes mensual/pack/prueba; series con quórum por nivel (override de serie,
  slot explícito, herencia de academia, override puntual de clase);
  clases materializadas del mes actual + anterior; próxima bachata llena
  8/8 con waitlist; ~200 reservas y ~140 asistencias para historial.
- **Eventos**: 6 series en Orixas + noches standalone en Tierra Dura y
  Havana; edición pasada CLOSED con tickets USED, pagos PAID y check-ins
  (analytics con GMV real); Bachatamanía con override de fees por evento.
- **Social**: amistades (aceptada/entrante/enviada), RSVPs, guest list,
  reserva de mesa, song suggestions para el ranking del DJ, pase de serie,
  notificaciones sin leer, búsqueda de partner de práctica.
- **Dinero**: ProducerParams (carlos 5%, muvet 8%), descuento `OMNI10`,
  liquidaciones con comisión de plataforma.

Re-correr `pnpm db:seed` es seguro: upserts por clave natural, no duplica
ni pisa parámetros editados desde `/admin`.

## Documentación

| Doc | Contenido |
|---|---|
| [`omni-dance.md`](omni-dance.md) | Spec de producto — modelo, vistas, economía |
| [`AGENTS.md`](AGENTS.md) | Reglas de trabajo, comandos, convenciones RBAC |
| [`apps/api/README.md`](apps/api/README.md) | API: módulos, auth, seed, tests |
| [`apps/web/README.md`](apps/web/README.md) | Web: rutas por rol, design system, i18n |
| [`docs/architecture.md`](docs/architecture.md) | Módulos, RBAC, params, wiring |
| [`docs/flows.md`](docs/flows.md) | Secuencias y estados (mermaid) |
| [`docs/openapi.json`](docs/openapi.json) | OpenAPI exportado + colección Postman |
