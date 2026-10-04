# Design — dancer-profile-survey-analytics

## Decisiones

1. **`gender` enum `M|F|OTHER` nullable** — sin "prefiero no decir": no declarar ya cubre ese caso (decisión del usuario).
2. **`overall` nuevo en `EventRating`** — el modelo ya tiene las otras 6 dims; solo falta la general.
3. **Escalas bipolares en UI, no en schema** — `occupation`/`temperature` siguen siendo `Int 1-5`; las etiquetas de extremos viven en i18n y la analítica interpreta promedio como nivel.
4. **Elegibilidad por `Checkin`** — solo asistencia real alimenta métricas (decisión del usuario).
5. **Trigger lazy, sin cron**: el primer request post-`endsAt` de un asistente (`GET /home/stats` o al cargar `/inicio`) dispara el fan-out de `notifySafe` una vez por evento (dedupe por notificación existente o flag). Alternativa: marcar `surveyNotifiedAt` en `Event` — preferible, un solo campo, idempotente.
6. **Leader/follower por género del evento**: para cada asistente, su rol = `PersonStyleRole` en estilos cuyo `genre` intersecta los géneros del evento (resueltos con herencia de serie). Múltiples roles → prioridad LEADER>FOLLOWER>SWITCH? No: si baila ambos, SWITCH. Regla: set de roles en esos estilos; 1 rol → ese; >1 → SWITCH.

## Piezas

### API

- Schema: `enum Gender {M F OTHER}`; `Person.gender Gender?`; `EventRating.overall Int?`; `Event.surveyNotifiedAt DateTime?` (dedupe fan-out).
- `people.controller`: `PATCH /me/profile` `{name?, gender?, styleRoles: [{styleId, role, level?}]}` — upsert/replace de `PersonStyleRole` en transacción; `GET /me` expone `gender`+`styleRoles`.
- `styles.controller` (nuevo o en social): `GET /api/styles` → catálogo `{id,name,genre}` ordenado por género.
- `event-ratings.controller`: DTO gana `overall @IsInt @Min(1) @Max(5)`; el `POST` ya valida ventana — **agregar check de `Checkin`** (hoy la ventana es la única condición; la spec nueva exige asistencia real).
- Trigger encuesta: en `home.service` (o donde /inicio resuelve) — si `me` tiene check-in en evento con `endsAt` pasado <24h y `surveyNotifiedAt` null → transacción set flag + `notifySafe` a todos los asistentes del evento (o lazy por usuario: notify solo a `me`, flag por `(eventId, personId)` — más simple: notificación única por persona vía dedupe de `Notification` o tabla ligera). Decisión: `Event.surveyNotifiedAt` + fan-out de todos los asistentes en ese momento (una query de checkins, un loop de notifySafe).
- `GET /api/events/:id/analytics`: guard owner(`event.producer.ownerId`) o permiso `analytics`/admin vía `roleKeysHavePermission`. Queries: count Checkin no voided → join Person (gender) → join PersonStyleRole×Style (genre del evento) → agregaciones; ratings agregados con umbral ≥3.

### Web

- `/perfil`: sección "Cómo bailas" — segmented M/F/Otro + lista de estilos por género con toggle Leader/Follower/Ambos + nivel opcional; guardar → `PATCH /me/profile`.
- `/inicio`: card de encuesta si `GET /api/me/pending-surveys` (o campo en home/stats) devuelve eventos evaluables.
- `/eventos/[id]/evaluar`: página client — `StarRating` por dimensión, labels bipolares, "Evaluar más" expandible, submit → `POST /events/:id/ratings`.
- `/productor/eventos/[id]`: sección Analítica (cards + barras proporción + estrellas promedio).
- Sidebar/BottomNav: item "Analítica" para producer (→`/productor/analitica` lista de eventos) y admin (→ `/analitica` lens admin); quitar analítica del grupo admin.
- i18n: `profile.danceStyles`, `survey.*`, `eventAnalytics.*`.

### Datos

- Migración additive-only (`gender`, `overall`, `surveyNotifiedAt`) — sin backfill.
- Seed: declarar género + styleRoles a las personas demo para que la analítica tenga datos.

