# Arquitectura - omni-dance

Plataforma unificada para la escena SBK de Santiago: bailarines, eventos sociales, productores, DJs, venues, academias, staff y administración.

> Última actualización: 2026-10-04 (suscripciones de plataforma - SaaS academia + Producer Pro). Mantener sincronizado con `apps/api/src/app.module.ts` y `apps/api/prisma/schema.prisma`.

## Vista general

```mermaid
graph TB
    subgraph Client["apps/web - Next.js PWA (mobile-first, es-CL)"]
        Landing["/ landing SSR"]
        Consumer["Consumidor: /eventos /amigos /bailes /practicas /qr /perfil"]
        Ops["Consolas: /staff /productor /academia /admin"]
    end

    subgraph API["apps/api - NestJS (hexagonal por dominio)"]
        Auth["auth: magic-link + JWT cookie"]
        RBAC["common/rbac: SessionGuard + RolesGuard"]
        Domains["Dominios: events, qr, sessions, checkins,<br/>payments, discounts, notifications,<br/>social, academies, gamification,<br/>admin, params, people, storage"]
    end

    DB[(PostgreSQL - Prisma)]
    Ext["Pasarela de pago<br/>(stub dev / Flow.cl prod)"]

    Client -->|"fetch /api/* (cookie omnidance_session)"| API
    API --> DB
    API -->|"checkout → redirect"| Ext
    Ext -->|"POST /api/payments/webhook (HMAC)"| API
```

**Un solo backend, una sola PWA.** Las consolas de gestión son rutas de la misma app, gateadas por rol - no son apps separadas.

## Patrón por módulo

Cada dominio sigue arquitectura hexagonal:

```
src/<dominio>/
  domain/           # lógica pura, sin Nest ni Prisma - testeable aislado
    *.service.ts    # reglas de dominio
    ports.ts        # interfaces del repo
    *.spec.ts       # tests unitarios puros
  infrastructure/   # adaptadores Nest
    *.controller.ts # HTTP: guards, DTOs, orquestación
    prisma-*.ts     # implementación Prisma de los ports
<dominio>.module.ts # wiring: imports, controllers, providers
```

- El dominio **no importa Nest** - los servicios se construyen con `useFactory` en el módulo.
- Los controllers hacen orquestación (Prisma directo para lecturas) y delegan reglas al dominio.
- Tests: `src/**/*.spec.ts` unitarios puros; `test/*.e2e.spec.ts` contra Postgres real (`localhost:5433`).

## Módulos activos (app.module.ts)

