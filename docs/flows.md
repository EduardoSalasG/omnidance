# Flujos — omni-dance

Secuencias y máquinas de estado de los flujos principales. Mantener sincronizado con los controllers en `apps/api/src/*/infrastructure/`.

## Autenticación — magic link

```mermaid
sequenceDiagram
    actor U as Bailarín
    participant W as Web (/login)
    participant A as API /api/auth
    participant M as Mailer (Resend / dev-log)
    participant DB as Postgres

    U->>W: ingresa email
    W->>A: POST /auth/magic-link {email}
    A->>DB: upsert Person + crea MagicLink(token, exp)
    A->>M: envía link /auth/verify?token=…
    M-->>U: email
    U->>A: GET /auth/verify?token=…
    A->>DB: consume token (1 uso, no expirado)
    A->>A: mint JWT (jose) — personId
    A-->>W: Set-Cookie omnidance_session (HttpOnly)
    W->>A: GET /me → {person, roles, roleStates}
    Note over W,A: POST /auth/logout borra la cookie
```

## Sesión de baile — invitar → confirmar → puntuar

```mermaid
sequenceDiagram
    actor A as Inviter
    actor B as Invitee
    participant API as SessionsController
    participant N as NotificationsService
    participant G as GamificationService
    participant DB as Postgres

    A->>API: POST /sessions/invite {inviteeId, eventId}
    API->>API: SessionsService: cooldown (session.cooldown_minutes),<br/>evento live, no auto-invitación
    API->>DB: DanceSession(status=PENDING)
    API->>N: notify B — session.invite
    B->>API: POST /sessions/:id/confirm
    API->>DB: status=CONFIRMED + confirmedAt
    API->>N: notify A — session.confirmed
    API->>G: evaluateBadgesFor(A) + evaluateBadgesFor(B)
    A->>API: POST /sessions/:id/rate {score…}
    API->>DB: SessionRating upsert + status=RATED
    API->>G: evaluateBadgesFor(rater) + evaluateBadgesFor(rated)
    Note over B: la contraparte puede puntuar igual —<br/>RATED sigue siendo rateable
```

```mermaid
stateDiagram-v2
    [*] --> PENDING: invite
    PENDING --> CONFIRMED: invitee confirm
    PENDING --> DECLINED: invitee decline
    PENDING --> EXPIRED: ventana expiró (effectiveStatus)
    CONFIRMED --> RATED: primer rating
    RATED --> RATED: rating contraparte (upsert)
    CONFIRMED --> EXPIRED: pasó la ventana sin rating
```

`RATED` y `CONFIRMED` cuentan como actividad para streaks/badges/misiones/leaderboard.

## Checkout → webhook → ticket

```mermaid
sequenceDiagram
    actor U as Comprador
    participant W as Web (/eventos/:id/checkout)
    participant API as CheckoutController
    participant GW as Pasarela (stub/Flow)
    participant WH as PaymentsController (webhook)
    participant N as NotificationsService
    participant DB as Postgres

    U->>W: POST /checkout/quote {eventId, code?}
    W->>API: quote → {amount, discount, fee(flat), total}
    U->>API: POST /checkout {eventId, quantity?, recipientIds?, code?}
    API->>API: PricingService + valida DiscountCode<br/>(vigencia, usos, XOR %/monto)<br/>+ recipients: existen, amigos ACCEPTED, sin ACTIVE<br/>+ recipientIds.length ≤ quantity-1
    API->>DB: Payment(PENDING, refId=tkt_…,<br/>quantity, recipients, eventId, discountCodeId)
    API->>GW: createPayment → redirectUrl
    API-->>W: {paymentId, redirectUrl}
    W->>GW: redirect
    GW->>WH: POST /payments/webhook {refId, status, signature}
    WH->>WH: verifica HMAC (Flow) / stub
    alt PAID (1ª vez — flag paidNow en tx)
        WH->>DB: tx: Payment→PAID + 1 Ticket comprador<br/>+ 1 por recipientId (giftedFromId=comprador)<br/>+ (quantity-1-R) reclamables (claimToken)<br/>+ DiscountRedemption
        WH->>N: notify payment.paid + ticket.gifted por recipient
    else PAID duplicado
        WH-->>GW: {duplicated:true} — sin doble ticket
    else FAILED
        WH->>DB: Payment→FAILED
        WH->>N: notify payment.failed
    end
    U->>API: GET /tickets/mine → ticket ACTIVE
```