## Riesgos

- **Elegibilidad estricta por check-in** reduce volumen de encuestas en eventos sin staff — aceptado (métricas solo de asistencia real).
- **`styleRoles` replace-set**: la UI debe mandar el set completo; PATCH parcial de género no debe pisar styleRoles si no viene (campos independientes).
- **K-anonymity**: ratings summary existente ya aplica umbral — reusar la misma lógica.

## Testing

- e2e: PATCH profile (gender + styleRoles replace), GET styles, survey gate por check-in + ventana + upsert + overall, analytics endpoint (403 no-owner, k-anonymity, proporciones), trigger de notificación.
- Suite completa + tsc + i18n audit + probes.

## Addendum del orquestador — decisiones resueltas (post-auditoría 2026-10-04)

La auditoría de código mostró que buena parte de la infra ya existe; estas
decisiones atan las ambigüedades ANTES de despachar implementación:

1. **No existe `PATCH /me/profile`** — `gender` va en `PATCH /me` (DTO
   existente, junto a instagram/name/phone); los styleRoles siguen por
   `PUT /me/style-roles` (ya hace replace-set transaccional idempotente).
   Sin endpoint duplicado ni doble write-path.
2. **`overall` es una dim más, opcional en API** (`@IsInt @Min(1) @Max(5)`,
   igual que las otras); la encuesta web lo exige en UI. La gate de
   Checkin no-voided y la ventana 24h YA existen — no duplicar.
3. **`GET /me/pending-surveys`** — endpoint propio en `people.controller`
   (global, no por lente): eventos con checkin no-voided del viewer,
   `now ∈ (endsAt, endsAt+24h]` y sin `EventRating` propia →
   `[{eventId, name, endsAt}]`.
4. **Fan-out lazy vive en `pending-surveys`**: por cada evento elegible,
   claim atómico `updateMany({id, surveyNotifiedAt:null} → set)` — el
   request ganador hace `notifySafe` a TODOS los asistentes (checkin
   no-voided, `distinct personId`). Nada de findUnique+update (race).
   Notif: `type: "event.survey"`, category SOCIAL, `data: {eventId}`.
5. **`hrefFor` en `/notificaciones`**: case `event.survey` →
   `/eventos/${eventId}/evaluar`.
6. **Card `/inicio`**: `HomeHub` muestra la card si pending-surveys
   devuelve items — cualquier lente (un producer que bailó también
   evalúa). Sin fetch si el campo viene vacío.
7. **Ventana de rating sin cota inferior**: se permite evaluar durante
   el evento (LIVE) — la ventana existente `now ≤ endsAt+24h` queda.
8. **`GET /styles`**: `orderBy [{genre},{name}]`, shape plano intacto.
9. **Analytics shape** `GET /events/:id/analytics` (owner del evento o
   admin): `{attendees, genderSplit:{M,F,OTHER,unknown}, roleSplit:
   {leader,follower,both}, ratings:{count, byDim:{overall, music,
   venue, dj, production, organization, floorComfort, lightingSound}}}`
   — `genderSplit`/`roleSplit`/`ratings` devuelven `null` si
   `attendees < EXPOSURE_THRESHOLD` (3) — mismo umbral k-anonymity que
   ratings summary (la composición de 1-2 asistentes también expone).
   RoleSplit: herencia de serie cuando la clase/evento la define
   (mismo mecanismo que los styleRoles del evento si existe).
10. **Sidebar**: NO crear `/productor/analitica` — `/analitica` ya lista
    los eventos del producer. Mover el item fuera del grupo admin a un
    grupo propio "Analítica"; quitar la card analítica de `/admin`.
11. **`people.controller.spec.ts` nuevo** (patrón TestingModule+Prisma
    de `events.controller.spec.ts`); `HomeModule`/`PeopleModule` que
    haga el fan-out importa `NotificationsModule` (no @Global).
12. **Slice order**: S1 schema+seed → S2 API (perfil+encuesta+analytics)
    → S3 web → verificación del orquestador. Implementación serial.
