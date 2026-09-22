# Arquitectura — omni-dance

Plataforma unificada para la escena SBK de Santiago: bailarines, eventos sociales, productores, DJs, venues, academias, staff y administración.

> Última actualización: 2026-09-17 (post-ola wiring + endpoints). Mantener sincronizado con `apps/api/src/app.module.ts` y `apps/api/prisma/schema.prisma`.

## Vista general

```mermaid
graph TB
    subgraph Client["apps/web — Next.js PWA (mobile-first, es-CL)"]
        Landing["/ landing SSR"]
        Consumer["Consumidor: /eventos /amigos /bailes /practicas /qr /perfil"]
        Ops["Consolas: /staff /productor /academia /admin"]
    end

    subgraph API["apps/api — NestJS (hexagonal por dominio)"]
        Auth["auth: magic-link + JWT cookie"]
        RBAC["common/rbac: SessionGuard + RolesGuard"]
        Domains["Dominios: events, qr, sessions, checkins,<br/>payments, discounts, notifications,<br/>social, academies, gamification,<br/>admin, params, people"]
    end

    DB[(PostgreSQL — Prisma)]
    Ext["Pasarela de pago<br/>(stub dev / Flow.cl prod)"]

    Client -->|"fetch /api/* (cookie omnidance_session)"| API
    API --> DB
    API -->|"checkout → redirect"| Ext
    Ext -->|"POST /api/payments/webhook (HMAC)"| API
```

**Un solo backend, una sola PWA.** Las consolas de gestión son rutas de la misma app, gateadas por rol — no son apps separadas.

## Patrón por módulo

Cada dominio sigue arquitectura hexagonal:

```
src/<dominio>/
  domain/           # lógica pura, sin Nest ni Prisma — testeable aislado
    *.service.ts    # reglas de dominio
    ports.ts        # interfaces del repo
    *.spec.ts       # tests unitarios puros
  infrastructure/   # adaptadores Nest
    *.controller.ts # HTTP: guards, DTOs, orquestación
    prisma-*.ts     # implementación Prisma de los ports
<dominio>.module.ts # wiring: imports, controllers, providers
```

- El dominio **no importa Nest** — los servicios se construyen con `useFactory` en el módulo.
- Los controllers hacen orquestación (Prisma directo para lecturas) y delegan reglas al dominio.
- Tests: `src/**/*.spec.ts` unitarios puros; `test/*.e2e.spec.ts` contra Postgres real (`localhost:5433`).

## Módulos activos (app.module.ts)

| Módulo | Rutas | Guard |
|---|---|---|
| auth | `/api/auth/*` magic-link, session, logout | — |
| people | `/api/me` perfil + roleStates | SessionGuard |
| events | `/api/events*` catálogo público con `?genre=&venue=&week=this`; `genres` resueltos (evento o heredados de serie) | público / SessionGuard |
| qr | `/api/qr/mine` QR rotativo | SessionGuard |
| sessions | `/api/sessions/*` invitar/confirmar/puntuar | SessionGuard + wiring notify+badges |
| checkins | `/api/checkins*` staff door scan/manual | `checkins.write` |
| payments | `/api/checkout`, `/api/tickets`, `/api/payments/webhook` | mixto |
| discounts | `/api/discount-codes*` CRUD | `discounts.manage` |
| notifications | `/api/notifications`, `/api/push-tokens` | SessionGuard |
| social | `/api/events/:id/waitlist`, `/practices`, `/venues`, `/styles`, `/partner-requests`, `/availability`, `/guest-lists`, `/friends`, `/friends/upcoming-events`, `/people/:id` | mixto `social.manage` |
| academies | `/api/academies/*` planes, enrollments, asistencia | `academies.create` / owner |
| gamification | `/api/gamification/*` streaks, badges, leaderboard, misiones | SessionGuard |
| params | `/api/params/public`, `/api/admin/params` | público / `admin.access` |
| leads | `POST /api/leads` (upsert por email, devuelve `demoToken`, notifica a ADMIN) + `POST /api/leads/:id/demo` (token en body → crea `Person` `isDemoAccount` con los roles del lead en APPROVED, enlaza `lead.personId`, emite sesión; email ya registrado → 409) | público, rate-limited por IP |
| admin | `/api/admin/*` usuarios (búsqueda, ficha 360°, asignación de roles), analítica por usuario, explorador `/admin/browse/:entity`, roles, permisos, audit | `admin.access` |