El webhook resuelve la orden por `refId` (order-ref `tkt_<event>_<code>` embebido en `stub://pay/<refId>`); `eventId`/`discountCodeId` son desnormalización para reporting.

## Check-in en puerta (staff)

```mermaid
sequenceDiagram
    actor S as Staff (checkins.write)
    actor D as Asistente
    participant W as Web (/staff/[eventId])
    participant API as CheckinsController
    participant DB as Postgres

    D->>S: muestra QR personal (rotativo) o entrada
    S->>W: escanea con cámara
    W->>API: POST /checkins {eventId, qrToken}
    API->>API: CheckinsService: decodifica QR,<br/>resuelve Ticket o EntryPass
    alt Ticket ACTIVE
        API->>DB: Checkin + Ticket→USED
        API-->>W: 200 verde {person, ticket}
    else EntryPass vigente
        API->>DB: Checkin (note opcional)
        API-->>W: 201 {person, passId, passType}
    else Duplicado / sin entrada
        API-->>W: 409 ámbar {reason}
    end
    Note over S,API: POST /checkins/manual — sin QR,<br/>busca por nombre + note opcional
```

## Waitlist → promoción

```mermaid
sequenceDiagram
    actor U as Bailarín
    actor P as Productor/Staff (social.manage)
    participant API as WaitlistController
    participant N as NotificationsService
    participant DB as Postgres

    U->>API: POST /events/:id/waitlist → posición N WAITING
    P->>API: POST /events/:id/waitlist/promote {entryId}
    API->>DB: entry.status → PROMOTED
    API->>N: notify waitlist.promoted {eventId}
    U->>API: GET /events/:id/waitlist/me → PROMOTED
```

## Ciclo de asignación de rol

```mermaid
stateDiagram-v2
    [*] --> APPROVED: admin setRole<br/>(POST /admin/users/:id/roles)
    [*] --> PENDING: admin setRole<br/>(sin acceso aún)
    [*] --> SANDBOX: admin setRole<br/>(acceso limitado @AllowSandbox)
    PENDING --> APPROVED: admin setRole
    SANDBOX --> APPROVED: admin setRole<br/>(upgrade de acceso)
    APPROVED --> REJECTED: admin setRole<br/>(fila preservada — auditable)
    APPROVED --> [*]: admin DELETE /admin/users/:id/roles/:role
```

- No hay auto-solicitud de roles: el admin gestiona todo el ciclo desde `/admin/usuarios` (`role-requests` y `roles/request` fueron eliminados).
- `PENDING` y `REJECTED`: sin acceso, no aparece en `req.person.roles` (sí en `roleStates` de `/me`).
- `SANDBOX`: acceso solo a endpoints marcados `@AllowSandbox` (hoy `POST /academies`).

## Ticket — estados y transferencia

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: webhook PAID emite
    ACTIVE --> USED: check-in en puerta
    ACTIVE --> TRANSFERRED: POST /tickets/:id/transfer<br/>(ownerId→recipient, giftedFromId→owner previo)
    TRANSFERRED --> USED: check-in del nuevo dueño
    ACTIVE --> REFUNDED: (flujo futuro)
```

- `buyerId` **no cambia** al transferir (trazabilidad del comprador original).
- El ticket transferido queda `ACTIVE` — el nuevo dueño lo ve en `/entradas` y su QR.

## Entradas reclamables (claim links)

```mermaid
sequenceDiagram
    actor B as Comprador
    actor R as Reclamante (puede no estar registrado)
    participant W as Web
    participant API as API

    Note over B: orden quantity=N, sobrantes sin amigo →<br/>N-1-R tickets ACTIVE con claimToken (owner=comprador)
    B->>W: wallet / éxito del checkout → botón WhatsApp<br/>https://wa.me/?text=…/reclamar/<claimToken>
    R->>W: abre /reclamar/<token> (pública)
    W->>API: GET /tickets/claim/<token> → {buyerName, event} | 404
    alt sin sesión
        W-->>R: "Crea tu cuenta y reclama" → /login?mode=register&next=/reclamar/<token>
    end
    R->>API: POST /tickets/claim/<token> (sesión)
    API->>API: updateMany({id, claimToken}) atómico:<br/>ownerId→reclamante, giftedFromId→comprador,<br/>claimedAt=now, claimToken=null
    API-->>R: 200 {ticketId} | 404 token quemado | 409 self/no-ACTIVE
    API->>B: notify ticket.claimed