| Módulo | Rutas | Guard |
|---|---|---|
| auth | `/api/auth/*` magic-link, session, logout | - |
| people | `/api/me` perfil + roleStates + gender + `consentVersion`/`consentAcceptedAt` (consentimiento legal - ver abajo); `POST /me/consent` (estampa `CONSENT_VERSION` vigente); `GET /me/pending-surveys` (eventos evaluables en ventana 24h; el primer request reclama `surveyNotifiedAt` y hace fan-out `event.survey` a todos los asistentes con check-in válido) | SessionGuard |
| events | `/api/events*` catálogo público con `?genre=&venue=&week=this`; `genres` resueltos (evento o heredados de serie); consola productor: `/events/mine` (+stats vendidas/bruto/check-ins), `/events/:id/live` (ventas por canal, check-ins, ocupación - owner/admin), `/events/:id/export.csv|export.pdf?dataset=sales|checkins|guestlist` (CSV operativo / PDF imprimible con resumen - owner/admin; BOM UTF-8, sin claimToken) y `/events/series/:seriesId/export.csv|export.pdf` (mismos datasets agregados por serie con columna `evento`), `/events/:id/ratings/summary` (agregado k≥3), `/events/:id/analytics` (attendees + genderSplit/roleSplit + ratings por dim - null bajo k≥3, owner/admin), `/dj/gigs*` (gigs + sugerencias + rating de música del DJ asignado) | público / SessionGuard / `events.manage` |
| qr | `/api/qr/mine` QR rotativo | SessionGuard |
| sessions | `/api/sessions/*` registrar por QR (`scan`)/puntuar/descartar | SessionGuard + wiring notify+badges |
| checkins | `/api/checkins*` staff door scan/manual; offline: `GET /api/events/:id/door-manifest` (snapshot de pases ACTIVE + check-ins abiertos para cachear en el dispositivo) y `POST /api/checkins/sync` (batch de escaneos encolados — verifica cada JWT, persiste `inAt` original y `clientRef` idempotente, responde por ítem `synced\|duplicate\|invalid_token\|error`) | `checkins.write` |
| payments | `/api/checkout` (ticket / series-pass / membership - plan de academia / **membership-subscription** - suscripción recurrente Flow / `GET membership-quote` / **class** - clase suelta/taller con `GET class-quote` / **private-class** - clase particular comprable con `GET private-class-quote` → orden PRIVATE, settle crea `PrivateLesson` REQUESTED sin instructor/fecha y `PATCH /private-lessons/:id {action:"assign"}` del owner la agenda), `/api/tickets`, `/api/payments/webhook` (Flow notifica `{token}` → se confirma vía `payment/getStatus` firmado) + `/api/payments/webhook/:provider` (despacho por `GatewayRegistry` - provider no registrado → 404), `GET /api/payments/:id` (polling del checkout; si la orden sigue PENDING consulta `refreshStatus` del adaptador persistido en `Payment.gateway` y liquida con la misma lógica del webhook - cubre sandbox/dev donde el webhook no alcanza localhost), `/api/subscriptions/mine|/:id|/:id/cancel` (owner), `/api/payments/flow/customer-return` + `/api/payments/subscription-webhook` (públicos, callbacks Flow), `/api/payments/mine|by-event|by-academy|/:id/events` (auditoría por actor - detalle en "Pasarela de pago"), `GET|PUT|DELETE /api/producer/gateway-account` (cuenta de pasarela propia del productor - credenciales cifradas, respuesta masked + webhookUrl `…/webhook/:provider?account=<id>`), `GET|POST /api/producer/payment-methods` + `PATCH|DELETE /api/producer/payment-methods/:id` (medios de cobro propios - transferencia/link/efectivo), `GET /api/events/:id/payment-methods` (activos del productor del evento para el checkout), `POST|GET /api/payments/:id/claims` (comprobante del comprador sobre orden MANUAL), `GET /api/producer/claims` + `POST /:id/approve|reject` + `GET /:id/receipt` (cola + evidencia autenticada) | mixto (checkout = preventa o puerta-app según estado/corte del evento) |
| discounts | `/api/discount-codes*` CRUD | `discounts.manage` |
| notifications | `/api/notifications` (`?unread=&limit=&lens=` - lens acota lista y unreadCount al dominio social/academy), `/api/push-tokens` | SessionGuard |
| social | `/api/events/:id/waitlist`, `/practices`, `/venues`, `/styles`, `/guest-lists`, `/friends`, `/friends/upcoming-events`, `/people/:id`; consola venue: `/venues/mine`, `/venues/:id/dashboard` (KPIs + reservas de mesa + flujo: hora peak/permanencia), `/venues/:id/rentals/:id` PATCH | mixto `social.manage` / `venues.manage` |
| academies | `/api/academies/*` planes, enrollments, asistencia; público autenticado: `GET /academies` (directorio: description/address/lat/lng, estilos derivados de series activas, flag `enrolled`), `GET /academies/enrolled` (mis inscripciones + asistencias 30d), `GET /academies/:id/profile` (ficha pública: datos, contacto instagram/whatsapp, estilos, profesores, planes, próximas clases ClassCardData, `myEnrollment` del viewer); `PATCH /academies/:id/settings` (owner/ADMIN) edita quórum + perfil público (description, address, lat/lng, instagram, whatsapp) + `privateLessonPrice` (null = no vende particulares); `PATCH /academies/:id/instructors/:personId` (owner/ADMIN) fija `commissionPct` del instructor - snapshot a `PrivateLesson.commissionPct` al crear/asignar y `GET /private-lessons/mine?as=instructor` devuelve `commissionClp`/`netClp` (el alumno no ve la comisión); `/api/private-lessons*` staff-only: POST crea clase manual, GET lista por academia (joins person/instructor null-safe), PATCH acciones confirm/cancel/done/reschedule/**assign** (owner: instructor+fecha a las compradas "por asignar")/**pay-commission** (owner marca `commissionPaidAt` - liquidación por fuera de la plataforma); alumno: `/api/classes/browse` (`?scope=enrolled` = solo mis academias, `?academyId=` filtra, flag `enrolled` por item), `/classes/mine` (reservas activas **+ particulares compradas mergeadas** - `series:null`, `date:null` sin agendar; `?scope=past` incluye las terminales), `/classes/:id` (+`enrolled`), `GET /private-lessons/:id` (detalle de la particular para la ficha del alumno - la comisión solo viaja a owner/instructor/admin), `/classes/:id/book` - reservar exige Enrollment vigente (ACTIVE/TRIAL/ONLINE) → 403 + cuota del plan (`MembershipPlan.weeklyClasses` por semana ISO en planes por tiempo, `classCount` del pack; ilimitado = null → 409 agotada); `Enrollment.endsAt` = "pagado hasta" (nullable: PERIOD lo deriva de `periodDays`, otros tipos lo marca staff en PATCH `/enrollments/:id`; la compra online lo calcula por tipo calendario - ver MEMBERSHIP abajo); pagos directos BYO: `GET /academies/:id/payment-methods` (métodos activos de la academia: TRANSFER/PAYMENT_LINK/CASH), `POST /academies/:id/claims` multipart (alumno sube comprobante imagen/pdf ≤5MB → PaymentClaim PENDING + notifica owner), `GET /academies/:id/claims/mine` (historial del alumno), owner: `GET/POST/PATCH/DELETE .../payment-methods*` (CRUD admin), `GET .../claims?status=` (cola de validación), `GET .../claims/:claimId/receipt` (stream autenticado del comprobante - solo alumno dueño o admin de la academia), `POST .../claims/:id/approve` (tx: Payment MEMBERSHIP PAID gateway MANUAL + enrollment extendido/creado con membershipBase/membershipEndsAt - misma regla del webhook Flow; refId `claim-<id>` no decodifica a plan → nunca devenga payout), `POST .../claims/:id/reject {reason}` | `academies.create` / owner / SessionGuard |
| gamification | `/api/gamification/*` streaks (`?mode=social|academy` - racha desde check-ins/sesiones vs asistencias), badges (nightlife + academy: primera_clase, alumno_constante, racha_academia, explorador_academias - award lazy al consultar), leaderboard, misiones | SessionGuard |
| params | `/api/params/public`, `/api/admin/params` | público / `admin.access` |
| leads | `POST /api/leads` (upsert por email, devuelve `demoToken`, notifica a ADMIN) + `POST /api/leads/:id/demo` (token en body → crea `Person` `isDemoAccount` con los roles del lead en APPROVED, enlaza `lead.personId`, emite sesión; email ya registrado → 409) | público, rate-limited por IP |
| storage | módulo global (sin rutas): puerto `STORAGE` + adaptador disco local sobre `UPLOADS_DIR` (dev `./uploads`, prod `/app/uploads` con bind mount al disco dedicado VM). Guard contra path traversal; usado por comprobantes de pago de academia (`claims/<academyId>/<uuid>.<ext>`) - los archivos **nunca** se sirven por estático público, solo por endpoint autenticado (dueño del claim o admin de la academia). | - |
| admin | `/api/admin/*` usuarios (búsqueda, ficha 360°, asignación de roles), analítica por usuario, explorador `/admin/browse/:entity` (incl. `payment-events`, `gateway-transactions`, `membership-subscriptions`), `/admin/payments/:id/verify-chain` (integridad del ledger), consola financiera `/admin/finance/summary|accrual|mrr` (GMV segmentado, devengado no liquidado por actor vía `PayoutSettlementService.unliquidatedOnly`, MRR/ARR de `PlatformSubscription`), roles, permisos, audit | `admin.access` |

## Cuentas demo (leads /pro)

- `Person.isDemoAccount` marca cuentas creadas por `POST /leads/:id/demo`.
- **Barrera de escritura en `SessionGuard`**: demo + método mutador → `403 demo_mode`, salvo whitelist self-scoped (`/auth/logout`, `/auth/password`, `/notifications/*`, `/push-tokens`, `/me/complete-profile`, `/me/consent`). Los GETs pasan con sus roles APPROVED - el demo navega su consola sin ensuciar data productiva.
- **Promoción demo→real**: `POST /auth/magic-link` → `GET /auth/verify` hace `upsertByEmail`, que marca `verifiedAt` y apaga `isDemoAccount` (el magic link prueba posesión del correo) - **excepto** si `pendingProfileAt` está set (conversión admin): ahí solo se verifica el correo y la barrera sigue activa hasta `/me/complete-profile`.
- **Conversión admin**: `POST /api/admin/leads/:id/convert` (`admin.access`, audita `LEAD_CONVERT`) - crea la `Person` si no existe (o usa la demo ligada), setea `pendingProfileAt` + `isDemoAccount`, envía magic link por email + notificación in-app `account.complete_profile`; lead → `CONTACTED`. Si el email ya es cuenta real → enlaza y `CONVERTED` directo (`alreadyReal`). Teléfono ya registrado en otra cuenta → `409 phone_exists` (`Person.phone` es unique - en `demo` y `complete-profile` también se pre-chequea).
- **Cierre del ciclo**: `POST /api/me/complete-profile` (SessionGuard, whitelisted en la barrera) - name/phone (+password opcional) → limpia `pendingProfileAt`, apaga `isDemoAccount`, lead ligado → `CONVERTED`. `/api/me` expone `isDemo` + `pendingProfile`.
- Web: banner persistente bajo el appbar cuando `pendingProfile` → `/perfil/completar` (form name/phone/password); botón "Convertir a usuario real" en filas de leads de `/admin/datos` (visible solo si `demoPending` o sin cuenta).
- El explorador admin muestra badge "demo" en filas de `people` y `demoPending` en `leads`; `demoToken` nunca sale en respuestas.

## Consentimiento legal (spec legal-consent)

- `Person.consentVersion` + `Person.consentAcceptedAt` registran la aceptación de Términos+Privacidad; la versión vigente es `CONSENT_VERSION` en `@omnidance/shared` - al publicar una versión nueva, las Person con versión distinta vuelven a ver el aviso.
- El flag `consent:true` viaja en el body de `POST /auth/register`, `/auth/login` y `/auth/magic-link` (en magic link como claim del JWT → se estampa en `GET /auth/verify`); si llega, se estampa al crear la sesión. El checkbox del form es obligatorio solo para alta/pedido de link - el login con contraseña no lo muestra.
- Cuentas legadas: `GET /me` expone ambos campos y el front muestra un banner no bloqueante (`ConsentBanner` en el layout (app)) → `POST /me/consent` estampa la versión vigente.
- Páginas públicas `/terminos` y `/privacidad` (grupo (marketing), texto en `i18n/parts/legal.json`), enlazadas desde el checkbox del login, el banner y el footer de las landings.
- El explorador admin muestra badge "demo" en filas de `people` y `demoPending` en `leads`; `demoToken` nunca sale en respuestas.

## Frontera anónima (web)

- `apps/web/src/middleware.ts`: sin cookie `omnidance_session`, toda ruta de `(app)` → `/login?next=<ruta>`. Públicas: `/`, `/pro`, `/login`, `/terminos`, `/privacidad`, `/eventos` (solo lista), `opengraph-image`, `twitter-image` - el resto de estáticos queda fuera por el matcher (`api`, `_next`, archivos con extensión).
- `/eventos` sin sesión: solo eventos de la semana, sin links al detalle, con CTA a login - "ver sin entrar a la app". `BottomNav` no renderiza chrome cuando `/me` resuelve anónimo (`meChecked && !me`) y marca `html[data-anon]` para que `ChromeShell` no reserve el padding de la tab bar.
- Tras login, `?next=` devuelve a la ruta pedida (solo rutas internas - sin open redirect).
- Estilos: `EventSeries.genres` + `Event.genres` (Genre[]: SALSA/BACHATA/CUBANO; vacío en evento → hereda la serie). En la UI `CUBANO` se muestra como "Timba" - el nombre que usa la escena.

> **Orden de controllers con prefijo compartido**: si dos controllers
> declaran el mismo `@Controller("x")`, el que registra `@Get(":id")`
> gana sobre rutas literales del otro (`x/mine` → 404). En
> `social.module.ts` `VenueConsoleController` va ANTES de
> `VenuesController` por eso - al agregar un controller con prefijo
> ya ocupado, declararlo antes que el que tenga rutas paramétricas
> de un segmento.

## Hub de eventos (`/eventos` autenticado)

- Vistas por query (`?view=`): `list` (default: Esta semana por día + Más adelante), `calendar` (`&week=YYYY-MM-DD` - cualquier fecha resuelve al lunes de su semana; franja de 7 días con puntos por género y nav prev/next semana; `&day=YYYY-MM-DD` lista los eventos del día bajo la franja) y `mios` (agenda propia: eventos futuros con `Ticket` ACTIVE del usuario). El switcher es icon-only (toggle ≡/📅 + ticket aparte). Todo SSR con links que preservan los demás params - compartibles y sin JS.
- Filtros combinables: `?genre=` **multiselect CSV** (`SALSA,BACHATA` → unión; API con `hasSome` propio o heredado), `?venue=<id>` como dropdown tipo chip (`<details>` + overlay de cierre en CSS - sin JS; el `<summary>` muestra el local activo).
- Asistencia = compra real: `Ticket` ACTIVE es la fuente de "voy" - el modelo `Rsvp` fue eliminado (GOING/INTERESTED no reflejaban asistencia real) junto a `PUT/DELETE /api/events/:id/rsvp` y `GET /api/me/rsvp`. La agenda de Mis eventos se construye con `GET /api/tickets/mine` (cookie forward en SSR); la entrada real es el QR personal - `/entradas` queda fuera del nav como página de gestión (transferencia de tickets), enlazada desde la vista `mios` y desde el post-checkout.
- Limitación conocida: claves de día/semana usan la TZ del runtime (dev = TZ del host); el producto target es America/Santiago.

## Nav del bailarín y módulos sociales

- Bottom bar DANCER: `[Inicio] [Eventos] [+] [Amigos] [Perfil]`. El "+" central (`ACTIONS_TAB`, `sheet: true` - botón, no Link) abre `DancerActionsSheet`: bottom sheet con el QR personal destacado (`MyQr compact`), botón "Escanear" (`scanHref`, solo lente social - en academia la asistencia la registra staff) + grid de módulos secundarios por lente (social: Bailes y Prácticas; academia: particulares en reservadas de /clases; Notificaciones queda solo en la campana del appbar). `role="dialog"` + focus trap (`useDialogFocus`) + Escape/backdrop/ruta cierran; motion-reduce instantáneo.
- El drawer lateral (`SideDrawer`) ya no aplica al rol DANCER en ninguna lente - los demás roles lo conservan.
- `/bailes` solo muestra sesiones de baile escaneadas por QR (DanceSession + SessionRating). "Disponibles ahora" (`AvailabilitySection`) y "Busco pareja" (`PartnerRequests`) se movieron a `/practicas`, que es el hub de encontrar con quién practicar junto al listado de prácticas publicadas.
- Amigos: `/amigos` incluye "Tus amigos van a" (`GET /api/friends/upcoming-events` - eventos futuros con ≥1 amigo confirmado con ticket ACTIVE, con stack de avatares); `/amigos/[id]` muestra "Próximos eventos" del perfil solo si la amistad está ACCEPTED (`GET /api/people/:id` incluye `upcomingEvents` condicional - ausente para no-amigos). `Ticket.eventId` es escalar → los joins son manuales en el controller.

## RBAC - todo DB-driven

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
- `ADMIN` es `isSuperuser` - bypass total, solo seteable por seed (no vía API admin).
- Los roles **no son auto-solicitables**: la única vía es la asignación admin desde `/admin/usuarios` (`Role.requestable` quedó inerte en el schema).
- `@RequireRoles` existe como escape hatch pero ningún controller lo usa - todo es `@RequirePermissions`.

## Parámetros de plataforma

`PlatformParam` (JSON por key, cache 30s, `getNumber(key, fallback→env→default)`):

| Key | Consumidor | Default |
|---|---|---|
| `fees.managed_allin_pct` | checkout + payouts - comisión todo incluido al productor (%); cadena `Event.platformFeePct` → `ProducerParams.platformFeePct` → este param (spec producer-fee-model) | 10 |
| `payments.default_gateway` | checkout - proveedor de órdenes nuevas (`FLOW`/`MERCADOPAGO`/`FINTOC`); se resuelve contra el `GatewayRegistry` - provider sin credenciales cae al default del env (spec gateway-port-normalization) | `FLOW` |
| `payments.subscription_gateway` | subscriptions + platform-subscriptions - proveedor del motor de suscripciones; se resuelve contra el `GatewayRegistry` y exige capability `SubscriptionProvider` - un provider sin motor de subs falla explícito, sin fallback (spec subscription-port-generic) | `FLOW` |
| `gateway_fee.card_pct` | checkout - pasarela esperada del desglose all-in (`gatewayFeeExpected`) | 3.19 |
| `tax.iva_pct` | checkout + payouts - IVA sobre el fee neto de plataforma | 19 |
| `platform_fee.default_pct` | **legacy** - solo pagos pre-modelo (`feeMode` null) | 0 |
| `gateway_fee.academy_passthrough_pct` | payout ACADEMY - línea `GATEWAY_FEE_PASSTHROUGH` = `round(gross × pct / 100)` | 3.19 |
| ~~`service_fee.*`~~ | **fuera del modelo** (producer-fee-model: el comprador paga precio exacto). Filas legacy pueden persistir en DB; solo las lee el settle para reconstruir tickets de pagos legacy | - |
| `session.cooldown_minutes` | sessions scan | 4 |
| `qr.rotation_seconds` | QR mint | 60 |
| `prime_time.window_minutes` | gamificación (default de creación de eventos) | 30 |
| `prime_time.threshold_pct` | gamificación fallback aforo | 0.2 |
| `classes.cancel_refund_minutes` | cancelación de reserva con devolución de crédito | 60 |
| `academy.insights.expiring_days` | dashboard de academia - ventana "planes por vencer" | 14 |
| `academy.insights.birthday_days` | dashboard de academia - ventana "cumpleaños próximos" | 30 |
| `academy.renewal.first_notice_days` | `AcademyRemindersService` - email "por vencer" si `endsAt` cae en esta ventana | 5 |
| `academy.renewal.grace_days` | `AcademyRemindersService` (email "en gracia") + `resolveQuota` (vigencia efectiva de reservas: vencido solo agenda clases ≤ `endsAt + grace`) | 5 |
| `presale.cutoff_hour` | fallback global del corte de preventa (hora del día del evento); la cadena real es `Event.presaleCutoffMinutes` → `ProducerParams.presaleCutoffMinutes` → este param (`resolvePresaleCutoffMinutes`, spec event-presale-cutoff) | 19 |

Edición en vivo vía `PUT /api/admin/params/:key` (audita `PARAM_UPDATE`). El seed hace `upsert` con `update:{}` - **no pisa valores editados**.

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
| `sessions.scan` | sessions | crea `DanceSession` CONFIRMED desde el QR + notify `session.confirmed` a la persona escaneada + evalúa badges de ambos + puntos `session_confirmed` |

| `sessions.rate` | sessions | `status → RATED` + evalúa badges de rater y rated |
| `webhook PAID` | payments | notify TRANSACTIONAL `payment.paid` (solo si esta llamada marcó PAID - flag `paidNow` en la tx) |
| `webhook FAILED` | payments | notify `payment.failed` |
| `waitlist.promote` | social | notify SOCIAL `waitlist.promoted` |

`RATED` cuenta como actividad confirmada en streaks/badges/misiones/leaderboard (`confirmedSessions*` incluye `["CONFIRMED","RATED"]`).

## Pasarela de pago (multi-proveedor)

**Puerto normalizado** (spec gateway-port-normalization): cada adaptador implementa `PaymentGateway` (`createOrder` recibe `currency`; `verifyWebhook`/`refreshStatus` normalizan al mismo resultado `{refId, status, gatewayData}` donde `gatewayData` es la forma plana `{fee, amount, media, transferDate, currency}` que el settle persiste). `GatewayRegistry` (token `PAYMENT_GATEWAYS`) indexa los adaptadores instanciados por env; `PAYMENT_GATEWAY` sigue exportando el default para compat. `Payment.gateway` persiste el proveedor que creó la orden (`FLOW`/`MERCADOPAGO`/`FINTOC`/`STUB`; `FREE`/`MANUAL` = sin pasarela).

- **Webhooks**: `POST /api/payments/webhook` (legacy → adaptador default - el `urlConfirmation` de Flow ya configurado sigue funcionando) y `POST /api/payments/webhook/:provider` (despacha por registry; provider no registrado → 404). Ambos caen al mismo `confirm` → `PaymentSettlementService.settle` (idempotente). El settle cruza `gatewayData.amount` **y `currency`** contra la orden → `AMOUNT_MISMATCH` + notify OPERATIONAL.
- **Selección de proveedor por orden**: el checkout lee `payments.default_gateway` y resuelve contra el registry (provider no registrado → cae al default). El polling `GET /payments/:id` consulta `refreshStatus` del adaptador persistido en `Payment.gateway` - nunca el default.
- **Flow** (`FLOW_API_KEY` + `FLOW_SECRET_KEY`, sandbox.flow.cl → Mis datos → Integraciones): `PAYMENT_GATEWAY=flow`. Sandbox-only: `FLOW_BASE_URL` debe ser `https://sandbox.flow.cl/api` - cualquier otro valor hace fail-fast al boot; producción (`https://www.flow.cl/api`) se habilita tras validar end-to-end en sandbox. Firma HMAC-SHA256 sobre params ordenados alfabéticamente, enviada como `s` - nunca loggear keys ni firmas.
- **MercadoPago** (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_BASE_URL` opcional): se registra cuando el token existe y convive con Flow. `createOrder` = preference (`init_point` + `external_reference`=refId + `notification_url`=`/api/payments/webhook/MERCADOPAGO`); el webhook topic `payment` consulta `GET /v1/payments/:id` y normaliza (`approved`→PAID, `rejected`/`cancelled`/`refunded`/`charged_back`→FAILED; un estado no-terminal lanza → 400 y MP reintenta la notificación hasta el estado final). `refreshStatus` busca pagos por `external_reference`. Monedas soportadas: CLP/USD/EUR/MXN/ARS/BRL/COP/PEN/UYU - fuera de esa lista falla antes de crear la preferencia (Flow solo acepta CLP).

- **Fintoc** (spec fintoc-gateway-adapter; `FINTOC_SECRET_KEY` + `FINTOC_WEBHOOK_SECRET` + `FINTOC_BASE_URL` opcional): A2A CL/MX. `createOrder` = `POST /v2/checkout_sessions` (`flow:"payment"`, `metadata.refId`; `redirect_url` = `paymentUrl`, `cs_…` persiste en `Payment.gatewayRef`). El webhook `FINTOC` se verifica por **`Fintoc-Signature`** (HMAC-SHA256 de `t.rawBody` con el secret del endpoint, tolerancia 5 min — el puerto ganó `verifyWebhook(body, ctx)` con `{rawBody, headers}` y Nest arranca con `rawBody:true`; Flow/MP ignoran el ctx) y luego confirma por `GET /v2/checkout_sessions/:id` (fetch-confirm, mismo patrón que MP). Estado no terminal → error → Fintoc reintenta. `refreshStatus` consulta la sesión por `Payment.gatewayRef` (`ctx.gatewayRef` — no hay búsqueda por metadata). Monedas: CLP/MXN. No implementa `SubscriptionProvider`. Cuenta propia: provider `FINTOC` con `apiKey`=secret key y `secret`=webhook endpoint secret (`whsec_`, obligatorio).
- **`API_URL`** es la URL pública de la API para los `notification_url`. En local las pasarelas no alcanzan `localhost`, por eso el polling del checkout liquida igual al volver.
- **Tarifa Flow**: ~3.19% sobre el bruto cobrado por tarjeta - costo nuestro (merchant fee), contenido en la comisión all-in del productor (spec producer-fee-model: el payout MANAGED descuenta pasarela + neto + IVA como `PayoutLine`s por orden, leyendo solo el desglose congelado del Payment). Payout de **academia** (modelo SaaS): `platformFee=0` - solo se descuenta la pasarela al costo como `GATEWAY_FEE_PASSTHROUGH` (real `gatewayFeeClp` o estimada por `gateway_fee.academy_passthrough_pct`). Órdenes de academia (MEMBERSHIP/WORKSHOP/PRIVATE) llevan `feeMode=ACADEMY` - el alumno paga solo el precio que fija la academia.
- **Cuentas de pasarela del productor** (spec producer-gateway-accounts): un productor puede cobrar sus ventas en **su propia cuenta** Flow/MercadoPago/Fintoc — la plata llega directo a él y la plataforma devenga su comisión (`all-in − card%`) neteándola en el payout como líneas `OWN_METHOD_*` (`feeMode=OWN_GATEWAY`). `ProducerGatewayAccount` persiste `{producerId, provider, credentialsEnc, keyMask, status, lastError, verifiedAt}`: credenciales **cifradas AES-256-GCM** (`PRODUCER_GATEWAY_KEY`, 64-hex env; blob `v1.<iv>.<tag>.<ct>` en `common/secrets.ts`), nunca en plano ni por API (solo `keyMask` últimos 4). Una ACTIVE por productor (un upsert desactiva la anterior); `STUB` solo fuera de producción. `GatewayAccountsService` fabrica el adaptador por cuenta (decrypt → `FlowGateway`/`MercadoPagoGateway`/`FintocGateway` con su propia `urlConfirmation` `…/webhook/<PROVIDER>?account=<id>`; cache por `accountId+updatedAt`), estampa `gatewayAccountId` en `GatewayTransaction` y `lastError`/`verifiedAt` en la cuenta. **Checkout** (ticket + series-pass): cuenta ACTIVE del productor → su adaptador; sin cuenta → default MANAGED. Órdenes de academia y suscripciones **jamás** salen por cuenta de productor. **Webhook** `?account=<id>` resuelve el adaptador de la cuenta y exige provider de ruta = provider de cuenta y `Payment.gatewayAccountId` = cuenta — mismatch → 400 (la ruta de plataforma tampoco confirma pagos de cuenta propia). **Polling** `GET /payments/:id` consulta `refreshStatus` contra el adaptador de `Payment.gatewayAccountId` (cuenta desactivada → falla suave, devuelve el estado local). Endpoints `GET|PUT|DELETE /api/producer/gateway-account` (PRODUCER APPROVED o `admin.access`; respuesta masked + `webhookUrl` a configurar en el panel del proveedor); sección "Mi pasarela" en `/productor/parametros`.
- **Medios de cobro propios del productor** (spec producer-own-methods): el productor publica `ProducerPaymentMethod` (`TRANSFER`/`PAYMENT_LINK`/`CASH` + `label` + `details`) y el comprador los elige en el checkout de ticket o pase de serie (`methodId` en `POST /checkout/ticket|series-pass`). La orden queda `Payment` PENDING `gateway:"MANUAL"` `gatewayAccountId:null` `feeMode:"OWN_METHOD"` con el desglose congelado (`all-in − card%` — la plata nunca pasa por la plataforma y el fee se netea en el payout como líneas `OWN_METHOD_*`); la respuesta devuelve `paymentUrl:null` + `{method:{type,label,details}}` en vez de redirect. El comprador sube el comprobante → `TicketClaim` PENDING sobre su orden (`POST /payments/:id/claims` multipart, imagen/PDF ≤5MB en `claims/<producerId>/` del storage privado); la cola `GET /producer/claims` permite al productor aprobar (flip atómico PENDING→APPROVED + el **mismo `settle` del webhook** → ticket/pase/mesa/código/ledger/notificación, idempotente ante doble aprobación concurrente) o rechazar con motivo obligatorio (la orden sigue PENDING y admite re-intento). `GET /producer/claims/:id/receipt` sirve la evidencia solo a comprador dueño, productor o admin. El productor resuelve por `event.producerId` (ticket) o la serie del `refId` (pase). UI: picker de método en checkout + `/productor/comprobantes` (cola) + sección en `/productor/parametros`.
- **Suscripciones multi-proveedor** (spec subscription-port-generic): `SubscriptionProvider` es la capability opcional del puerto (`ensurePlan`/`syncPlan`, `createCustomer`/`getCustomer`, `registerCustomerCard`/`getRegisterStatus`, `createSubscription`/`getSubscription`/`cancelSubscription`). Todo lo que cruza la frontera es genérico: `RemoteSubscription {subscriptionId, planId, status: ACTIVE|CANCELED|PENDING|UNKNOWN, rawStatus?, morose, cancelAtPeriodEnd, nextInvoiceDate?, invoices: SubscriptionInvoice[]}` donde cada invoice trae `paid` resuelto y `payment {orderRef, data}` normalizados, `RemoteCustomer {hasCard}` y el registro de tarjeta `{registered, customerId}`. Los códigos crudos del proveedor **nunca salen del adaptador**: Flow traduce `status 4`→`CANCELED`, `1`→`ACTIVE`, resto→`UNKNOWN`+`rawStatus` (diagnóstico; el dominio lo trata como vigente y el reconcile corrige), `morose`/`cancel_at_period_end`→booleanos, `flowOrder`→`orderRef`, `paymentData`→`data`. Los services resuelven el provider leyendo `payments.subscription_gateway` contra el `GatewayRegistry` **por cada operación** (el param se puede cambiar en caliente) y detectan capability por presencia del método - nunca por `gateway.name`; un provider configurado sin motor de subs lanza `BadRequestException` explícito, sin fallback silencioso. `MercadoPagoGateway`/`FintocGateway` no implementan `SubscriptionProvider` hoy - elegirlos como subscription_gateway haría fallar los flujos de suscripción mientras el checkout sigue operando.

### Modelo de datos - ledger y suscripciones

| Modelo | Rol |
|---|---|
| `GatewayTransaction` | Auditoría **append-only** de cada request/response contra la pasarela (nunca update/delete): `provider`, `direction` (`OUTBOUND` llamada saliente / `INBOUND_WEBHOOK` callback recibido), `endpoint` (`payment/create`, `subscription/get`…), `correlationId` (uuid por operación de negocio - enlaza la cadena de llamadas de una acción), `requestBody`/`responseBody`, `httpStatus`/`durationMs`/`ok`/`error`, `paymentId`, `gatewayAccountId` (cuenta propia del productor cuando la llamada corrió por sus credenciales). Evidencia primaria ante disputas con Flow. Payloads **sanitizados en escritura** (`sanitizeGatewayPayload`): la firma `s` se persiste como huella `sha256:<16 hex>` - correlacionable sin guardar la firma (recomputable con el secret, funciona como credencial); el secret nunca llega como param. Idempotente en valor: un `s` que ya viene `sha256:…` no se re-hashea (un hash del hash rompería la correlación). |
| `ProducerGatewayAccount` | Cuenta de pasarela propia del productor (spec producer-gateway-accounts): `producerId`, `provider`, `credentialsEnc` (AES-256-GCM con `PRODUCER_GATEWAY_KEY` - nunca plano), `keyMask` (únicos 4 visibles), `status` (una `ACTIVE` por productor - un upsert desactiva la anterior), `lastError`/`verifiedAt` (estampados por el wrapper onTx del adaptador). `Payment.gatewayAccountId` apunta a la cuenta que creó la orden (null = pasarela de plataforma). |
| `ProducerPaymentMethod` | Medio de cobro directo del productor (spec producer-own-methods): `type` (`TRANSFER`/`PAYMENT_LINK`/`CASH`), `label`, `details` (banco/cuenta/RUT para transferencia, `url` para link, `instructions` para efectivo), `order`, `active`. Los activos se exponen al comprador vía `GET /events/:id/payment-methods` (resuelve `event.producerId`; sin productor → `[]`). |
| `TicketClaim` | Comprobante del comprador sobre una orden MANUAL PENDING (spec producer-own-methods): `paymentId` (la orden ya existe - a diferencia del `PaymentClaim` de academia que **crea** el pago al aprobar), `personId` (comprador), `producerId` (desnormalizado para la cola), `receiptKey` (storage privado), snapshot `methodType`/`methodLabel`, `status` PENDING→APPROVED/REJECTED con `reviewedById`/`reviewedAt`/`reviewNote`. Aprobar = flip atómico + `settle` del webhook; rechazar exige motivo visible al comprador. |
| `PaymentEvent` | Ledger de dominio append-only con **hash-chain por payment**: `payloadHash = sha256(prevHash + canonicalJson({paymentId,seq,type,actor,payload}))`, `prevHash="GENESIS"` en el primer evento. Editar una fila rompe la cadena en el siguiente evento → tamper-evident. Tipos: `ORDER_CREATED`, `GATEWAY_REQUEST`, `WEBHOOK_RECEIVED`, `STATUS_CONFIRMED`, `SETTLED`, `RENEWAL_SETTLED`, `FAILED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_CANCELED`, `RENEWAL_FAILED`, `AMOUNT_MISMATCH`, `IMPORTED`. Actores: `system`, `webhook`, `polling`, `admin`, `cron`, `migration`, `person`, `reconcile`. Se emite **dentro** de la tx de negocio (el caller pasa el tx client). |
| `MembershipSubscription` | Suscripción recurrente a un `MembershipPlan` (motor del `SubscriptionProvider` configurado en `payments.subscription_gateway`). Estados: `PENDING_CARD` → `ACTIVATING` → `ACTIVE` → `CANCEL_PENDING` → `CANCELED` (+ `FAILED_CARD` reservado). `ACTIVATING` es el claim transitorio entre el registro de tarjeta y `createSubscription` - evita doble cobro por carrera entre `subscribe` y `customerReturn`. Campos: `flowSubscriptionId` (unique - el id remoto del proveedor; el nombre quedó de Flow pero es genérico), `nextInvoiceAt` (de `RemoteSubscription.nextInvoiceDate`, alimenta el reminder), `lastInvoiceId` (dedup de renovaciones liquidadas), `reminderSentFor` (dedup del aviso pre-cobro), `canceledAt`. |
| `PlatformSubscription` | Suscripción que la **plataforma** cobra al actor (spec academy-saas-billing) - mismo ciclo de vida y mismo `SubscriptionProvider` que la membresía, pero sin plan local: `tierCode` (String - cubre `AcademyTier` para `kind=ACADEMY` y `ProducerProTier` para `kind=PRODUCER`) + `billingCycle` resuelven precio/límites desde `PlatformParam` (`academy_tier.*`, `producer_tier.*`). `academyId`/`producerId` según kind, `personId` = pagador (owner / productor). `pendingTierCode`/`pendingBillingCycle` guardan un downgrade o cambio de ciclo que el reconcile aplica cuando la remota vieja termina su período (`CANCELED` → swap a `createSubscription` del plan pendiente). |
| `Academy.tier/billingCycle/trialEndsAt/billingGraceUntil/billingBlockedAt` | Proyección SaaS de la academia (S2/S3): `trialEndsAt` se siembra al crearla (`academy_billing.trial_days`, 30d; backfill 60d a las existentes via `migration_grace_days`); `billingGraceUntil` lo fija una renovación fallida (`academy_billing.grace_days`, 5d); el job diario `enforceAcademyBlocks` convierte la gracia vencida en `billingBlockedAt` (consola read-only, fuera de explorar) y `RENEWAL_SETTLED` limpia ambos campos - el cobro recuperado desbloquea sin esperar al job. |
| `Person.proTier` (`ProducerProTier`, default FREE) + `proTrialEndsAt` | Tier Producer Pro vigente - se proyecta desde la `PlatformSubscription kind=PRODUCER` al activar/renovar. `proTrialEndsAt` es el trial de lanzamiento del gating (S5): la migración backfillea +90d a los productores registrados (`ProducerParams`) para que nadie pierda features que ya usaba. `isProActive(person)` = `proTier != FREE || proTrialEndsAt > now` - es la condición única del gate. La mora de Pro **no** bloquea ticketing ni marketplace (solo avisa + pierde las features Pro). |

- **`Payment.gateway*` - verdad monetaria de la pasarela**: `gatewayFeeClp` (costo real del cobro, auditable contra la tarifa ~3.19%), `gatewayReportedAmount`, `gatewayMedia`, `gatewayPaidAt`, `gatewayRaw` (`paymentData` completo de `payment/getStatus` - evidencia interna, solo sale por admin/browse). Los persiste el settle en el mismo update `→PAID` dentro de la tx; `gatewayReportedAmount ≠ amount` → evento `AMOUNT_MISMATCH` + notificación OPERATIONAL a los ADMIN.
- **`Payment.feeMode` + desglose congelado (spec producer-fee-model)**: al crear la orden se persisten `feeMode` (`MANAGED`/`OWN_METHOD`/`OWN_GATEWAY`/`ACADEMY`/`FREE`; null = pre-modelo → regla legacy), `platformFeeRate` (snapshot del % all-in resuelto por cadena evento→productor→`fees.managed_allin_pct`), `platformFeeNetClp`/`platformFeeVatClp`, `gatewayFeeExpected`, `producerNetClp`, `currency`, y se emite `FEE_ASSESSED` al ledger en la misma tx. Los payouts leen solo este snapshot - jamás recalculan tasas vigentes.
- **`PayoutLine`** (spec producer-fee-model): deducción auditable por orden - `type` (`GATEWAY_FEE_PASSTHROUGH` / `PLATFORM_FEE_NET` / `PLATFORM_FEE_VAT` / `OWN_METHOD_FEE_NET` / `OWN_METHOD_FEE_VAT` / `MANUAL_ADJUSTMENT`), `amount`, `paymentId` (rastreo a la orden) y `meta` (orderAmount, rate, estimated/legacy). `Payout.net = gross − Σ líneas`; cada línea emite `PAYOUT_LINE_ASSIGNED` al ledger del pago. Los tipos `OWN_METHOD_*` son comisión devengada de ventas por métodos propios del actor - se **netean** contra el payout gestionado sin entrar al gross.
- **`PayoutSettlementService`** (spec admin-finance-console): el motor de liquidación vive en `payments/application/payout-settlement.service.ts` (extraído del controller) - `AdminPayoutsController` lo usa para `generate`, y `AdminFinanceController` para `GET /admin/finance/accrual` con `unliquidatedOnly` (`payoutLines: {none:{}}` en el where): el devengado no liquidado usa exactamente las mismas reglas de atribución/fee que la liquidación, una sola fuente de verdad.
- **Consola financiera `/admin/finanzas`** (web + `AdminFinanceController`): KPIs del período (GMV segmentado social/academia/SaaS - los cobros por métodos propios se reportan aparte porque la plata nunca pasó por la plataforma; ingreso plataforma neto+IVA+SaaS; costo pasarela real-o-esperado; por transferir PENDING+APPROVED), tabs Liquidaciones (lista payouts con `PayoutLine`s expandibles + aprobar/pagar con `evidenceUrl` - mismos endpoints `/admin/payouts/*`), Por liberar (devengado por actor con `ownMethodReceivable` separado - es plata que el actor debe, se netea) y SaaS (MRR/ARR por `PlatformSubscription` activa, normalizado por ciclo + funnel de estados + contratos a medida). `/admin/browse/payments` suma el desglose congelado (`feeMode`/`platformFeeRate`/`producerNetClp`/`gatewayFeeClp` con fallback al esperado/`currency`).
- **`Person.flowCustomerId`** y **`MembershipPlan.flowPlanId`**: mapeo lazy a los espejos Flow - se materializan en el primer `subscribe` (`customer/create` requiere email en la cuenta; `ensurePlan` crea el plan `omni_<planId>` si `plans/get` no lo encuentra).

### Endpoints de pagos y suscripciones

| Ruta | Acceso | Qué hace |
|---|---|---|
| `POST /checkout/membership-subscription` | SessionGuard | `{planId, acceptRecurring:true}` - solo planes recurrentes (MONTHLY/QUARTERLY/SEMIANNUAL; `acceptRecurring` es el consentimiento explícito del cobro). Devuelve `{kind:"needs_card", registerUrl, subscriptionId}` si el customer Flow aún no registra tarjeta, o `{kind:"subscribed"}` si Flow creó la suscripción directo (cobra el 1er período ya). |
| `POST /payments/flow/customer-return` | **público** | Retorno del disclaimer de tarjeta: Flow hace POST del browser con `{token}` (`url_return` de `customer/register`). Registra el INBOUND en GatewayTransaction, reanuda la `PENDING_CARD` del customer → `subscription/create` → ACTIVE, y responde **303** a `/academias/:academyId?sub=ok` (o `?sub=error`) - nunca error HTTP al browser, el redirect es la respuesta. |
| `POST /payments/subscription-webhook` | **público** | `urlCallback` de los Flow-plans (registrado por `plans/create`): Flow avisa cobros/mora/cancelaciones. Registra el INBOUND y dispara `reconcileAll` fire-and-forget - **200 siempre** (un no-200 haría a Flow reintentar y repetir el barrido). Sin `token` no se dispara el sweep: el endpoint es público y cada reconcile ejecuta N llamadas firmadas a Flow (anti-amplificación). |
| `GET /subscriptions/mine` | SessionGuard | Suscripciones del usuario, más reciente primero, con plan + academia resueltos. |
| `GET /subscriptions/:id` | owner | Detalle con **refresh activo**: `subscription/get` + reconcile de invoices pagados - cubre sandbox/dev donde el webhook no llega; si Flow no responde devuelve el estado local. |
| `POST /subscriptions/:id/cancel` | owner | `subscription/cancel at_period_end=1` → `CANCEL_PENDING` (conserva el acceso hasta el fin del período pagado). Idempotente: `CANCEL_PENDING`/`CANCELED` responden OK; una `PENDING_CARD` (nunca llegó a Flow) se cancela solo local. |
| `GET /payments/mine` | SessionGuard | Historial propio (≤100, recientes primero) con `eventCount` del ledger, contexto resuelto (`eventName`/`seriesName`/`academyName`+`planName` vía decode del refId) y campos `gateway*` - **`gatewayRaw` nunca sale** (evidencia interna). |
| `GET /payments/by-event/:eventId` | productor del evento / `admin.access` | Ventas del evento - solo órdenes con `eventId` directo (un SERIES_PASS devenga por serie en payouts; mezclarlo inflaría la recaudación del evento). |
| `GET /payments/by-academy/:academyId` | capacidad `payments` (owner / `admin.access` / staff con flag) | Cobros MEMBERSHIP + WORKSHOP (`wks_` → clase → slot.academyId) + PRIVATE (`pvt_` → academyId directo) de la academia (mismo decode+belongs de payouts). |
| `GET /payments/:id/events` | dueño del pago / `admin.access` | Ledger append-only del pago ordenado por `seq` - payload + `payloadHash` completos (la evidencia tamper-evident). 404 para ajenos (misma política anti-enumeración que `GET /payments/:id`). |
| `GET /admin/payments/:id/verify-chain` | `admin.access` | Re-calcula el hash-chain completo (`verifyPaymentChain`) → `{ok, events, firstBadSeq?}` - una fila adulterada rompe la cadena en `seq ≥ firstBadSeq`. |
| `POST /academies/:id/subscribe` | capacidad `billing` (`AcademyAccess.requireCapability`) | `{tier, cycle, acceptRecurring:true}` - contrata el SaaS de la academia: verifica `Enrollment` activos (`ACTIVE|TRIAL|ONLINE`) contra `academy_tier.<tier>_max_students` → 400 `{error:"tier_limit", active, max}` si no cabe; crea `PlatformSubscription` PENDING_CARD y devuelve `{paymentUrl, subscriptionId, status}` (`paymentUrl` = disclaimer Flow; null si ya tenía tarjeta → ACTIVE directo). ENTERPRISE = contratación manual → 400. |
| `PATCH /academies/:id/subscription` | capacidad `billing` | `{tier?, cycle?}` - upgrade de tier **inmediato** (cancel remota inmediata + `subscription/create` del plan nuevo - cobra el ciclo completo; prorateo manual v1); downgrade/cambio de ciclo → `pendingTierCode`/`pendingBillingCycle` + cancel remota a fin de período (el reconcile recrea la sub al fin del ciclo). La validación de límite aplica siempre al tier destino. |
| `POST /academies/:id/subscription/cancel` | capacidad `billing` | Cancel a fin del período pagado → `CANCEL_PENDING`. Idempotente; limpia un cambio pendiente. |
| `GET /academies/:id/billing` | capacidad `billing` | Vista de billing: tier/ciclo vigentes y pendientes, `activeStudents` vs `maxStudents`, `nextInvoiceAt`, `trialEndsAt`, `graceDaysLeft`, `blocked`, e `invoices` (Payments PLATFORM_SUB de sus suscripciones). Refresh activo contra Flow como `GET /subscriptions/:id`. |
| `POST /producers/:id/pro/subscribe` | self / `admin.access` + target PRODUCER APPROVED | `{cycle, acceptRecurring:true}` - el tier se calcula por facturación: media bruta de TICKET+SERIES_PASS propios en 90d ÷ 3 contra `producer_tier.*_max_monthly_clp` → PRO_STARTER/PRO_GROWTH; sobre el tope → 400 `tier_limit` (PRO_BIG = manual). |
| `POST /producers/:id/pro/cancel` / `GET /producers/:id/pro` | self / `admin.access` | Cancel a fin de período / vista: `proTier`, `proTrialEndsAt`, `effectivePro` (isProActive - el front decide el paywall), suscripción, `monthlyGross` vs `maxGross`, `nextInvoiceAt`. |
| `POST /payments/flow/platform-customer-return` | **público** | Retorno del disclaimer de tarjeta para subs de plataforma - endpoint **propio** (el token de `getRegisterStatus` se consume una vez: cada dominio resuelve sus pendientes en su callback). 303 a `/academias/:id?sub=ok` o `/productor?pro=ok`; nunca error HTTP. |

`/admin/browse/:entity` suma las entidades de auditoría: **`payment-events`** (filtros `paymentId`/`type`/`actor`/`from`/`to` - devuelve payload y hashes completos), **`gateway-transactions`** (`paymentId`/`endpoint`/`direction`/`ok`/`correlationId`/`from`/`to` - bodies ya sanitizados en escritura) y **`membership-subscriptions`** (`personId`/`academyId`/`status`/`from`/`to` - person/academy resueltos a `{id,name}`).

### Ciclo de vida de la suscripción (`SubscriptionsService`)

- **subscribe**: valida plan activo + recurrente + consentimiento; materializa lazy el plan espejo (`omni_<planId>`, `amount = price` - sin cargo de servicio en el modelo SaaS, `interval=3` mensual con `interval_count` 1/3/6) y el customer Flow. **Concurrencia**: el re-check de sub viva + la elección/creación de la `PENDING_CARD` van en una tx corta con advisory lock `pg_advisory_xact_lock(hashtext("sub:<personId>"))` **por persona** - el token de customer-return ata customer→person (no a una sub concreta), así que el subscribe barre las `PENDING_CARD` pendientes del usuario de **cualquier** plan (cancel dirigido por fila, condicional por status). Las llamadas HTTP a Flow van **fuera** de la tx. Una `PENDING_CARD` fresca del mismo plan (<15 min) se reutiliza - idempotencia del retry; una expirada se reemplaza.
- **Claim anti-doble-cobro**: antes de `subscription/create`, tanto `subscribe` (tarjeta ya registrada) como `customerReturn` hacen updateMany atómico `PENDING_CARD→ACTIVATING` - el primero que gana ejecuta el cobro, el perdedor responde sin duplicar (409 o éxito si ya quedó ACTIVE). Regla de la sección crítica: **todo** update de status es condicional por el status esperado - nunca un update incondicional sobre una fila cuyo estado pudo moverse fuera de la tx.
- **customerReturn**: `getRegisterStatus` confirma la tarjeta → claim → `createSubscription` (start = hoy; el proveedor cobra el 1er período y fija `nextInvoiceDate`) → persistir `flowSubscriptionId` **de inmediato** (cierra la ventana crash-entre-llamada-y-update) → `ACTIVE` + reconcile best-effort del primer invoice + notify `membership.subscription_started`. Si `createSubscription` falla, el claim revierte a `PENDING_CARD` (evita el 409 eterno); si la sub remota nace pero el update local falla, se **compensa** con `cancelSubscription` inmediato. `fs.status` `CANCELED` → `CANCELED`; `UNKNOWN`/otro → warn + ACTIVE (el reconcile corrige - nunca se abandona una remota viva).
- **Reconcile** (`reconcileSubscription`, compartido por los tres gatillos): `getSubscription` → invoices con `paid=true` (regla resuelta en el adaptador) → cada una nueva crea `Payment` `mem_<planId>_<invoiceId>` + `ORDER_CREATED` + `settleMembership(kind:"renewal")` → `RENEWAL_SETTLED`, extendiendo `Enrollment.endsAt` igual que una compra manual. Dedup por `lastInvoiceId` + refId único; un Payment PENDING huérfano (settle que falló post-create) se reintenta - `settleMembership` re-chequea status dentro de su tx. Sync de estado: `nextInvoiceDate → nextInvoiceAt`, `cancelAtPeriodEnd → CANCEL_PENDING`, `CANCELED → CANCELED` (los campos crudos del proveedor - Flow a veces devuelve strings `"4"` - se coercen y traducen en el adaptador, nunca aquí).
- **Tres gatillos del mismo barrido**: webhook `subscription/callback` (fast-path fire-and-forget), polling de `GET /subscriptions/:id` (por sub), y **cron diario 09:00** (`SubscriptionsScheduler` → `reconcileAll` - red de seguridad real; en `NODE_ENV=test` no se registra). `reconcileAll` además **barre subs huérfanas**: `GatewayTransaction`s exitosas de `subscription/create` cuyo `subscriptionId` remoto no tiene fila local viva (pasado el grace de 2 min - un `subscription/create` más reciente puede ser un request en vuelo) → `subscription/get` + `subscription/cancel` inmediato - red de seguridad si la compensación del crash también falló.
- **Reminder pre-cobro**: `nextInvoiceAt` dentro de las próximas 24 h + `status=ACTIVE` → notify `membership.renewal_reminder`; dedup por `reminderSentFor === nextInvoiceAt` (si Flow mueve la fecha, se vuelve a avisar; nunca por cobros ya pasados).
- **Mora**: `morose` con invoice impaga → notify `membership.renewal_failed` una vez por episodio (dedup por la invoice impaga más antigua - clave estable mientras dure la mora) + evento `RENEWAL_FAILED` en el ledger del último pago `mem_*` (mismo anchor que `SUBSCRIPTION_CANCELED` del cancel). **Sin grace period**: el enrollment expira solo en `endsAt` - la sub no se marca CANCELED por mora (el proveedor reintenta el cobro, sigue viva).
- **Capacidades por puerto, no por nombre**: ambos services resuelven el provider leyendo `payments.subscription_gateway` contra el `GatewayRegistry` en cada operación y verifican capability por la presencia de los métodos de `SubscriptionProvider` - nunca por `gateway.name` ni fallback silencioso. `StubGateway` los implementa en memoria (el estado se pierde al reiniciar: una sub desconocida reporta `CANCELED` → la fila local converge en el próximo reconcile). El flujo completo se ejerce sin credenciales Flow en localhost: `registerCustomerCard` devuelve `registerUrl = returnUrl + ?token=stub_reg_*` (el browser cae directo en `customer-return` sin salir de localhost), `getRegisterStatus` consume el token y marca la tarjeta, y `createSubscription` crea la sub `stub_sub_*` con su primera invoice ya pagada → el reconcile la liquida como renovación. Customers idempotentes por externalId (`stub_cus_<personId>`); `ensurePlan`/`syncPlan` mantienen los planes espejo en un Map.

### Suscripciones de plataforma (`PlatformSubscriptionsService` - spec academy-saas-billing)

Mismo ciclo de vida y mismas reglas de concurrencia que `SubscriptionsService` (PENDING_CARD → claim ACTIVATING → `subscription/create` → ACTIVE; advisory lock `platsub:<personId>` en la tx de elección de fila; claim/transition condicionales; persistencia temprana del `flowSubscriptionId`; compensación cancel-inmediata de remotas huérfanas - el sweep de huérfanas es compartido y cubre ambas tablas). Diferencias deliberadas:

- **Plan espejo compartido por tier**: `plat_academy_<tier>_<cycle>` / `plat_producer_<tier>_<cycle>` (vs `omni_<planId>` por plan de academia). `ensurePlan` materializa el plan Flow con `amount = mensual-equivalente del param × meses del ciclo` e `interval_count` = meses (1/6/12 - `interval=3` mensual fijo, igual que membresías). Los descuentos semestral −2% / anual −4% ya vienen en `academy_tier.*_clp` / `producer_tier.*_clp`.
- **refId `platsub_<subId>_<invoiceId>`** (`encodePlatformSubRef`/`decodePlatformSubRef` en `order-ref.ts`), `orderType=PLATFORM_SUB`: el reconcile crea el Payment + `ORDER_CREATED` y `settlePlatformSub` (rama de `PaymentSettlementService`) emite `RENEWAL_SETTLED` con `kind:"renewal"`. Los cobros son **ingreso de la plataforma** - no entran a payouts ni devengo del actor. Dedup por `lastInvoiceId` + refId único + retry del Payment PENDING huérfano.
- **Efectos del settle**: ACADEMY → limpia `billingGraceUntil`/`billingBlockedAt` + proyecta `tier`/`billingCycle`; PRODUCER → `Person.proTier` = tierCode. Notifies `academy.billing_settled` / `producer.pro_settled` (con `recovered` si venía en gracia/bloqueo).
- **Mora** (`morose` normalizado): ACADEMY → fija `billingGraceUntil = now + academy_billing.grace_days` **solo si no hay gracia vigente** (no se extiende en cada barrido) + `academy.billing_grace`; PRODUCER → `producer.pro_renewal_failed`. Ambos emiten `RENEWAL_FAILED` sobre el último Payment de la sub, una vez por episodio (dedup por la invoice impaga más antigua, igual que membresías).
- **Cambio de plan**: upgrade de tier = swap inmediato (crea la remota nueva - cobra ya -, cancela la vieja inmediata, conmuta la fila; compensación cancel-new + restauración del puntero si la cancel vieja falla). Downgrade/cambio de ciclo = `pendingTierCode`/`pendingBillingCycle` + cancel remota `at_period_end` → cuando la remota reporta `CANCELED`, el reconcile hace `createSubscription` en el plan pendiente (cobra el 1er ciclo nuevo = inicio del nuevo ciclo) y limpia los pending. PATCH de vuelta al plan vigente con cambio pendiente → pending = vigente (la cancel remota no se puede deshacer; el swap recrea el mismo plan → continuidad del cobro).
- **Reminder pre-cobro**: misma ventana 24h y dedup `reminderSentFor` → `academy.billing_reminder` / `producer.pro_renewal_reminder`.
- **Enforcement suave Producer Pro**: tras liquidar una renovación se re-evalúa la facturación 90d; si supera el tope del tier vigente se agenda el tier que califica como pending (upgrade en próximo ciclo, sin cortar el período en curso) + `producer.pro_upgrade_required` una vez por tier requerido. Sobre el máximo autogestionado solo avisa (PRO_BIG manual). Nunca bloquea ventas en curso.
- **Enforcement de mora de academia (S3)**: en el mismo tick del cron 09:00 corre `PlatformSubscriptionsService.enforceAcademyBlocks` - academias con `billingGraceUntil < now` y `billingBlockedAt = null` pasan a bloqueadas (updateMany que repite la condición: un settle entremedio deja count=0 y no notifica un bloqueo falso) + `academy.billing_blocked` al owner (una vez por episodio - la condición excluye las ya bloqueadas). El bloqueo es **estado, no lazy check**: la escritura está gated centralmente en `AcademyAccess.requireManageWrite`/`requireAdministerWrite` (mutaciones de consola → 403 `{error:"billing.blocked"}`; las lecturas siguen por `requireManage`/`requireAdminister`), y **los endpoints de billing quedan exentos a propósito** (`POST /academies/:id/subscribe`, `PATCH /:id/subscription`, `POST /:id/subscription/cancel`, `GET /:id/billing` - el owner debe poder pagar para desbloquearse). Fuera de la consola: `GET /academies`, `GET /classes/browse`, `GET /styles/:id/landing` y la sugerencia "próxima clase" de /home filtran `billingBlockedAt: null`; `POST /classes/:id/book` y todo checkout hacia la academia (membership, clase suelta, particular, membership-subscription) rechazan con 400 `{error:"academy.unavailable"}` - copy honesto, la falta es del owner. El alumno conserva todo: `/academies/enrolled`, `/classes/mine`, `/classes/:id` y `/academies/:id/profile` siguen respondiendo y exponen `billingBlocked: true` para que la UI los marque "no disponible" (S6). `PATCH /private-lessons/:id` de staff también bloquea, pero el `cancel` del propio alumno queda abierto.
- **Gatillos compartidos**: el `subscription-webhook` público dispara ambos `reconcileAll` (mismo INBOUND auditado una vez); el cron 09:00 del `SubscriptionsScheduler` barre membresías **y** plataforma (+ `enforceAcademyBlocks`); `GET /academies/:id/billing` y `GET /producers/:id/pro` hacen refresh activo por sub como `GET /subscriptions/:id`.

### Recordatorios de renovación de plan (`AcademiesScheduler` → `AcademyRemindersService` - spec academy-renewal-reminders)

Segundo cron 09:00 (dominio academias, mismo patrón: provider fino + skip en `NODE_ENV=test`). `runDaily()` barre inscripciones `ACTIVE`/`ONLINE` con `endsAt` (TRIAL excluido a propósito: no es plan pagado) en dos ventanas y envía **email Resend + notificación in-app** por ciclo:

- **"Por vencer"**: `endsAt ∈ [now, now + academy.renewal.first_notice_days)` → mail con academia/plan/fecha y CTA a `/academias/:id`.
- **"En gracia"**: `endsAt ∈ [now - academy.renewal.grace_days, now)` → mail "tienes hasta `endsAt + grace` para pagar, si no no podrás agendar".
- **Dedup por ciclo**: `Enrollment.reminderExpiringFor`/`reminderExpiredFor` guardan el `endsAt` que gatilló cada aviso - renovar re-arma los dos; un mail fallido no marca (reintenta al día siguiente). `Enrollment` no tiene relación `Person` (`personId` suelto) - el servicio resuelve nombre/email con un `person.findMany` por lote; sin email igual va la notificación in-app y queda marcado.
- **Vigencia efectiva en reservas** (`resolveQuota` en `ClassesController`): inscripción con `endsAt` vencido solo resuelve cuota para clases `<= endsAt + grace_days` (el mismo param del mail - es lo que el aviso promete); vigente agenda libre, `endsAt` null nunca expira.
- **Owner notificado por pago**: `settleMembership` hace `notifySafe(academy.ownerId, type:"payment.membership.received")` dentro del bloque `paidNow` (compra online y renovaciones automáticas; nunca en webhook/reconcile duplicado). En claims MANUAL el owner ya recibe `payment_claim_new` al crearse el claim.

### Equipo de academia - colaboradores por capacidad (spec academy-staff-roles)

`AcademyStaff` modela al "administrativo" que no existía: una fila por `(academyId, personId)` con flags booleanos granulares - no es un rol único sino acceso configurable por persona (típico 2-3 colaboradores por academia). El owner nunca es fila staff; nadie se gestiona a sí mismo (400 `owner_not_staff`/`cannot_modify_self`). El instructor (`AcademyInstructor`) sigue siendo rol **operativo**: marca asistencia y ve alumnos/clases, pero no recibe capacidades administrativas.

| Capacidad | Abre |
|---|---|
| `students` | alumnos: listados, perfil, enrollments (crear/estado/`endsAt`), asistencia manual |
| `payments` | métodos de pago BYO, cola de comprobantes (aprobar/rechazar), `GET /payments/by-academy/:id` |
| `plans` | `MembershipPlan` CRUD |
| `schedule` | series, slots (horarios semanales), clases, videos |
| `profile` | `PATCH /:id/settings` (quórum default + perfil público) |
| `team` | `/:id/staff` CRUD + `PATCH /:id/instructors/:personId` (comisión) |
| `billing` | `/academies/:id/subscribe|subscription|billing` (SaaS de la academia) |

- **Gates en `AcademyAccess`** (ahora en `AcademyAccessModule` propio - payments lo consume sin ciclar academies⇄payments): `requireCapability`/`requireCapabilityWrite` (owner y `admin.access` pasan implícito; staff necesita el flag → 403 `{error:"academy.capability"}`), `requireStaff` (owner/staff/ADMIN - lecturas de equipo como el dashboard), `requireManage` (owner/staff/instructor/ADMIN - nivel operativo; cualquier fila staff cuenta, sus flags mandan en lo administrativo). `requireAdminister(Write)` queda para lo **no delegable** (CRM de academia, deletes).
- **Alta por email** (`AcademyStaffController` `POST /:id/staff`): si el correo no existe se crea `Person` stub `{email, name}` + invitación con **magic link de 7d** (`createMagicToken(email, consent, ttl)` - el login normal sigue en 15min); si ya existe solo se adjunta. `GET /:id/staff` lista con caps; `PATCH` por flag; `DELETE` quita acceso al instante. `GET /:id/access` devuelve `{isOwner,isAdmin,isInstructor,isStaff,caps}` - la consola filtra los ModuleCards con él (los gated por cap no pintan mientras resuelve, mismo criterio anti-flash que el owner-only previo). `GET /academies/mine` incluye academias donde eres staff.
- **Auditoría de validación de comprobantes**: `PaymentClaim.reviewedById→Person` + `reviewedAt`/`reviewNote` ya se escribían; `listClaims` ahora devuelve `reviewedBy{id,name}` y `/academia/cobros` muestra "Aprobado/Rechazado por {nombre} · {fecha}" - con varios colaboradores validando, el owner sabe quién ejecutó cada revisión.
- Toda escritura staff pasa por `*Write` → la academia en mora (`billingBlockedAt`) queda read-only también para colaboradores.

### Carga masiva para migración (spec academy-bulk-import)

`AcademyImportController`/`AcademyImportService` + parser propio `src/common/csv.ts` (comillas/`""`/\r\n/BOM, ≤2MB, ≤500 filas). Consola `/academia/importar` con plantillas descargables (`GET /academies/:id/import/template/students|schedule`) y reporte por fila.

- **`POST /:id/import/students`** (cap `students`): columnas `email,nombre,telefono?,plan,pagado_hasta?`. Person inexistente → stub + invitación magic link 7d (`studentInviteEmailHtml`); enrollment upsert (`endsAt = max`, plan por nombre case/acento-insensible). Resultado `imported|updated|invited|error` por fila.
- **`POST /:id/import/schedule`** (cap `schedule`): columnas `serie,estilo?,nivel?,dia_semana,hora_inicio,hora_fin,capacidad?,instructor_email?,mes?`. Agrupa por serie+mes → `ClassSeries` upsert + `ClassSlot` dedup (weekday+start+end) + `Class` del mes materializadas (misma lógica que `POST /series`). Resultado `ok|warn|error`; `instructor_email` desconocido → `warn`, no aborta.

### Gating Producer Pro (S5 - spec producer-pro)

Las features premium del productor responden 403 `{error:"pro.required", upgrade:true}` cuando el actor resuelto es el productor sin Pro efectivo (`isProActive`: `proTier != FREE || proTrialEndsAt > now`). El gate vive en el controller vía `assertProducerPro(prisma, producerId)` (`src/common/producer-pro.ts`) - es feature-gating por actor, no RBAC: se evalúa **después** de la autorización (owner/admin) y solo cuando el caller ES el productor dueño (admin operando recursos ajenos y actores `ACADEMY` del CRM pasan sin gate; el CRM de academia se gatea por su billing). Features gated:

- `GET /events/:id/analytics` - analítica avanzada del evento.
- `GET /events/:id/export.csv|pdf` y `GET /events/series/:seriesId/export.csv|pdf` - exports operativos.
- `POST /events/:id/staff` - gestión multi-staff (la lectura `GET /:id/staff` sigue abierta para el staff asignado).
- Todo el CRM del productor (`actorType=PRODUCER` en `/crm/*`: people, tags, scores, campañas, triggers) - gate centralizado en `assertActorAccess`.

Quedan FREE siempre: publicar/editar eventos, vender, check-in, `GET /events/mine`, `GET /events/:id/live`, y `GET /events/:id/ratings/summary` (resumen k-anonimizado del evento - lectura básica, no gated). Grandfathering: `Person.proTrialEndsAt` backfill +90d a productores con `ProducerParams` en la migración - ninguna feature que ya usaban se bloquea al desplegar. `GET /me` expone `proTier`/`proTrialEndsAt`/`effectivePro` solo a personas con rol PRODUCER APPROVED.

### Auditoría BIAN

- **Cada llamada Flow** pasa por `FlowGateway.call()` → `GatewayTxEntry` OUTBOUND en el `finally` (éxito, error HTTP y falla de red quedan auditados con `httpStatus`/`durationMs`/`error`); los callbacks entrantes (`customer-return`, `subscription-webhook`) registran `INBOUND_WEBHOOK` - el webhook de pagos deja su evidencia como `WEBHOOK_RECEIVED` en el ledger del Payment. El writer (`GatewayTransactionsService.record`) es **best-effort**: un fallo de escritura nunca rompe el pago - la auditoría es observador, no camino crítico.
- **Cada transición de pago** → `emitPaymentEvent` dentro de la tx → `PaymentEvent` hash-chain. `WEBHOOK_RECEIVED` se emite **siempre** (una re-notificación es evidencia aunque no produzca transición); `STATUS_CONFIRMED`, `SETTLED`/`RENEWAL_SETTLED`, `FAILED`, `AMOUNT_MISMATCH` solo en la transición real - el settle es idempotente y una re-notificación no llena el ledger.
- **Canonical JSON**: `canonicalJson(v) = JSON.stringify(sortKeys(JSON.parse(JSON.stringify(v))))` - round-trip a JSON puro *antes* de ordenar keys (Date→ISO, Decimal→número, `toJSON` a su forma serializada: exactamente lo que `jsonb` persiste), keys por codepoint (determinista sin ICU). Sin esto, releer un payload y re-stringificarlo produciría otro string y `verifyPaymentChain` reportaría tampering falso.
- **Verificación admin**: `GET /admin/payments/:id/verify-chain` re-calcula la cadena enlazada desde `GENESIS` → `{ok, events, firstBadSeq?}`; la evidencia completa se expone por `GET /payments/:id/events` (dueño/admin) y `browse payment-events` (admin).

## Observabilidad (winston - spec observability)

- **Backend**: `src/common/logging/logger.factory.ts` → `WinstonModule` en `main.ts` - todo `Logger` de Nest (servicios + logs internos del framework) sale por la misma instancia winston. Formato: `nestLike` con colores en dev, **JSON por línea** en `NODE_ENV=production` (stdout → cualquier collector). Nivel: `LOG_LEVEL`, default `debug` dev / `info` prod.
- **Request middleware** (`request-logger.middleware.ts`, `app.use` en main.ts - cubre también 404s fuera del pipeline Nest): hereda `x-request-id` entrante o genera UUID, lo devuelve en el response header y lo propaga por `AsyncLocalStorage` (`log-context.ts`) - todo log dentro del request lleva `requestId` sin pasarlo por parámetros. En `res.finish` emite una línea resumen: `type:"http.request"`, method, path (sin query), status, durationMs, ip y `personId` si la sesión resolvió. Nivel por status: info <400 / warn 4xx / error ≥5xx. Excluye `/api/health`, `/api/docs*` y favicon.
- **Redacción** (`redactMeta` + `redactValue`): claves cuyo nombre matchee `authorization|cookie|password|secret|token|jwt|session|qr` se enmascaran a `[redacted]` en cualquier nivel del meta - cinto y tirantes con la regla de no loggear credenciales ni payloads de QR. El código de negocio sigue obligado a no loggearlos; el redactor es la garantía ante errores.
- En dev el `requestId` se hace visible anexándolo al contexto (`Clase#ab12cd34`); en prod va como campo `requestId` del JSON.

## Seguridad HTTP (spec api-hardening)

- **helmet** (`app.use(helmet())` en `main.ts`, antes del request-logger): headers estándar (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS…). `contentSecurityPolicy: false` - la única superficie HTML es Swagger UI y usa scripts inline; el resto queda activo.
- **Rate limiting global** (`@nestjs/throttler` + `APP_GUARD` en `app.module.ts`): por IP, 300 req/60s default - holgado para la app y el polling del checkout. Al exceder: `429` + `Retry-After` y headers `X-RateLimit-*`. Storage in-memory (1 proceso; multi-instancia → Redis).
- **Límite estricto auth**: `@Throttle` en `POST /api/auth/magic-link`, `/api/auth/login`, `/api/auth/register` → 8 req/60s por IP (anti spam de correos / fuerza bruta). El limiter in-memory de logins fallidos por email+IP sigue como segunda capa.
- **Config por env** (`src/common/throttle.config.ts`, resuelto por request): `THROTTLE_GLOBAL_LIMIT` (300), `THROTTLE_AUTH_LIMIT` (8), `THROTTLE_TTL_MS` (60000). `skipIf` excluye contextos no-HTTP (socket.io) y `NODE_ENV=test` completo - los e2e levantan AppModule y disparan cientos de requests.
- **Exentos**: `GET /api/health` (`@SkipThrottle`); `/api/docs*` pasa por middleware Express fuera del pipeline de guards.

## Persistencia y seeds

- **Prisma + Postgres** (`localhost:5433` en docker-compose dev).
- Seeds idempotentes (`SEED_ENV=dev|prod`): `seed-common` (catálogos RBAC, permisos, estilos, badges, params por upsert) + `seed-dev` (demo Santiago, `*@omnidance.dev` logueables) / `seed-prod` (baseline + admin desde `SEED_ADMIN_EMAIL`).
- `prisma db push` en dev; el watch del API debe detenerse antes (lock del query engine).

## Docs operativas

- **Swagger UI**: `http://localhost:4000/api/docs` - OpenAPI JSON en `/api/docs-json`.
- **Export**: `node apps/api/scripts/export-api-docs.cjs` → `docs/openapi.json` + `docs/postman/omni-dance.postman_collection.json` (regenerar tras cambios de endpoints).
- **Flujos**: `docs/flows.md` (secuencias y estados en mermaid).