## Cuentas demo (leads /pro)

- `Person.isDemoAccount` marca cuentas creadas por `POST /leads/:id/demo`.
- **Barrera de escritura en `SessionGuard`**: demo + método mutador → `403 demo_mode`, salvo whitelist self-scoped (`/auth/logout`, `/auth/password`, `/notifications/*`, `/push-tokens`, `/me/complete-profile`). Los GETs pasan con sus roles APPROVED — el demo navega su consola sin ensuciar data productiva.
- **Promoción demo→real**: `POST /auth/magic-link` → `GET /auth/verify` hace `upsertByEmail`, que marca `verifiedAt` y apaga `isDemoAccount` (el magic link prueba posesión del correo) — **excepto** si `pendingProfileAt` está set (conversión admin): ahí solo se verifica el correo y la barrera sigue activa hasta `/me/complete-profile`.
- **Conversión admin**: `POST /api/admin/leads/:id/convert` (`admin.access`, audita `LEAD_CONVERT`) — crea la `Person` si no existe (o usa la demo ligada), setea `pendingProfileAt` + `isDemoAccount`, envía magic link por email + notificación in-app `account.complete_profile`; lead → `CONTACTED`. Si el email ya es cuenta real → enlaza y `CONVERTED` directo (`alreadyReal`). Teléfono ya registrado en otra cuenta → `409 phone_exists` (`Person.phone` es unique — en `demo` y `complete-profile` también se pre-chequea).
- **Cierre del ciclo**: `POST /api/me/complete-profile` (SessionGuard, whitelisted en la barrera) — name/phone (+password opcional) → limpia `pendingProfileAt`, apaga `isDemoAccount`, lead ligado → `CONVERTED`. `/api/me` expone `isDemo` + `pendingProfile`.
- Web: banner persistente bajo el appbar cuando `pendingProfile` → `/perfil/completar` (form name/phone/password); botón "Convertir a usuario real" en filas de leads de `/admin/datos` (visible solo si `demoPending` o sin cuenta).
- El explorador admin muestra badge "demo" en filas de `people` y `demoPending` en `leads`; `demoToken` nunca sale en respuestas.

## Frontera anónima (web)

- `apps/web/src/middleware.ts`: sin cookie `omnidance_session`, toda ruta de `(app)` → `/login?next=<ruta>`. Públicas: `/`, `/pro`, `/login`, `/eventos` (solo lista), `opengraph-image`, `twitter-image` — el resto de estáticos queda fuera por el matcher (`api`, `_next`, archivos con extensión).
- `/eventos` sin sesión: solo eventos de la semana, sin links al detalle, con CTA a login — "ver sin entrar a la app". `BottomNav` no renderiza chrome cuando `/me` resuelve anónimo (`meChecked && !me`) y marca `html[data-anon]` para que `ChromeShell` no reserve el padding de la tab bar.
- Tras login, `?next=` devuelve a la ruta pedida (solo rutas internas — sin open redirect).
- Estilos: `EventSeries.genres` + `Event.genres` (Genre[]: SALSA/BACHATA/CUBANO; vacío en evento → hereda la serie). En la UI `CUBANO` se muestra como "Timba" — el nombre que usa la escena.

## Hub de eventos (`/eventos` autenticado)