```

- El `claimToken` (16 bytes hex) vive en `Ticket` — sin tabla extra. Un ticket reclamable es `ACTIVE` con `claimToken != null` y `claimedAt = null`.
- `paymentId` en cada ticket vincula exacto con la orden que lo emitió (trazabilidad compra→ticket).
- Transferir manual (`POST /tickets/:id/transfer`) **quema** el claimToken — el link viejo muere.

## Discovery social

```mermaid
flowchart LR
    subgraph Public["Público (sin sesión)"]
        AV["GET /availability<br/>quién está disponible"]
        PR["GET /partner-requests<br/>feed de búsqueda de pareja"]
        ST["GET /styles · GET /venues<br/>catálogos"]
    end
    subgraph Auth["Con sesión"]
        PAV["POST /availability<br/>upsert toggle + until/location"]
        PPR["POST /partner-requests<br/>{styleId?, role, note?}"]
        CPR["POST /partner-requests/:id/close"]
        RSVP["POST /events/:id/rsvp<br/>+ GET /me/rsvp (precarga)"]
    end
    Auth --> Public
```

- `GET /me/rsvp` devuelve el RSVP propio por evento — la UI precarga el estado sin endpoint por-evento.
- `availability` es upsert por personId; `until`/`location` ausentes limpian a null.
- `partner-requests` valida `styleId` contra el catálogo (de `/api/styles`); el join person/style es manual (schema sin relaciones).

## Admin — parámetros y auditoría

```mermaid
sequenceDiagram
    actor Ad as Admin (admin.access)
    participant API as AdminController / ParamsController
    participant DB as Postgres

    Ad->>API: PUT /admin/params/:key {value}
    API->>DB: upsert PlatformParam + AuditLog(PARAM_UPDATE)
    Note over API,DB: efecto inmediato — cache 30s<br/>(fees, cooldown, QR, Prime Time)
    Ad->>API: POST /admin/roles/:key/permissions {permissionKey}
    API->>DB: upsert RolePermission + AuditLog + invalidateRoleCatalog()
    Note over API,DB: efecto inmediato — el guard<br/>relee el catálogo sin esperar TTL
```

## Venta en puerta (door-sale, cuenta ligera)

```mermaid
sequenceDiagram
    actor S as Staff / Productor / Admin
    participant API as CheckinsController
    participant Dom as CheckinsService
    participant DB as Postgres
    participant QR as QrService

    S->>API: POST /checkins/door-sale {eventId, channel, name, phone}
    API->>Dom: doorSale(input, actor)
    Dom->>DB: evento existe + PUBLISHED/LIVE (si no → 409)
    Dom->>DB: autorización: superuser | producerId | checkins.write+StaffAssignment
    Dom->>DB: doorCap: checkins MANUAL no anulados < cap
    alt phone ya existe
        Dom->>DB: reutiliza Person
    else cuenta ligera
        Dom->>DB: create Person{isLightAccount, phone} + rol DANCER APPROVED
    end
    Dom->>DB: tx: Ticket USED (doorPrice + fee del canal) + Checkin MANUAL
    Dom->>QR: mint(personId) → qrToken para mostrar al instante
    API-->>S: {person, ticket, checkin, qrToken}
```

## Prime Time — contador → reveal

```mermaid
sequenceDiagram
    actor DJ as Pantalla/DJ (público)
    participant API as EventGamificationController
    participant Dom as GamificationService
    participant DB as Postgres

    DJ->>API: GET /events/:id/prime-time
    Dom->>DB: confirmedSessionsForEvent (retroDeclared:false!)
    Note over Dom: ventana happyHour, umbral<br/>override | 20% aforo (param)
    API-->>DJ: {current, threshold, unlocked, window}

    DJ->>API: GET /events/:id/prime-time/reveal
    alt no desbloqueado
        API-->>DJ: {unlocked:false}
    else desbloqueado, antes del fin de ventana
        API-->>DJ: {unlocked:true, revealed:false}
    else reveal
        Dom->>DB: ratedSessionsForEvent (sin retro) + styleRoles
        Note over Dom: bayes (Σv+C·m)/(n+C), ≥3 eval<br/>leader/follower + pareja mutua ≥4
        Dom->>DB: PersonBadge prime_time_crown +7d (idempotente)
        API-->>DJ: {bestLeader, bestFollower, coupleOfTheNight}
```

## Puntos de temporada (PointLedger)

```mermaid
sequenceDiagram
    participant C as Sessions/Checkins Controller
    participant Dom as GamificationService
    participant DB as Postgres

    Note over C: hooks tras confirm / rate / check-in temprano / misión
    C->>Dom: accruePoints(personId, reason, refType, refId)
    Dom->>DB: findLedgerEntry (idempotente por ref)
    Dom->>DB: activeSeason → PointLedger{seasonId?, points}
    Note over Dom: session_confirmed 10 · rating_closed 5<br/>early_checkin 15 · mission_completed 20
    C->>Dom: GET /gamification/me/points → {seasonId, total, byReason}
```

## Bloques y amistades (safety/social)

```mermaid
sequenceDiagram
    actor U as Usuario
    participant API as Blocks/Friends/Sessions Controllers
    participant DB as Postgres

    U->>API: POST /blocks {personId} — silencioso, sin notificación
    U->>API: POST /sessions/invite|declare
    API->>DB: UserBlock (invitee → inviter) existe?
    Note over API: sí → 403 genérico "no se puede enviar la invitación"<br/>NUNCA revelar que existe el bloqueo

    U->>API: POST /friends {personId} → PENDING + notifica al destinatario
    Note over DB: aId=solicitante, bId=destinatario<br/>solo bId acepta; ambos pueden borrar
    U->>API: GET /friends → {friends, pendingReceived, pendingSent}
```

## Check-in — salida y anulación

```mermaid
sequenceDiagram
    actor P as Persona / Staff
    participant API as CheckinsController
    participant DB as Postgres

    P->>API: POST /checkins/:id/out — dueño o checkins.write, idempotente
    P->>API: POST /checkins/:id/void {reason} — staff asignado o admin
    API->>DB: tx: voidedAt+reason, pase USED→ACTIVE, AuditLog CHECKIN_VOID
```

## Productor — ciclo de vida del evento

```mermaid
stateDiagram-v2
    [*] --> DRAFT: POST /events (events.manage)<br/>+ scheduleBlocks + DJs en la misma tx
    DRAFT --> PUBLISHED: POST /events/:id/publish (owner|admin)
    PUBLISHED --> LIVE: staff activa (manual)
    DRAFT --> CANCELLED: POST /events/:id/cancel
    PUBLISHED --> CANCELLED: POST /events/:id/cancel
    LIVE --> CANCELLED: POST /events/:id/cancel
    LIVE --> CLOSED: fin del evento
    note right of DRAFT: PATCH solo editable en DRAFT/PUBLISHED<br/>scheduleBlocks/djIds reemplazan en tx
    note right of PUBLISHED: check-ins y door-sale<br/>solo PUBLISHED|LIVE
```

## Pase de serie — compra → webhook → check-in

```mermaid
sequenceDiagram
    actor U as Bailarín
    participant API as CheckoutService
    participant GW as Pasarela
    participant WH as WebhookController
    participant DB as Postgres
    participant CK as CheckinsService

    U->>API: POST /checkout/series-pass {seriesId, month:"YYYY-MM"}
    API->>DB: serie activa + ¿ya tiene pase? (409)
    API->>DB: params series_pass.price_clp + service_fee
    API->>GW: createOrder (refId sp_<series>_<mes>_<uuid>)
    API-->>U: {paymentUrl, paymentId}
    GW->>WH: POST /payments/webhook PAID
    WH->>DB: tx: paidNow + SeriesPass.upsert(@@unique serie+persona+mes)
    WH->>DB: notifySafe payment.series_pass
    Note over U,CK: la noche del evento de la serie…
    U->>CK: POST /checkins (scan QR)
    CK->>DB: ticket? → entryPass? → SeriesPass(event.seriesId, mes actual)
    Note over CK: passType SERIES_PASS — NO se marca USED<br/>(mensual reutilizable)