- Vistas por query (`?view=`): `list` (default: Esta semana por día + Más adelante), `calendar` (`&week=YYYY-MM-DD` — cualquier fecha resuelve al lunes de su semana; franja de 7 días con puntos por género y nav prev/next semana; `&day=YYYY-MM-DD` lista los eventos del día bajo la franja) y `mios` (agenda propia: eventos futuros con `Ticket` ACTIVE del usuario). El switcher es icon-only (toggle ≡/📅 + ticket aparte). Todo SSR con links que preservan los demás params — compartibles y sin JS.
- Filtros combinables: `?genre=` **multiselect CSV** (`SALSA,BACHATA` → unión; API con `hasSome` propio o heredado), `?venue=<id>` como dropdown tipo chip (`<details>` + overlay de cierre en CSS — sin JS; el `<summary>` muestra el local activo).
- Asistencia = compra real: `Ticket` ACTIVE es la fuente de "voy" — el modelo `Rsvp` fue eliminado (GOING/INTERESTED no reflejaban asistencia real) junto a `PUT/DELETE /api/events/:id/rsvp` y `GET /api/me/rsvp`. La agenda de Mis eventos se construye con `GET /api/tickets/mine` (cookie forward en SSR); la entrada real es el QR personal — `/entradas` queda fuera del nav como página de gestión (transferencia de tickets), enlazada desde la vista `mios` y desde el post-checkout.
- Limitación conocida: claves de día/semana usan la TZ del runtime (dev = TZ del host); el producto target es America/Santiago.

## Nav del bailarín y módulos sociales

- Bottom bar DANCER: `[Inicio] [Eventos] [+] [Amigos] [Perfil]`. El "+" central (`ACTIONS_TAB`, `sheet: true` — botón, no Link) abre `DancerActionsSheet`: bottom sheet con el QR personal destacado (`MyQr compact`) + grid de módulos secundarios (Bailes, Prácticas, Viajes; en lente academia: Academia, Eventos — Prácticas es solo social; Notificaciones queda solo en la campana del appbar). `role="dialog"` + focus trap (`useDialogFocus`) + Escape/backdrop/ruta cierran; motion-reduce instantáneo.
- El drawer lateral (`SideDrawer`) ya no aplica al rol DANCER en ninguna lente — los demás roles lo conservan.
- `/bailes` solo muestra sesiones de baile escaneadas por QR (DanceSession + SessionRating). "Disponibles ahora" (`AvailabilitySection`) y "Busco pareja" (`PartnerRequests`) se movieron a `/practicas`, que es el hub de encontrar con quién practicar junto al listado de prácticas publicadas.
- Amigos: `/amigos` incluye "Tus amigos van a" (`GET /api/friends/upcoming-events` — eventos futuros con ≥1 amigo confirmado con ticket ACTIVE, con stack de avatares); `/amigos/[id]` muestra "Próximos eventos" del perfil solo si la amistad está ACCEPTED (`GET /api/people/:id` incluye `upcomingEvents` condicional — ausente para no-amigos). `Ticket.eventId` es escalar → los joins son manuales en el controller.

## RBAC — todo DB-driven

```mermaid
flowchart LR
    Req["Request + cookie"] --> SG["SessionGuard<br/>carga Person + roleStates"]
    SG --> RG["RolesGuard<br/>@RequirePermissions"]
    RG --> DB1[("Role<br/>key, isSuperuser,<br/>requestable")]
    RG --> DB2[("RolePermission<br/>roleKey → permissionKey")]
    RG --> DB3[("PersonRole<br/>personId, role,<br/>status")]
    DB1 & DB2 --> Cat["catálogo cache 30s<br/>(invalidateRoleCatalog<br/>tras mutaciones)"]
    DB3 --> States{"status?"}
    States -->|APPROVED| Perms["permisos del rol"]
    States -->|SANDBOX| Sand["solo si @AllowSandbox"]
    States -->|"PENDING / REJECTED"| Deny["403"]
    Cat --> Perms
    Perms --> Check{"isSuperuser<br/>o permiso?"}
    Check -->|sí| Allow["next()"]
    Check -->|no| Deny
```

- **Nada hardcodeado en runtime**: roles, permisos, grants y estados viven en `Role`, `Permission`, `RolePermission`, `PersonRole`.
- `PersonRole.status`: `PENDING` (sin acceso) → `APPROVED` (acceso) | `REJECTED` (fila preservada) | `SANDBOX` (acceso limitado donde `@AllowSandbox`). El admin fija el status directo con `POST /admin/users/:personId/roles`.
- `ADMIN` es `isSuperuser` — bypass total, solo seteable por seed (no vía API admin).
- Los roles **no son auto-solicitables**: la única vía es la asignación admin desde `/admin/usuarios` (`Role.requestable` quedó inerte en el schema).
- `@RequireRoles` existe como escape hatch pero ningún controller lo usa — todo es `@RequirePermissions`.