```

## Payouts — liquidación del productor

```mermaid
sequenceDiagram
    actor Ad as Admin
    actor Pr as Productor
    participant API as AdminPayouts/MePayouts
    participant DB as Postgres

    Ad->>API: POST /admin/payouts/generate {actorType:PRODUCER, actorId, periodo}
    API->>DB: Σ Payment PAID (TICKET por eventId del producer<br/>+ SERIES_PASS por refId→serie del producer)
    API->>DB: Payout PENDING (idempotente actor+período) + AuditLog
    Ad->>API: POST /admin/payouts/:id/approve → APPROVED
    Ad->>API: POST /admin/payouts/:id/pay {evidenceUrl} → PAID + paidAt
    Pr->>API: GET /me/payouts (crm.manage) → solo los suyos
```

## CRM — score → segmento → campaña/trigger

```mermaid
sequenceDiagram
    actor P as Productor/Academia
    participant API as CrmController/Service
    participant DB as Postgres
    participant CRON as CrmTriggersScheduler

    P->>API: POST /crm/scores/recompute {actorType, actorId}
    API->>DB: universo (checkins+payments del actor) → upsert RelationshipScore
    Note over API: score=min(100, att*10+spend/1000+ref*15)<br/>segment NEW|AT_RISK|BRINGS_PEOPLE|CORE
    P->>API: POST /crm/people/tags + campañas DRAFT
    P->>API: POST /crm/campaigns/:id/send
    API->>DB: resuelve segmento (tags|segment|personIds)<br/>→ notifySafe ×N (+DiscountCode CAMPAIGN si aplica)
    CRON->>API: diario 09:00 → evaluateAllActiveTriggers
    API->>DB: WINBACK: inactivos > crm.winback_days → notify<br/>(cooldown anti-spam 7d)
```

## Notificaciones — fan-out tiempo real

```mermaid
sequenceDiagram
    participant Dom as Cualquier dominio
    participant NS as NotificationsService
    participant DB as Postgres
    participant WS as NotificationsGateway
    participant WP as WebPushSender
    actor U as App del usuario

    Dom->>NS: notify(personId, input) / notifySafe
    NS->>DB: create Notification (IN_APP)
    NS->>WS: emitToPerson → room person:{id}
    WS-->>U: event "notification" (socket.io,<br/>auth por cookie de sesión en handshake)
    NS->>WP: sendToPerson (PushTokens de la persona)
    WP-->>U: Web Push (VAPID; no-op seguro sin keys,<br/>404/410 limpia el token muerto)
    Note over NS: ambos best-effort — un fallo de WS/push<br/>nunca rompe el notify ni el dominio origen
```

## Liquidaciones — payouts por actor

```mermaid
sequenceDiagram
    actor Ad as Admin
    participant API as AdminPayoutsController
    participant DB as Postgres
    actor Ow as Productor/Dueño academia/venue

    Ad->>API: POST /admin/payouts/generate {actorType, actorId, período}
    API->>DB: idempotente: payout existente → devuelve sin recalcular
    Note over API,DB: PRODUCER: tickets de sus eventos + series-pass de sus series<br/>ACADEMY/VENUE: tickets PAID de eventos con<br/>academyId|venueId=actorId AND producerId=null<br/>(entidad produjo directo — con productor, éste devenga)<br/>gross = Σ amount · net = gross − Σ fee
    API->>DB: create Payout PENDING + AuditLog PAYOUT_GENERATE
    Ad->>API: POST /admin/payouts/:id/approve → APPROVED
    Ad->>API: POST /admin/payouts/:id/pay {evidenceUrl} → PAID + paidAt
    Ow->>API: GET /me/payouts (crm.manage)
    API->>DB: PRODUCER por personId + ACADEMY por Academy.ownerId<br/>+ VENUE por Venue.ownerId → unión
```

## Comisión parametrizable — cadena de resolución

```mermaid
flowchart TD
    A[checkout ticket / webhook PAID] --> B{event.serviceFeeClp != null?}
    B -->|sí| C[fee = event.serviceFeeClp<br/>override admin por evento]
    B -->|no| D[fee = param service_fee.presale_clp]
    D --> E[→ env SERVICE_FEE_CLP → default shared]
    C --> F[quote = listPrice + fee − descuento]
    E --> F
    F --> G[Payment.amount / Payment.fee]
    H[POST/PATCH /events con serviceFeeClp] --> I{admin.access?}
    I -->|sí| J[persiste override · null limpia]
    I -->|no| K[403 — solo admin fija comisión]
```