## Parámetros de plataforma

`PlatformParam` (JSON por key, cache 30s, `getNumber(key, fallback→env→default)`):

| Key | Consumidor | Default |
|---|---|---|
| `service_fee.presale_clp` | checkout + webhook | 500 |
| `service_fee.door_app_clp` | checkin app | 700 |
| `service_fee.door_cash_clp` | checkin efectivo | 0 |
| `session.cooldown_minutes` | sessions invite | 4 |
| `qr.rotation_seconds` | QR mint | 60 |
| `prime_time.window_minutes` | gamificación (default de creación de eventos) | 30 |
| `prime_time.threshold_pct` | gamificación fallback aforo | 0.2 |

Edición en vivo vía `PUT /api/admin/params/:key` (audita `PARAM_UPDATE`). El seed hace `upsert` con `update:{}` — **no pisa valores editados**.

## Modelo de datos (núcleo)

```mermaid
erDiagram
    Person ||--o{ PersonRole : roles
    Person ||--o{ Ticket : "owner/buyer"
    Person ||--o{ DanceSession : "inviter/invitee"
    Person ||--o{ Checkin : asiste
    Person ||--o{ Notification : recibe
    Person ||--o{ PersonBadge : gana
    Role ||--o{ PersonRole : key
    Role ||--o{ RolePermission : grants
    Permission ||--o{ RolePermission : key
    Event }o--|| Venue : "venueId (nullable: práctica sin local)"
    Event }o--o| EventSeries : serie
    Event ||--o{ DanceSession : contiene
    Event ||--o{ Ticket : vende
    Event ||--o{ Waitlist : cola
    Event ||--o{ Mission : misiones
    DanceSession ||--o{ SessionRating : puntúa
    Payment }o--o| DiscountCode : "discountCodeId (desnorm.)"
    Ticket }o--o| EntryPass : "pases staff/cortesía"
    Badge ||--o{ PersonBadge : catálogo
    Academy ||--o{ Enrollment : alumnos
    Academy ||--o{ Attendance : asistencia
```

## Wiring de notificaciones y gamificación

`NotificationsService` y `GamificationService.evaluateBadgesFor` se inyectan **opcionales** en los controllers que los disparan (fail-safe: su ausencia es no-op, nunca rompe el flujo):

| Trigger | Módulo | Efecto |
|---|---|---|
| `sessions.invite` | sessions | notify SOCIAL `session.invite` al invitee |
| `sessions.act(confirm)` | sessions | notify `session.confirmed` al inviter + evalúa badges de ambos |
| `sessions.act(decline)` | sessions | notify `session.declined` al inviter |
| `sessions.rate` | sessions | `status → RATED` + evalúa badges de rater y rated |
| `webhook PAID` | payments | notify TRANSACTIONAL `payment.paid` (solo si esta llamada marcó PAID — flag `paidNow` en la tx) |
| `webhook FAILED` | payments | notify `payment.failed` |
| `waitlist.promote` | social | notify SOCIAL `waitlist.promoted` |

`RATED` cuenta como actividad confirmada en streaks/badges/misiones/leaderboard (`confirmedSessions*` incluye `["CONFIRMED","RATED"]`).

## Persistencia y seeds

- **Prisma + Postgres** (`localhost:5433` en docker-compose dev).
- Seeds idempotentes (`SEED_ENV=dev|prod`): `seed-common` (catálogos RBAC, permisos, estilos, badges, params por upsert) + `seed-dev` (demo Santiago, `*@omnidance.dev` logueables) / `seed-prod` (baseline + admin desde `SEED_ADMIN_EMAIL`).
- `prisma db push` en dev; el watch del API debe detenerse antes (lock del query engine).

## Docs operativas

- **Swagger UI**: `http://localhost:4000/api/docs` — OpenAPI JSON en `/api/docs-json`.
- **Export**: `node apps/api/scripts/export-api-docs.cjs` → `docs/openapi.json` + `docs/postman/omni-dance.postman_collection.json` (regenerar tras cambios de endpoints).
- **Flujos**: `docs/flows.md` (secuencias y estados en mermaid).
